/**
 * UniqueSortedIndexImpl - UniqueSortedIndex backed by a sorted Array
 */

import type { ChangeDomain } from "chchchchanges"
import type { UniqueSortedIndex, SortedView, MappableOrdered } from "./interfaces.js"
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
import { parseSortKeySpec, ParsedSortKey, compareKeys } from "./sort-compare.js"
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
  implements UniqueSortedIndex<I, K, PartialSortKey<K>>, MappableOrdered<I>, SortedDataSource<I>
{
  private readonly sortedItems: I[] = []
  private readonly parsedKey: ParsedSortKey<I>
  private readonly view: SortedViewImpl<I, PartialSortKey<K>>

  /**
   * The key each stored item is currently ordered by. All ordering reads go
   * through this rather than the item's live key, so the index stays in control
   * of its own sort key: when an item is re-keyed, its stored key holds the old
   * value until the index deliberately updates it here. That keeps the array
   * consistent (never transiently out of order relative to what searches see)
   * and lets a re-keyed item be located by its old key even after the live
   * property has already changed.
   */
  private entryKeys = new WeakMap<object, K>()

  private storedKey(item: I): K {
    return this.entryKeys.get(item as object) as K
  }

  /**
   * A change-enabled view over `sortedItems`, created lazily on first use.
   * `sortedItems` stays a plain array (reads/binary search never touch a proxy);
   * this proxy exists only as the subscription anchor for derived reactive
   * arrays. Once it exists, structural mutations announce their deltas on its
   * behalf via the change domain.
   */
  private orderedView: I[] | null = null

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
      const midKey = this.storedKey(this.sortedItems[mid]!)
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
      const midKey = this.storedKey(this.sortedItems[mid]!)
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

  protected addValueWithKey(value: I | SubindexImpl<I>, key: K): void {
    const item = value as I
    this.entryKeys.set(item as object, key)
    const insertIndex = this.findInsertionIndex(key as SortKey)
    this.sortedItems.splice(insertIndex, 0, item)
    if (this.orderedView) {
      this.domain!.emitArrayChangeOnBehalfOf(this.orderedView, {
        type: "ArraySplice",
        start: insertIndex,
        deleteCount: 0,
        items: [item],
      })
    }
  }

  protected removeValueWithKey(key: K): void {
    const index = this.findIndexByKey(key as SortKey)
    if (index >= 0) {
      const item = this.sortedItems[index]!
      this.sortedItems.splice(index, 1)
      this.entryKeys.delete(item as object)
      if (this.orderedView) {
        this.domain!.emitArrayChangeOnBehalfOf(this.orderedView, {
          type: "ArraySplice",
          start: index,
          deleteCount: 1,
        })
      }
    }
  }

  protected clearValues(): void {
    const removed = this.sortedItems.length
    this.sortedItems.length = 0
    this.entryKeys = new WeakMap()
    if (this.orderedView && removed > 0) {
      this.domain!.emitArrayChangeOnBehalfOf(this.orderedView, {
        type: "ArraySplice",
        start: 0,
        deleteCount: removed,
      })
    }
  }

  /**
   * When an item stays included but is re-keyed, relocate it in place and emit a
   * single ArrayMove. The item's stored key still holds `beforeKey` (searches go
   * through entryKeys, not the live property), so it's found normally; we then
   * update the stored key and reposition only if the item actually needs to move.
   */
  protected updateValueWithKey(
    item: I,
    beforeKey: K,
    afterKey: K,
    beforeIncluded: boolean,
    afterIncluded: boolean,
  ): number {
    if (beforeIncluded && afterIncluded) {
      const from = this.findIndexByKey(beforeKey as SortKey)
      if (from >= 0) {
        this.entryKeys.set(item as object, afterKey)

        // If it's still correctly ordered between its neighbors, don't move it.
        const directions = this.parsedKey.directions
        const leftOk =
          from === 0 ||
          compareKeys(
            this.storedKey(this.sortedItems[from - 1]!) as SortKey,
            afterKey,
            directions,
          ) <= 0
        const rightOk =
          from === this.sortedItems.length - 1 ||
          compareKeys(
            this.storedKey(this.sortedItems[from + 1]!) as SortKey,
            afterKey,
            directions,
          ) >= 0

        if (!leftOk || !rightOk) {
          this.sortedItems.splice(from, 1)
          const to = this.findInsertionIndex(afterKey as SortKey)
          this.sortedItems.splice(to, 0, item)
          if (this.orderedView) {
            this.domain!.emitArrayChangeOnBehalfOf(this.orderedView, {
              type: "ArrayMove",
              from,
              to,
            })
          }
        }

        // Keyed subscribers of both the old and new key see a mutation.
        this.notifyKeyMutation(beforeKey)
        this.notifyKeyMutation(afterKey)
        return 0
      }
    }

    return super.updateValueWithKey(item, beforeKey, afterKey, beforeIncluded, afterIncluded)
  }

  protected isUnique(): boolean {
    return true
  }

  // ===========================================================================
  // MappableOrdered implementation
  // ===========================================================================

  private requireReactiveDomain(): ChangeDomain {
    if (!this.domain) {
      throw new Error(
        "orderedArray/createMappedArray require a reactive multindex (created with a change domain)",
      )
    }
    return this.domain
  }

  /**
   * Lazily create the change-enabled view over `sortedItems`. The view wraps the
   * existing array in place, so `sortedItems` is unchanged and reads stay plain.
   */
  private ensureOrderedView(): I[] {
    if (!this.orderedView) {
      this.orderedView = this.requireReactiveDomain().enableChanges(this.sortedItems)
    }
    return this.orderedView
  }

  get orderedArray(): readonly I[] {
    return this.ensureOrderedView()
  }

  createMappedArray<U>(fn: (item: I) => U): U[] {
    return this.requireReactiveDomain().createMappedArray(this.ensureOrderedView(), fn)
  }

  // ===========================================================================
  // Binary search helpers
  // ===========================================================================

  /**
   * Find the index where the given key should be inserted to maintain sort
   * order (lower bound), comparing against stored keys.
   */
  private findInsertionIndex(key: SortKey): number {
    const directions = this.parsedKey.directions
    let low = 0
    let high = this.sortedItems.length

    while (low < high) {
      const mid = (low + high) >>> 1
      const cmp = compareKeys(this.storedKey(this.sortedItems[mid]!) as SortKey, key, directions)
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
      const midKey = this.storedKey(this.sortedItems[mid]!)
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
    return this.entryKeys.has(item as object)
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    this.trackKeyAccess(key)
    return this.findIndexByKey(key as SortKey) >= 0
  }

  /**
   * Get the item for a key, or null if not found
   */
  tryGet(key: K): I | null {
    this.trackKeyAccess(key)
    const index = this.findIndexByKey(key as SortKey)
    if (index < 0) return null
    return this.sortedItems[index] ?? null
  }

  /**
   * Get the item for a key. Throws if not found.
   */
  get(key: K): I {
    this.trackKeyAccess(key)
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
      yield this.storedKey(item)
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
