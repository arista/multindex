/**
 * Public interfaces for Multindex
 */

import type { SortQuery, PartialSortKey } from "./types.js"

// =============================================================================
// Base Index Interfaces
// =============================================================================

/**
 * Base interface for all indexes.
 * Provides iteration and count functionality.
 */
export interface IndexBase<I> extends Iterable<I> {
  /**
   * The number of included items in the index
   */
  readonly count: number

  /**
   * Iterator over all included items
   */
  readonly items: IterableIterator<I>

  /**
   * Add an item to the index.
   *
   * On top-level Multindexes: wraps the item in a reactive Proxy (if reactivity
   * is enabled), adds to all contained indexes, and returns the Proxy.
   *
   * On subindexes: modifies the item's key to match the subindex's key within
   * its parent, recursively up the parent chain. Throws if conditions are not
   * met (setter not supplied, not a subindex, etc.)
   */
  add(item: I): I
}

/**
 * Set index - adds membership testing to IndexBase
 */
export interface SetIndex<I> extends IndexBase<I> {
  /**
   * Check if an item is in the index
   */
  has(item: I): boolean
}

/**
 * Map index - maps keys to values (items or subindexes)
 *
 * @typeParam I - The item type
 * @typeParam V - The value type (I for unique indexes, subindex for many indexes)
 * @typeParam K - The key type
 */
export interface MapIndex<I, V, K> extends SetIndex<I> {
  /**
   * Check if a key exists in the index
   */
  hasKey(key: K): boolean

  /**
   * Get the value for a key, or null if not found
   */
  tryGet(key: K): V | null

  /**
   * Get the value for a key. Throws if not found.
   */
  get(key: K): V

  /**
   * Iterator over all keys in the index
   */
  readonly keys: IterableIterator<K>
}

// =============================================================================
// Sorted Index Interfaces
// =============================================================================

/**
 * A view into a sorted index that supports iteration, reversal, and range queries.
 * Views are live (reflect changes to the underlying index) and chainable.
 *
 * @typeParam I - The item type
 * @typeParam PK - The partial key type for range queries
 */
export interface SortedView<I, PK> extends Iterable<I> {
  /**
   * Returns a view where iteration runs in reverse order
   */
  reverse(): SortedView<I, PK>

  /**
   * Returns a view bounded by the given range query
   */
  query(q: SortQuery<PK>): SortedView<I, PK>
}

/**
 * Sorted index - a map index that maintains sort order and supports range queries
 *
 * @typeParam I - The item type
 * @typeParam V - The value type (I for unique indexes, subindex for many indexes)
 * @typeParam K - The full key type
 * @typeParam PK - The partial key type for range queries
 */
export interface SortedIndex<I, V, K, PK = PartialSortKey<K>>
  extends MapIndex<I, V, K>, SortedView<I, PK> {}

// =============================================================================
// Specialized Index Type Aliases
// =============================================================================

/**
 * A unique map index where each key maps to exactly one item
 */
export type UniqueMapIndex<I, K> = MapIndex<I, I, K>

/**
 * A many map index where each key maps to a subindex containing multiple items
 */
export type ManyMapIndex<I, V extends IndexBase<I>, K> = MapIndex<I, V, K>

/**
 * A unique sorted index where each key maps to exactly one item
 */
export type UniqueSortedIndex<I, K, PK = PartialSortKey<K>> = SortedIndex<I, I, K, PK>

/**
 * A many sorted index where each key maps to a subindex containing multiple items
 */
export type ManySortedIndex<I, V extends IndexBase<I>, K, PK = PartialSortKey<K>> = SortedIndex<
  I,
  V,
  K,
  PK
>

// =============================================================================
// Multindex Interface
// =============================================================================

/**
 * A Multindex is a SetIndex that contains additional indexes.
 * Items added to the Multindex are added to all contained indexes.
 */
export interface Multindex<I> extends SetIndex<I> {
  /**
   * Remove an item from the Multindex and all its contained indexes
   */
  remove(item: I): void
}
