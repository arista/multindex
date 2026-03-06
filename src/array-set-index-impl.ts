/**
 * ArraySetIndexImpl - SetIndex backed by an Array (maintains insertion order)
 */

import type { ChangeDomain } from "chchchchanges"
import type { SetIndex } from "./interfaces.js"
import type { ArraySetSpec } from "./specs.js"
import type { AddResult, RemoveResult } from "./types.js"
import { IndexImplBase, SubindexImpl, getFilterFn } from "./index-impl-base.js"

/**
 * SetIndex implementation backed by a JavaScript Array.
 *
 * Items are stored in an array to maintain insertion order.
 * Uses a Map for O(1) lookup of item positions.
 *
 * @typeParam I - The item type
 */
export class ArraySetIndexImpl<I> extends IndexImplBase<I, I> implements SetIndex<I> {
  private readonly array: I[] = []
  private readonly indexMap = new Map<I, number>()

  constructor(domain: ChangeDomain | null, spec?: ArraySetSpec<I>) {
    super({
      domain,
      keyFn: (item: I) => item, // Item is its own key
      keySetFn: null,
      filterFn: getFilterFn(spec?.filter),
      subindexFn: null,
    })
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: I): I | SubindexImpl<I> | null {
    return this.indexMap.has(key) ? key : null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>): void {
    const item = value as I
    if (!this.indexMap.has(item)) {
      this.indexMap.set(item, this.array.length)
      this.array.push(item)
    }
  }

  protected removeValueWithKey(key: I): void {
    const index = this.indexMap.get(key)
    if (index !== undefined) {
      // Remove from array by swapping with last element
      const lastIndex = this.array.length - 1
      if (index !== lastIndex) {
        const lastItem = this.array[lastIndex]!
        this.array[index] = lastItem
        this.indexMap.set(lastItem, index)
      }
      this.array.pop()
      this.indexMap.delete(key)
    }
  }

  protected clearValues(): void {
    this.array.length = 0
    this.indexMap.clear()
  }

  protected isUnique(): boolean {
    return true
  }

  // ===========================================================================
  // SetIndex interface implementation
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
   * Check if an item is in the index (and passes the filter)
   */
  has(item: I): boolean {
    const addedItem = this.getAddedItem(item)
    return addedItem !== null && addedItem.included && this.indexMap.has(item)
  }

  /**
   * Iterator over all included items in insertion order
   */
  get items(): IterableIterator<I> {
    return this.includedItems()
  }

  /**
   * Make the index iterable
   */
  [Symbol.iterator](): Iterator<I> {
    return this.includedItems()
  }

  /**
   * Internal generator for included items in insertion order
   */
  private *includedItems(): IterableIterator<I> {
    for (const item of this.array) {
      const addedItem = this.getAddedItem(item)
      if (addedItem && addedItem.included) {
        yield item
      }
    }
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
 * Wrapper to use ArraySetIndexImpl as a SubindexImpl
 */
export function asArraySubindex<I>(index: ArraySetIndexImpl<I>): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
