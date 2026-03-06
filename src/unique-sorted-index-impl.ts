/**
 * UniqueSortedIndexImpl - UniqueSortedIndex backed by a sorted Array
 */

import type { ChangeDomain } from "chchchchanges"
import type { UniqueSortedIndex, SortedView } from "./interfaces.js"
import type { UniqueSortedSpec, SortDirection } from "./specs.js"
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
import {
  parseSortKeySpec,
  ParsedSortKey,
  compareKeys,
  createItemComparator,
} from "./sort-compare.js"
import { SortedViewImpl, SortedDataSource } from "./sorted-view-impl.js"

/**
 * UniqueSortedIndex implementation backed by a sorted JavaScript Array.
 *
 * Each key maps to exactly one item. Items are maintained in sorted order.
 * Adding an item with a duplicate key throws a UniquenessViolationError.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (extends SingleSortKey)
 */
export class UniqueSortedIndexImpl<I, K extends SingleSortKey>
  extends IndexImplBase<I, K>
  implements UniqueSortedIndex<I, K, PartialSortKey<K>>, SortedDataSource<I>
{
  private readonly sortedItems: I[] = []
  private readonly parsedKey: ParsedSortKey<I>
  private readonly itemComparator: (a: I, b: I) => number
  private readonly view: SortedViewImpl<I, PartialSortKey<K>>

  constructor(domain: ChangeDomain | null, spec: UniqueSortedSpec<I, K>) {
    const parsedKey = parseSortKeySpec(spec.key)

    super({
      domain,
      keyFn: (item: I) => parsedKey.getKey(item) as K,
      keySetFn: parsedKey.setKey as ((item: I, value: K) => void) | null,
      filterFn: getFilterFn(spec.filter),
      subindexFn: null,
    })

    this.parsedKey = parsedKey
    this.itemComparator = createItemComparator(parsedKey)
    this.view = SortedViewImpl.create<I, PartialSortKey<K>>(this)
  }

  // ===========================================================================
  // SortedDataSource implementation (for SortedView)
  // ===========================================================================

  /**
   * Find the index range [start, end) for a query using binary search.
   */
  private findIndexRange(query: SortQuery<SortKey>): { start: number; end: number } {
    const directions = this.parsedKey.directions
    let start = 0
    let end = this.sortedItems.length

    // Find start index based on lower bound (gt or ge)
    if (query.gt !== undefined) {
      start = this.findUpperBound(query.gt, directions)
    } else if (query.ge !== undefined) {
      start = this.findLowerBound(query.ge, directions)
    }

    // Find end index based on upper bound (lt or le)
    if (query.lt !== undefined) {
      end = this.findLowerBound(query.lt, directions)
    } else if (query.le !== undefined) {
      end = this.findUpperBound(query.le, directions)
    }

    // Clamp to valid range
    if (start > end) {
      return { start: 0, end: 0 }
    }

    return { start, end }
  }

  /**
   * Find the first index where key >= target (lower bound).
   */
  private findLowerBound(target: SortKey, directions: SortDirection[]): number {
    let low = 0
    let high = this.sortedItems.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const midKey = this.parsedKey.getKey(this.sortedItems[mid]!)
      const cmp = compareKeys(midKey, target, directions)
      if (cmp < 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  /**
   * Find the first index where key > target (upper bound).
   */
  private findUpperBound(target: SortKey, directions: SortDirection[]): number {
    let low = 0
    let high = this.sortedItems.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const midKey = this.parsedKey.getKey(this.sortedItems[mid]!)
      const cmp = compareKeys(midKey, target, directions)
      if (cmp <= 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  *iterateRange(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I> {
    const { start, end } = this.findIndexRange(query)

    if (reversed) {
      for (let i = end - 1; i >= start; i--) {
        yield this.sortedItems[i]!
      }
    } else {
      for (let i = start; i < end; i++) {
        yield this.sortedItems[i]!
      }
    }
  }

  countInRange(query: SortQuery<SortKey>): number {
    const { start, end } = this.findIndexRange(query)
    return end - start
  }

  getDirections(): SortDirection[] {
    return this.parsedKey.directions
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    const index = this.findIndexByKey(key as SortKey)
    if (index < 0) return null
    return this.sortedItems[index] ?? null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>): void {
    const item = value as I
    // Find insertion point using binary search
    const insertIndex = this.findInsertionIndex(item)
    this.sortedItems.splice(insertIndex, 0, item)
  }

  protected removeValueWithKey(key: K): void {
    const index = this.findIndexByKey(key as SortKey)
    if (index >= 0) {
      this.sortedItems.splice(index, 1)
    }
  }

  protected clearValues(): void {
    this.sortedItems.length = 0
  }

  protected isUnique(): boolean {
    return true
  }

  // ===========================================================================
  // Binary search helpers
  // ===========================================================================

  /**
   * Find the index where an item should be inserted to maintain sort order.
   */
  private findInsertionIndex(item: I): number {
    let low = 0
    let high = this.sortedItems.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const cmp = this.itemComparator(this.sortedItems[mid]!, item)
      if (cmp < 0) {
        low = mid + 1
      } else {
        high = mid
      }
    }

    return low
  }

  /**
   * Find the index of an item by its key.
   * Returns -1 if not found.
   */
  private findIndexByKey(key: SortKey): number {
    const directions = this.parsedKey.directions

    let low = 0
    let high = this.sortedItems.length - 1

    while (low <= high) {
      const mid = (low + high) >>> 1
      const midKey = this.parsedKey.getKey(this.sortedItems[mid]!)
      const cmp = compareKeys(midKey, key, directions)

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
    const key = this.parsedKey.getKey(item) as K
    const index = this.findIndexByKey(key as SortKey)
    if (index < 0) return false
    return this.sortedItems[index] === item
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    return this.findIndexByKey(key as SortKey) >= 0
  }

  /**
   * Get the item for a key, or null if not found
   */
  tryGet(key: K): I | null {
    const index = this.findIndexByKey(key as SortKey)
    if (index < 0) return null
    return this.sortedItems[index] ?? null
  }

  /**
   * Get the item for a key. Throws if not found.
   */
  get(key: K): I {
    const index = this.findIndexByKey(key as SortKey)
    if (index < 0) {
      throw new KeyNotFoundError(key)
    }
    return this.sortedItems[index]!
  }

  /**
   * Iterator over all keys in sorted order
   */
  get keys(): IterableIterator<K> {
    return this.keysIterator()
  }

  private *keysIterator(): IterableIterator<K> {
    for (const item of this.sortedItems) {
      yield this.parsedKey.getKey(item) as K
    }
  }

  /**
   * Iterator over all included items in sorted order
   */
  get items(): IterableIterator<I> {
    return this.sortedItems[Symbol.iterator]()
  }

  /**
   * Make the index iterable (in sorted order)
   */
  [Symbol.iterator](): Iterator<I> {
    return this.sortedItems[Symbol.iterator]()
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
 * Wrapper to use UniqueSortedIndexImpl as a SubindexImpl
 */
export function asUniqueSortedSubindex<I, K extends SingleSortKey>(
  index: UniqueSortedIndexImpl<I, K>,
): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
