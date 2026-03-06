/**
 * SetIndexImpl - SetIndex backed by a JavaScript Set
 */

import type { ChangeDomain } from "chchchchanges"
import type { SetIndex } from "./interfaces.js"
import type { SetSpec } from "./specs.js"
import type { AddResult, RemoveResult } from "./types.js"
import { IndexImplBase, SubindexImpl, getFilterFn } from "./index-impl-base.js"

/**
 * SetIndex implementation backed by a JavaScript Set.
 *
 * Items are stored directly in the Set. The "key" for internal purposes
 * is the item itself (identity function).
 *
 * @typeParam I - The item type
 */
export class SetIndexImpl<I> extends IndexImplBase<I, I> implements SetIndex<I> {
  private readonly set = new Set<I>()

  constructor(domain: ChangeDomain | null, spec?: SetSpec<I>) {
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
    return this.set.has(key) ? key : null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>): void {
    this.set.add(value as I)
  }

  protected removeValueWithKey(key: I): void {
    this.set.delete(key)
  }

  protected clearValues(): void {
    this.set.clear()
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
    return addedItem !== null && addedItem.included && this.set.has(item)
  }

  /**
   * Iterator over all included items
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
   * Internal generator for included items
   */
  private *includedItems(): IterableIterator<I> {
    for (const item of this.set) {
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
 * Wrapper to use SetIndexImpl as a SubindexImpl
 */
export function asSubindex<I>(index: SetIndexImpl<I>): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
