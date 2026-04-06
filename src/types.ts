/**
 * Core types for Multindex
 */

import type { ChangeDomain } from "chchchchanges"

// =============================================================================
// Sort Key Types
// =============================================================================

/**
 * A single sort key value - primitives that can be compared for ordering
 */
export type SingleSortKey = null | undefined | boolean | string | number | Date

/**
 * Compound sort keys as tuples of up to 6 single sort keys
 */
export type CompoundSortKey2<K1 extends SingleSortKey, K2 extends SingleSortKey> = [K1, K2]
export type CompoundSortKey3<
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
> = [K1, K2, K3]
export type CompoundSortKey4<
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
> = [K1, K2, K3, K4]
export type CompoundSortKey5<
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
  K5 extends SingleSortKey,
> = [K1, K2, K3, K4, K5]
export type CompoundSortKey6<
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
  K5 extends SingleSortKey,
  K6 extends SingleSortKey,
> = [K1, K2, K3, K4, K5, K6]

/**
 * Any compound sort key (tuple of SingleSortKeys)
 */
export type CompoundSortKey =
  | CompoundSortKey2<SingleSortKey, SingleSortKey>
  | CompoundSortKey3<SingleSortKey, SingleSortKey, SingleSortKey>
  | CompoundSortKey4<SingleSortKey, SingleSortKey, SingleSortKey, SingleSortKey>
  | CompoundSortKey5<SingleSortKey, SingleSortKey, SingleSortKey, SingleSortKey, SingleSortKey>
  | CompoundSortKey6<
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey
    >

/**
 * A sort key - either single or compound
 */
export type SortKey = SingleSortKey | CompoundSortKey

// =============================================================================
// Partial Sort Key Types (for range queries on compound keys)
// =============================================================================

/**
 * Partial key for a 2-element compound key
 */
export type PartialSortKey2<K1, K2> = [] | [K1] | [K1, K2]

/**
 * Partial key for a 3-element compound key
 */
export type PartialSortKey3<K1, K2, K3> = [] | [K1] | [K1, K2] | [K1, K2, K3]

/**
 * Partial key for a 4-element compound key
 */
export type PartialSortKey4<K1, K2, K3, K4> = [] | [K1] | [K1, K2] | [K1, K2, K3] | [K1, K2, K3, K4]

/**
 * Partial key for a 5-element compound key
 */
export type PartialSortKey5<K1, K2, K3, K4, K5> =
  | []
  | [K1]
  | [K1, K2]
  | [K1, K2, K3]
  | [K1, K2, K3, K4]
  | [K1, K2, K3, K4, K5]

/**
 * Partial key for a 6-element compound key
 */
export type PartialSortKey6<K1, K2, K3, K4, K5, K6> =
  | []
  | [K1]
  | [K1, K2]
  | [K1, K2, K3]
  | [K1, K2, K3, K4]
  | [K1, K2, K3, K4, K5]
  | [K1, K2, K3, K4, K5, K6]

/**
 * Derives the partial key type from a full key type.
 * For single keys, the partial key is the same as the full key.
 * For compound keys, it's a union of all prefix tuples.
 */
export type PartialSortKey<K> = K extends [
  infer K1,
  infer K2,
  infer K3,
  infer K4,
  infer K5,
  infer K6,
]
  ? PartialSortKey6<K1, K2, K3, K4, K5, K6>
  : K extends [infer K1, infer K2, infer K3, infer K4, infer K5]
    ? PartialSortKey5<K1, K2, K3, K4, K5>
    : K extends [infer K1, infer K2, infer K3, infer K4]
      ? PartialSortKey4<K1, K2, K3, K4>
      : K extends [infer K1, infer K2, infer K3]
        ? PartialSortKey3<K1, K2, K3>
        : K extends [infer K1, infer K2]
          ? PartialSortKey2<K1, K2>
          : K

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for creating a Multindex
 */
export interface MultindexConfig {
  /**
   * The change domain from chchchchanges for reactivity
   */
  domain?: ChangeDomain | null

  /**
   * When true (the default), items added to the Multindex are wrapped in chchchchanges
   * reactivity, and the index automatically re-indexes items when their keys or filter
   * values change. When false, no reactivity overhead is incurred, but items will not
   * be automatically re-indexed on change.
   */
  reactive?: boolean
}

// =============================================================================
// Sort Query Types
// =============================================================================

/**
 * Query parameters for range queries on sorted indexes.
 * At most one of gt/ge may be specified, same for lt/le.
 */
export interface SortQuery<PK> {
  /** Greater than (exclusive lower bound) */
  gt?: PK
  /** Greater than or equal (inclusive lower bound) */
  ge?: PK
  /** Less than (exclusive upper bound) */
  lt?: PK
  /** Less than or equal (inclusive upper bound) */
  le?: PK
}

// =============================================================================
// Internal Result Types
// =============================================================================

/**
 * Result of an add operation, indicating how the count changed
 */
export interface AddResult {
  countChange: number
}

/**
 * Result of a remove operation, indicating how the count changed
 */
export interface RemoveResult {
  countChange: number
}
