/**
 * ManySortedIndexImpl - ManySortedIndex backed by a sorted Array of subindexes
 */

import type { ChangeDomain } from "chchchchanges"
import type { ManySortedIndex, SortedView, IndexBase } from "./interfaces.js"
import type { ManySortedSpec, SortDirection } from "./specs.js"
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
 * Entry in the sorted array: key + subindex
 */
interface SortedEntry<K, SUBIX> {
  key: K
  subindex: SUBIX
}

/**
 * ManySortedIndex implementation backed by a sorted array of subindexes.
 *
 * Each key maps to a subindex containing zero or more items.
 * Keys are maintained in sorted order.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (extends SingleSortKey)
 * @typeParam SUBIX - The subindex type
 */
export class ManySortedIndexImpl<I, K extends SingleSortKey, SUBIX extends IndexBase<I>>
  extends IndexImplBase<I, K>
  implements ManySortedIndex<I, SUBIX, K, PartialSortKey<K>>, SortedDataSource<I>
{
  private readonly sortedEntries: SortedEntry<K, SUBIX>[] = []
  private readonly parsedKey: ParsedSortKey<I>
  private readonly createSubindex: () => SUBIX
  private readonly view: SortedViewImpl<I, PartialSortKey<K>>

  constructor(
    domain: ChangeDomain | null,
    spec: Omit<ManySortedSpec<I, K, SUBIX>, "subindex">,
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
    this.view = SortedViewImpl.create<I, PartialSortKey<K>>(this)
  }

  // ===========================================================================
  // SortedDataSource implementation (for SortedView)
  // ===========================================================================

  /**
   * Find the entry index range [start, end) for a query using binary search.
   */
  private findEntryRange(query: SortQuery<SortKey>): { start: number; end: number } {
    const directions = this.parsedKey.directions
    let start = 0
    let end = this.sortedEntries.length

    // Find start index based on lower bound (gt or ge)
    if (query.gt !== undefined) {
      start = this.findUpperBoundEntry(query.gt, directions)
    } else if (query.ge !== undefined) {
      start = this.findLowerBoundEntry(query.ge, directions)
    }

    // Find end index based on upper bound (lt or le)
    if (query.lt !== undefined) {
      end = this.findLowerBoundEntry(query.lt, directions)
    } else if (query.le !== undefined) {
      end = this.findUpperBoundEntry(query.le, directions)
    }

    // Clamp to valid range
    if (start > end) {
      return { start: 0, end: 0 }
    }

    return { start, end }
  }

  /**
   * Find the first entry index where key >= target (lower bound).
   */
  private findLowerBoundEntry(target: SortKey, directions: SortDirection[]): number {
    let low = 0
    let high = this.sortedEntries.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const cmp = compareKeys(this.sortedEntries[mid]!.key as SortKey, target, directions)
      if (cmp < 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  /**
   * Find the first entry index where key > target (upper bound).
   */
  private findUpperBoundEntry(target: SortKey, directions: SortDirection[]): number {
    let low = 0
    let high = this.sortedEntries.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const cmp = compareKeys(this.sortedEntries[mid]!.key as SortKey, target, directions)
      if (cmp <= 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  *iterateRange(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I> {
    const { start, end } = this.findEntryRange(query)

    if (reversed) {
      for (let i = end - 1; i >= start; i--) {
        const subindex = this.sortedEntries[i]!.subindex
        // Check if subindex supports iterateRange for efficient reverse
        const sortedSubindex = subindex as IndexBase<I> & {
          iterateRange?(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I>
        }
        if (sortedSubindex.iterateRange) {
          yield* sortedSubindex.iterateRange({}, true)
        } else {
          // Fallback: collect and reverse
          const items = Array.from(subindex)
          for (let j = items.length - 1; j >= 0; j--) {
            yield items[j]!
          }
        }
      }
    } else {
      for (let i = start; i < end; i++) {
        yield* this.sortedEntries[i]!.subindex
      }
    }
  }

  countInRange(query: SortQuery<SortKey>): number {
    const { start, end } = this.findEntryRange(query)
    let total = 0
    for (let i = start; i < end; i++) {
      total += (this.sortedEntries[i]!.subindex as IndexBase<I> & { count: number }).count
    }
    return total
  }

  getDirections(): SortDirection[] {
    return this.parsedKey.directions
  }

  // ===========================================================================
  // Override getOrCreateSubindex for sorted key management
  // ===========================================================================

  protected override getOrCreateSubindex(key: K): SubindexImpl<I> {
    const index = this.findEntryIndex(key as SortKey)

    if (index >= 0) {
      // Found existing entry
      return asSubindexImpl(this.sortedEntries[index]!.subindex)
    }

    // Create new entry at insertion point
    const insertIndex = this.findInsertionIndex(key as SortKey)
    const subix = this.createSubindex()

    // Set parent reference if the subindex supports it
    if (subix instanceof IndexImplBase) {
      subix.parent = this as unknown as IndexImplBase<I, unknown>
      subix.keyInParent = key
    }

    this.sortedEntries.splice(insertIndex, 0, { key, subindex: subix })
    return asSubindexImpl(subix)
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    const index = this.findEntryIndex(key as SortKey)
    if (index < 0) return null
    return asSubindexImpl(this.sortedEntries[index]!.subindex)
  }

  protected addValueWithKey(): void {
    // Not used - we override getOrCreateSubindex
  }

  protected removeValueWithKey(key: K): void {
    const index = this.findEntryIndex(key as SortKey)
    if (index >= 0) {
      this.sortedEntries.splice(index, 1)
    }
  }

  protected clearValues(): void {
    for (const entry of this.sortedEntries) {
      asSubindexImpl(entry.subindex).clear()
    }
    this.sortedEntries.length = 0
  }

  protected isUnique(): boolean {
    return false
  }

  // ===========================================================================
  // Binary search helpers
  // ===========================================================================

  /**
   * Find the index where a key should be inserted to maintain sort order.
   */
  private findInsertionIndex(key: SortKey): number {
    const directions = this.parsedKey.directions
    let low = 0
    let high = this.sortedEntries.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const cmp = compareKeys(this.sortedEntries[mid]!.key as SortKey, key, directions)
      if (cmp < 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  /**
   * Find the index of an entry by its key.
   * Returns -1 if not found.
   */
  private findEntryIndex(key: SortKey): number {
    const directions = this.parsedKey.directions
    let low = 0
    let high = this.sortedEntries.length - 1

    while (low <= high) {
      const mid = (low + high) >>> 1
      const cmp = compareKeys(this.sortedEntries[mid]!.key as SortKey, key, directions)

      if (cmp < 0) {
        low = mid + 1
      } else if (cmp > 0) {
        high = mid - 1
      } else {
        return mid
      }
    }

    return -1
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
    const index = this.findEntryIndex(key as SortKey)
    if (index < 0) {
      return false
    }
    const subindex = this.sortedEntries[index]!.subindex
    return (subindex as unknown as { has?(item: I): boolean }).has?.(item) ?? true
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    return this.findEntryIndex(key as SortKey) >= 0
  }

  /**
   * Get the subindex for a key, or null if not found
   */
  tryGet(key: K): SUBIX | null {
    const index = this.findEntryIndex(key as SortKey)
    if (index < 0) return null
    return this.sortedEntries[index]!.subindex
  }

  /**
   * Get the subindex for a key.
   * If the key is not found, creates an empty subindex and assigns it to the key.
   */
  get(key: K): SUBIX {
    let index = this.findEntryIndex(key as SortKey)
    if (index < 0) {
      this.getOrCreateSubindex(key)
      index = this.findEntryIndex(key as SortKey)
    }
    return this.sortedEntries[index]!.subindex
  }

  /**
   * Iterator over all keys in sorted order
   */
  get keys(): IterableIterator<K> {
    return this.keysIterator()
  }

  private *keysIterator(): IterableIterator<K> {
    for (const entry of this.sortedEntries) {
      yield entry.key
    }
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
    for (const entry of this.sortedEntries) {
      yield* entry.subindex
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
 * Wrapper to use ManySortedIndexImpl as a SubindexImpl
 */
export function asManySortedSubindex<I, K extends SingleSortKey, SUBIX extends IndexBase<I>>(
  index: ManySortedIndexImpl<I, K, SUBIX>,
): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
