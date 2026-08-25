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

  readonly isEmpty: boolean

  /**
   * Iterator over all included items
   */
  readonly items: IterableIterator<I>

  /**
   * Return an array equivalent to [...items]
   */
  toArray(): Array<I>;

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

  /**
   * Add many items at once, returning them in input order.
   *
   * Semantically equivalent to calling {@link add} for each item, but the whole
   * batch settles as a single change notification (one transaction), and sorted
   * indexes merge the batch into their order in one pass (O(n+k)) rather than
   * splicing item-by-item (O(n·k)). Prefer this for bulk ingest of large
   * datasets.
   */
  addMany(items: Iterable<I>): I[]

  /**
   * Remove all items, disposing each item's reactive bookkeeping. Ordered views
   * announce a single bulk-remove delta.
   */
  clear(): void

  /**
   * Replace the entire contents with a new set of items — a {@link clear}
   * followed by {@link addMany}, wrapped in one transaction so subscribers
   * observe only the settled end state (never the transient empty index in
   * between). Use this for a full dataset reload from the server. Returns the
   * (possibly reactively-wrapped) items in input order.
   *
   * This is a wholesale replacement: every current item is removed and every new
   * item added, so there is no per-item diffing — for a full replace, surgical
   * reuse buys nothing (every row is a new object).
   *
   * Failure semantics: the clear happens first, so if a new item is invalid
   * (e.g. a duplicate key) the call throws and the collection is left **empty** —
   * pass a consistent dataset (as a server payload should be).
   */
  replaceAll(items: Iterable<I>): I[]
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
 * Adds live derived-array operations to an ordered index. The ordering is the
 * index's; consumers derive read-only reactive arrays from it.
 */
export interface MappableOrdered<I> {
  /**
   * A change-enabled array of this index's items in sort order. Read-only:
   * subscribe to it, map it, or hand it to a renderer — but do not mutate it.
   * The index is the sole author of its ordering. Requires a reactive domain.
   */
  readonly orderedArray: readonly I[]

  /**
   * Create a live array derived from this index's ordered items by applying
   * `fn` to each. Structural changes to the index (add/remove/reorder) are
   * threaded through as fine-grained updates to the result. Create it once and
   * hold it — do not call this per render. Requires a reactive domain.
   */
  createMappedArray<U>(fn: (item: I) => U): U[]
}

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
   * Remove an item from the Multindex and all its contained indexes.
   * If this is a subtype Multindex, the remove is relayed to the root Multindex,
   * which then removes from everywhere in the hierarchy.
   */
  remove(item: I): void

  /**
   * If this Multindex has a supertype Multindex, this is the full path from the root
   * Multindex to this one (e.g., "Vehicle.Car"). Otherwise this is null.
   */
  readonly subtypeName: string | null

  /**
   * Return the Multindex for the given subtype.
   * Returns this Multindex if subtypeName is null.
   * Throws if subtypeName doesn't match any subtype.
   */
  getSubtypeIndex<S = unknown>(subtypeName: string | null): Multindex<S>
}
