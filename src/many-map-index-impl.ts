/**
 * ManyMapIndexImpl - ManyMapIndex backed by a JavaScript Map of subindexes
 */

import type { ChangeDomain } from "chchchchanges"
import type { ManyMapIndex, IndexBase } from "./interfaces.js"
import type { ManyMapSpec } from "./specs.js"
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
 * ManyMapIndex implementation backed by a JavaScript Map of subindexes.
 *
 * Each key maps to a subindex containing zero or more items.
 * Subindexes are created on demand when the first item for a key is added,
 * and removed when empty.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type
 * @typeParam SUBIX - The subindex type
 */
export class ManyMapIndexImpl<I, K, SUBIX extends IndexBase<I>>
  extends IndexImplBase<I, K>
  implements ManyMapIndex<I, SUBIX, K>
{
  private readonly map = new Map<K, SUBIX>()
  private readonly createSubindex: () => SUBIX

  /**
   * Create a ManyMapIndexImpl.
   *
   * @param domain - The change domain for reactivity (null if non-reactive)
   * @param spec - The specification for the index (without subindex, which is provided separately)
   * @param createSubindex - Factory function to create new subindex instances
   */
  constructor(
    domain: ChangeDomain | null,
    spec: Omit<ManyMapSpec<I, K, SUBIX>, "subindex">,
    createSubindex: () => SUBIX,
  ) {
    super({
      domain,
      keyFn: getKeyFn(spec.key),
      keySetFn: getKeySetFn(spec.key),
      filterFn: getFilterFn(spec.filter),
      subindexFn: null, // We override getOrCreateSubindex instead
    })
    this.createSubindex = createSubindex
  }

  /**
   * Override to create and manage subindexes ourselves.
   * This allows us to store the actual SUBIX type while providing SubindexImpl interface.
   */
  protected override getOrCreateSubindex(key: K): SubindexImpl<I> {
    let subix = this.map.get(key)
    if (!subix) {
      subix = this.createSubindex()
      // Set parent reference if the subindex supports it
      if (subix instanceof IndexImplBase) {
        subix.parent = this as unknown as IndexImplBase<I, unknown>
        subix.keyInParent = key
      }
      this.map.set(key, subix)
    }
    return asSubindexImpl(subix)
  }

  // ===========================================================================
  // IndexImplBase abstract method implementations
  // ===========================================================================

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    const subix = this.map.get(key)
    if (!subix) {
      return null
    }
    return asSubindexImpl(subix)
  }

  protected addValueWithKey(): void {
    // Not used - we override getOrCreateSubindex instead
  }

  protected removeValueWithKey(key: K): void {
    this.map.delete(key)
  }

  protected clearValues(): void {
    // Clear each subindex before clearing the map
    for (const subindex of this.map.values()) {
      asSubindexImpl(subindex).clear()
    }
    this.map.clear()
  }

  protected isUnique(): boolean {
    return false
  }

  // ===========================================================================
  // ManyMapIndex interface implementation
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
    const subindex = this.map.get(key)
    if (!subindex) {
      return false
    }
    // Check if the item is in the subindex
    return (subindex as unknown as { has?(item: I): boolean }).has?.(item) ?? true
  }

  /**
   * Check if a key exists in the index (has at least one item)
   */
  hasKey(key: K): boolean {
    return this.map.has(key)
  }

  /**
   * Get the subindex for a key, or null if not found
   */
  tryGet(key: K): SUBIX | null {
    return this.map.get(key) ?? null
  }

  /**
   * Get the subindex for a key. Throws if not found.
   */
  get(key: K): SUBIX {
    const subindex = this.map.get(key)
    if (subindex === undefined) {
      throw new KeyNotFoundError(key)
    }
    return subindex
  }

  /**
   * Iterator over all keys in the index
   */
  get keys(): IterableIterator<K> {
    return this.map.keys()
  }

  /**
   * Iterator over all included items (across all subindexes)
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

  /**
   * Internal generator for all items across subindexes
   */
  private *allItems(): IterableIterator<I> {
    for (const subindex of this.map.values()) {
      yield* subindex
    }
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
 * Assumes the index has addItem/removeItem methods.
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
      // Fallback: call add and return countChange 1
      impl.add(item)
      return { countChange: 1 }
    },
    remove: (item: I) => {
      if (impl.removeItem) {
        return impl.removeItem(item)
      }
      // Fallback for indexes that don't have removeItem
      return { countChange: 0 }
    },
    hasAddedItems: () => {
      if (impl.hasAddedItems) {
        return impl.hasAddedItems()
      }
      // Fallback: check count
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
 * Wrapper to use ManyMapIndexImpl as a SubindexImpl
 */
export function asManyMapSubindex<I, K, SUBIX extends IndexBase<I>>(
  index: ManyMapIndexImpl<I, K, SUBIX>,
): SubindexImpl<I> {
  return {
    add: (item: I) => index.addItem(item),
    remove: (item: I) => index.removeItem(item),
    hasAddedItems: () => index.hasAddedItems(),
    clear: () => index.clear(),
  }
}
