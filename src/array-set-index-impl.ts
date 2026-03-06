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
 * Designed for small sets where O(n) operations are acceptable.
 *
 * @typeParam I - The item type
 */
export class ArraySetIndexImpl<I> extends IndexImplBase<I, I> implements SetIndex<I> {
  private readonly array: I[] = []

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
    return this.array.includes(key) ? key : null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>): void {
    const item = value as I
    if (!this.array.includes(item)) {
      this.array.push(item)
    }
  }

  protected removeValueWithKey(key: I): void {
    const index = this.array.indexOf(key)
    if (index !== -1) {
      // Remove from array by swapping with last element
      const lastIndex = this.array.length - 1
      if (index !== lastIndex) {
        this.array[index] = this.array[lastIndex]!
      }
      this.array.pop()
    }
  }

  protected clearValues(): void {
    this.array.length = 0
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
    return this.array.includes(item)
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
    yield* this.array
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
