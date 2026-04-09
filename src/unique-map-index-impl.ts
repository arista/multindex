/**
 * UniqueMapIndexImpl - UniqueMapIndex backed by a JavaScript Map
 */

import type { ChangeDomain } from "chchchchanges"
import type { UniqueMapIndex } from "./interfaces.js"
import type { UniqueMapSpec } from "./specs.js"
import type { AddResult, RemoveResult } from "./types.js"
import {
  IndexImplBase,
  SubindexImpl,
  getKeyFn,
  getKeySetFn,
  getFilterFn,
} from "./index-impl-base.js"
import { KeyNotFoundError } from "./errors.js"

/**
 * UniqueMapIndex implementation backed by a JavaScript Map.
 *
 * Each key maps to exactly one item. Adding an item with a duplicate key
 * throws a UniquenessViolationError.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type
 */
export class UniqueMapIndexImpl<I, K> extends IndexImplBase<I, K> implements UniqueMapIndex<I, K> {
  private readonly map = new Map<K, I>()

  constructor(domain: ChangeDomain | null, spec: UniqueMapSpec<I, K>) {
    super({
      domain,
      keyFn: getKeyFn(spec.key),
      keySetFn: getKeySetFn(spec.key),
      filterFn: getFilterFn(spec.filter),
      subindexFn: null,
    })
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    return this.map.get(key) ?? null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>, key: K): void {
    this.map.set(key, value as I)
  }

  protected removeValueWithKey(key: K): void {
    this.map.delete(key)
  }

  protected clearValues(): void {
    this.map.clear()
  }

  protected isUnique(): boolean {
    return true
  }

  // ===========================================================================
  // MapIndex interface implementation
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
    // For unique map, we check if the item's key exists and maps to this item
    const addedItem = this.getAddedItem(item)
    if (!addedItem) {
      return false
    }
    const key = addedItem.key
    if (key === null) {
      return false
    }
    return this.map.get(key) === item
  }

  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean {
    this.trackKeyAccess(key)
    return this.map.has(key)
  }

  /**
   * Get the item for a key, or null if not found
   */
  tryGet(key: K): I | null {
    this.trackKeyAccess(key)
    return this.map.get(key) ?? null
  }

  /**
   * Get the item for a key. Throws if not found.
   */
  get(key: K): I {
    this.trackKeyAccess(key)
    const item = this.map.get(key)
    if (item === undefined) {
      throw new KeyNotFoundError(key)
    }
    return item
  }

  /**
   * Iterator over all keys in the index
   */
  get keys(): IterableIterator<K> {
    return this.map.keys()
  }

  /**
   * Iterator over all included items
   */
  get items(): IterableIterator<I> {
    return this.map.values()
  }

  /**
   * Make the index iterable
   */
  [Symbol.iterator](): Iterator<I> {
    return this.map.values()
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
 * Wrapper to use UniqueMapIndexImpl as a SubindexImpl
 */
export function asUniqueMapSubindex<I, K>(index: UniqueMapIndexImpl<I, K>): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
