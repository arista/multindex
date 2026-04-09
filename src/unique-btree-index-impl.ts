/**
 * UniqueBTreeIndexImpl - UniqueSortedIndex backed by a B+ tree
 */

import type { ChangeDomain } from "chchchchanges"
import type BTreeType from "sorted-btree"
import BTreeModule from "sorted-btree"
// Handle ESM/CJS interop - the module might have a default property
const BTree = (BTreeModule as unknown as { default?: typeof BTreeType }).default ?? BTreeModule
import type { UniqueSortedIndex, SortedView } from "./interfaces.js"
import type { UniqueBTreeSpec, SortDirection } from "./specs.js"
import type {
  AddResult,
  RemoveResult,
  SortKey,
  SortQuery,
  SingleSortKey,
  PartialSortKey,
} from "./types.js"
import { IndexImplBase, SubindexImpl, getFilterFn } from "./index-impl-base.js"
import { KeyNotFoundError } from "./errors.js"
import { parseSortKeySpec, ParsedSortKey, compareKeys } from "./sort-compare.js"
import { SortedViewImpl, SortedDataSource } from "./sorted-view-impl.js"

/**
 * UniqueSortedIndex implementation backed by a B+ tree.
 *
 * Each key maps to exactly one item. Items are maintained in sorted order.
 * Adding an item with a duplicate key throws a UniquenessViolationError.
 *
 * B+ trees provide better performance for large datasets and frequent
 * insertions/deletions compared to sorted arrays.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (extends SingleSortKey)
 */
export class UniqueBTreeIndexImpl<I, K extends SingleSortKey>
  extends IndexImplBase<I, K>
  implements UniqueSortedIndex<I, K, PartialSortKey<K>>, SortedDataSource<I>
{
  private readonly btree: BTreeType<SortKey, I>
  private readonly parsedKey: ParsedSortKey<I>
  private readonly view: SortedViewImpl<I, PartialSortKey<K>>

  constructor(domain: ChangeDomain | null, spec: UniqueBTreeSpec<I, K>) {
    const parsedKey = parseSortKeySpec(spec.key)

    super({
      domain,
      keyFn: (item: I) => parsedKey.getKey(item) as K,
      keySetFn: parsedKey.setKey as ((item: I, value: K) => void) | null,
      filterFn: getFilterFn(spec.filter),
      subindexFn: null,
    })

    this.parsedKey = parsedKey

    // Create BTree with custom comparator based on our sort key directions
    const directions = parsedKey.directions
    this.btree = new BTree<SortKey, I>(undefined, (a: SortKey, b: SortKey) =>
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
      // Descending iteration
      const startKey = query.le ?? query.lt
      const skipStart = query.lt !== undefined
      const endKey = query.ge ?? query.gt
      const skipEnd = query.gt !== undefined

      for (const [key, item] of this.btree.entriesReversed(startKey, undefined, skipStart)) {
        // Check if we've gone past the lower bound
        if (endKey !== undefined) {
          const cmp = compareKeys(key, endKey, directions)
          if (skipEnd ? cmp <= 0 : cmp < 0) {
            break
          }
        }
        yield item
      }
    } else {
      // Ascending iteration
      const startKey = query.ge ?? query.gt
      const skipStart = query.gt !== undefined
      const endKey = query.le ?? query.lt
      const skipEnd = query.lt !== undefined

      let skippedFirst = false
      for (const [key, item] of this.btree.entries(startKey)) {
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
        yield item
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
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    return this.btree.get(key as SortKey) ?? null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>): void {
    const item = value as I
    const key = this.parsedKey.getKey(item)
    this.btree.set(key, item)
  }

  protected removeValueWithKey(key: K): void {
    this.btree.delete(key as SortKey)
  }

  protected clearValues(): void {
    this.btree.clear()
  }

  protected isUnique(): boolean {
    return true
  }

  // ===========================================================================
  // SortedIndex interface implementation
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
    const key = this.parsedKey.getKey(item)
    const found = this.btree.get(key)
    return found === item
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    this.trackKeyAccess(key)
    return this.btree.has(key as SortKey)
  }

  /**
   * Get the item for a key, or null if not found
   */
  tryGet(key: K): I | null {
    this.trackKeyAccess(key)
    return this.btree.get(key as SortKey) ?? null
  }

  /**
   * Get the item for a key. Throws if not found.
   */
  get(key: K): I {
    this.trackKeyAccess(key)
    const item = this.btree.get(key as SortKey)
    if (item === undefined) {
      throw new KeyNotFoundError(key)
    }
    return item
  }

  /**
   * Iterator over all keys in sorted order
   */
  get keys(): IterableIterator<K> {
    return this.btree.keys() as IterableIterator<K>
  }

  /**
   * Iterator over all included items in sorted order
   */
  get items(): IterableIterator<I> {
    return this.btree.values()
  }

  /**
   * Make the index iterable (in sorted order)
   */
  [Symbol.iterator](): Iterator<I> {
    return this.btree.values()
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
  // SubindexImpl-compatible methods (for use as a subindex in Many indexes)
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
 * Wrapper to use UniqueBTreeIndexImpl as a SubindexImpl
 */
export function asUniqueBTreeSubindex<I, K extends SingleSortKey>(
  index: UniqueBTreeIndexImpl<I, K>,
): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
