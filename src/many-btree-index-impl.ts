/**
 * ManyBTreeIndexImpl - ManySortedIndex backed by a B+ tree of subindexes
 */

import type { ChangeDomain } from "chchchchanges"
import type BTreeType from "sorted-btree"
import BTreeModule from "sorted-btree"
// Handle ESM/CJS interop - the module might have a default property
const BTree = (BTreeModule as unknown as { default?: typeof BTreeType }).default ?? BTreeModule
import type { ManySortedIndex, SortedView, IndexBase } from "./interfaces.js"
import type { ManyBTreeSpec, SortDirection } from "./specs.js"
import type {
  AddResult,
  RemoveResult,
  SortKey,
  SortQuery,
  SingleSortKey,
  PartialSortKey,
} from "./types.js"
import { IndexImplBase, SubindexImpl, getFilterFn } from "./index-impl-base.js"
import { parseSortKeySpec, ParsedSortKey, compareKeys } from "./sort-compare.js"
import { SortedViewImpl, SortedDataSource } from "./sorted-view-impl.js"

/**
 * ManySortedIndex implementation backed by a B+ tree of subindexes.
 *
 * Each key maps to a subindex containing zero or more items.
 * Keys are maintained in sorted order using a B+ tree.
 *
 * B+ trees provide better performance for large datasets and frequent
 * insertions/deletions compared to sorted arrays.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (extends SingleSortKey)
 * @typeParam SUBIX - The subindex type
 */
export class ManyBTreeIndexImpl<I, K extends SingleSortKey, SUBIX extends IndexBase<I>>
  extends IndexImplBase<I, K>
  implements ManySortedIndex<I, SUBIX, K, PartialSortKey<K>>, SortedDataSource<I>
{
  private readonly btree: BTreeType<SortKey, SUBIX>
  private readonly parsedKey: ParsedSortKey<I>
  private readonly createSubindex: () => SUBIX
  private readonly view: SortedViewImpl<I, PartialSortKey<K>>

  constructor(
    domain: ChangeDomain | null,
    spec: Omit<ManyBTreeSpec<I, K, SUBIX>, "subindex">,
    createSubindex: () => SUBIX,
  ) {
    const parsedKey = parseSortKeySpec(spec.key)

    super({
      domain,
      keyFn: (item: I) => parsedKey.getKey(item) as K,
      keySetFn: parsedKey.setKey as ((item: I, value: K) => void) | null,
      filterFn: getFilterFn(spec.filter),
      subindexFn: null, // We override getOrCreateSubindex
    })

    this.parsedKey = parsedKey
    this.createSubindex = createSubindex

    // Create BTree with custom comparator based on our sort key directions
    const directions = parsedKey.directions
    this.btree = new BTree<SortKey, SUBIX>(undefined, (a: SortKey, b: SortKey) =>
      compareKeys(a, b, directions),
    )

    this.view = SortedViewImpl.create<I, PartialSortKey<K>>(this)
  }

  // ===========================================================================
  // SortedDataSource implementation (for SortedView)
  // ===========================================================================

  *iterateRange(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I> {
    const directions = this.parsedKey.directions

    if (reversed) {
      // Descending iteration over keys
      const startKey = query.le ?? query.lt
      const skipStart = query.lt !== undefined
      const endKey = query.ge ?? query.gt
      const skipEnd = query.gt !== undefined

      for (const [key, subindex] of this.btree.entriesReversed(startKey, undefined, skipStart)) {
        // Check if we've gone past the lower bound
        if (endKey !== undefined) {
          const cmp = compareKeys(key, endKey, directions)
          if (skipEnd ? cmp <= 0 : cmp < 0) {
            break
          }
        }

        // Iterate subindex in reverse
        const sortedSubindex = subindex as IndexBase<I> & {
          iterateRange?(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I>
        }
        if (sortedSubindex.iterateRange) {
          yield* sortedSubindex.iterateRange({} as SortQuery<SortKey>, true)
        } else {
          // Fallback: collect and reverse
          const items = Array.from(subindex)
          for (let j = items.length - 1; j >= 0; j--) {
            yield items[j]!
          }
        }
      }
    } else {
      // Ascending iteration over keys
      const startKey = query.ge ?? query.gt
      const skipStart = query.gt !== undefined
      const endKey = query.le ?? query.lt
      const skipEnd = query.lt !== undefined

      let skippedFirst = false
      for (const [key, subindex] of this.btree.entries(startKey)) {
        // Skip first entry if using gt (exclusive)
        if (skipStart && !skippedFirst) {
          skippedFirst = true
          if (startKey !== undefined && compareKeys(key, startKey, directions) === 0) {
            continue
          }
        }

        // Check if we've gone past the upper bound
        if (endKey !== undefined) {
          const cmp = compareKeys(key, endKey, directions)
          if (skipEnd ? cmp >= 0 : cmp > 0) {
            break
          }
        }

        yield* subindex
      }
    }
  }

  countInRange(query: SortQuery<SortKey>): number {
    // Count by iterating - BTree doesn't support O(1) range count
    return Array.from(this.iterateRange(query, false)).length
  }

  getDirections(): SortDirection[] {
    return this.parsedKey.directions
  }

  // ===========================================================================
  // Override getOrCreateSubindex for BTree key management
  // ===========================================================================

  protected override getOrCreateSubindex(key: K): SubindexImpl<I> {
    const existing = this.btree.get(key as SortKey)
    if (existing) {
      return asSubindexImpl(existing)
    }

    // Create new subindex
    const subix = this.createSubindex()

    // Set parent reference if the subindex supports it
    if (subix instanceof IndexImplBase) {
      subix.parent = this as unknown as IndexImplBase<I, unknown>
      subix.keyInParent = key
    }

    this.btree.set(key as SortKey, subix)
    return asSubindexImpl(subix)
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    const subindex = this.btree.get(key as SortKey)
    if (!subindex) return null
    return asSubindexImpl(subindex)
  }

  protected addValueWithKey(): void {
    // Not used - we override getOrCreateSubindex
  }

  protected removeValueWithKey(key: K): void {
    this.btree.delete(key as SortKey)
  }

  protected clearValues(): void {
    for (const [, subindex] of this.btree.entries()) {
      asSubindexImpl(subindex).clear()
    }
    this.btree.clear()
  }

  protected isUnique(): boolean {
    return false
  }

  // ===========================================================================
  // ManySortedIndex interface implementation
  // ===========================================================================

  /**
   * Add an item to the index. Returns the item.
   */
  add(item: I): I {
    this.addInternal(item)
    return item
  }

  /**
   * Remove an item from the index.
   */
  remove(item: I): RemoveResult {
    return super.remove(item)
  }

  /**
   * Check if an item is in the index
   */
  has(item: I): boolean {
    const addedItem = this.getAddedItem(item)
    if (!addedItem || !addedItem.included) {
      return false
    }
    const key = addedItem.key
    if (key === null) {
      return false
    }
    const subindex = this.btree.get(key as SortKey)
    if (!subindex) {
      return false
    }
    return (subindex as unknown as { has?(item: I): boolean }).has?.(item) ?? true
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    this.trackKeyAccess(key)
    return this.btree.has(key as SortKey)
  }

  /**
   * Get the subindex for a key, or null if not found
   */
  tryGet(key: K): SUBIX | null {
    this.trackKeyAccess(key)
    return this.btree.get(key as SortKey) ?? null
  }

  /**
   * Get the subindex for a key.
   * If the key is not found, creates an empty subindex and assigns it to the key.
   */
  get(key: K): SUBIX {
    this.trackKeyAccess(key)
    if (!this.btree.has(key as SortKey)) {
      this.getOrCreateSubindex(key)
    }
    return this.btree.get(key as SortKey)!
  }

  /**
   * Iterator over all keys in sorted order
   */
  get keys(): IterableIterator<K> {
    return this.btree.keys() as IterableIterator<K>
  }

  /**
   * Iterator over all included items (across all subindexes) in sorted key order
   */
  get items(): IterableIterator<I> {
    return this.allItems()
  }

  /**
   * Make the index iterable
   */
  [Symbol.iterator](): Iterator<I> {
    return this.allItems()
  }

  private *allItems(): IterableIterator<I> {
    for (const [, subindex] of this.btree.entries()) {
      yield* subindex
    }
  }

  // ===========================================================================
  // SortedView interface implementation
  // ===========================================================================

  /**
   * Returns a view where iteration runs in reverse order
   */
  reverse(): SortedView<I, PartialSortKey<K>> {
    return this.view.reverse()
  }

  /**
   * Returns a view bounded by the given range query
   */
  query(q: SortQuery<PartialSortKey<K>>): SortedView<I, PartialSortKey<K>> {
    return this.view.query(q)
  }

  // ===========================================================================
  // SubindexImpl-compatible methods (for use as a subindex in nested Many indexes)
  // ===========================================================================

  /**
   * Add an item, returning AddResult (for subindex use)
   */
  addItem(item: I): AddResult {
    return this.addInternal(item)
  }

  /**
   * Remove an item, returning RemoveResult (for subindex use)
   */
  removeItem(item: I): RemoveResult {
    return super.remove(item)
  }
}

/**
 * Helper to convert an IndexBase to a SubindexImpl.
 */
function asSubindexImpl<I>(index: IndexBase<I>): SubindexImpl<I> {
  const impl = index as IndexBase<I> & {
    addItem?(item: I): AddResult
    removeItem?(item: I): RemoveResult
    hasAddedItems?(): boolean
    clear?(): void
    addInternal?(item: I): AddResult
  }

  return {
    add: (item: I) => {
      if (impl.addItem) {
        return impl.addItem(item)
      }
      if (impl.addInternal) {
        return impl.addInternal(item)
      }
      impl.add(item)
      return { countChange: 1 }
    },
    remove: (item: I) => {
      if (impl.removeItem) {
        return impl.removeItem(item)
      }
      return { countChange: 0 }
    },
    hasAddedItems: () => {
      if (impl.hasAddedItems) {
        return impl.hasAddedItems()
      }
      return (index as { count?: number }).count !== 0
    },
    clear: () => {
      if (impl.clear) {
        impl.clear()
      }
    },
  }
}

/**
 * Wrapper to use ManyBTreeIndexImpl as a SubindexImpl
 */
export function asManyBTreeSubindex<I, K extends SingleSortKey, SUBIX extends IndexBase<I>>(
  index: ManyBTreeIndexImpl<I, K, SUBIX>,
): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
