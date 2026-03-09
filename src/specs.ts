/**
 * Specification types for building indexes
 */

import type { SingleSortKey } from "./types.js"
import type {
  IndexBase,
  SetIndex,
  UniqueMapIndex,
  UniqueSortedIndex,
  ManyMapIndex,
  ManySortedIndex,
} from "./interfaces.js"

// =============================================================================
// Filter Specs
// =============================================================================

/**
 * Simple filter spec - just a getter function
 */
export type GetterFilterSpec<I> = (item: I) => boolean

/**
 * Full filter spec with explicit get property
 */
export interface FullFilterSpec<I> {
  get: (item: I) => boolean
}

/**
 * Filter specification - determines which items are included in an index
 */
export type FilterSpec<I> = GetterFilterSpec<I> | FullFilterSpec<I>

// =============================================================================
// Map Key Specs
// =============================================================================

/**
 * Simple map key spec - just a getter function
 */
export type GetterMapKeySpec<I, K> = (item: I) => K

/**
 * Full map key spec with getter and optional setter
 */
export interface FullMapKeySpec<I, K> {
  get: (item: I) => K
  set?: (item: I, value: K) => void
}

/**
 * Map key specification - defines how to extract and optionally set a key on an item
 */
export type MapKeySpec<I, K> = GetterMapKeySpec<I, K> | FullMapKeySpec<I, K>

// =============================================================================
// Sort Key Specs
// =============================================================================

/**
 * Sort direction for sorted indexes
 */
export type SortDirection = "asc" | "desc"

/**
 * Simple single sort key spec - just a getter function (defaults to "asc")
 */
export type GetterSingleSortKeySpec<I, K extends SingleSortKey> = (item: I) => K

/**
 * Full single sort key spec with direction, getter, and optional setter
 */
export interface FullSingleSortKeySpec<I, K extends SingleSortKey> {
  direction: SortDirection
  get: (item: I) => K
  set?: (item: I, value: K) => void
}

/**
 * Single sort key specification
 */
export type SingleSortKeySpec<I, K extends SingleSortKey> =
  | GetterSingleSortKeySpec<I, K>
  | FullSingleSortKeySpec<I, K>

/**
 * Compound sort key specs as tuples of up to 6 single sort key specs
 */
export type CompoundSortKeySpec2<I, K1 extends SingleSortKey, K2 extends SingleSortKey> = readonly [
  SingleSortKeySpec<I, K1>,
  SingleSortKeySpec<I, K2>,
]

export type CompoundSortKeySpec3<
  I,
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
> = readonly [SingleSortKeySpec<I, K1>, SingleSortKeySpec<I, K2>, SingleSortKeySpec<I, K3>]

export type CompoundSortKeySpec4<
  I,
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
> = readonly [
  SingleSortKeySpec<I, K1>,
  SingleSortKeySpec<I, K2>,
  SingleSortKeySpec<I, K3>,
  SingleSortKeySpec<I, K4>,
]

export type CompoundSortKeySpec5<
  I,
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
  K5 extends SingleSortKey,
> = readonly [
  SingleSortKeySpec<I, K1>,
  SingleSortKeySpec<I, K2>,
  SingleSortKeySpec<I, K3>,
  SingleSortKeySpec<I, K4>,
  SingleSortKeySpec<I, K5>,
]

export type CompoundSortKeySpec6<
  I,
  K1 extends SingleSortKey,
  K2 extends SingleSortKey,
  K3 extends SingleSortKey,
  K4 extends SingleSortKey,
  K5 extends SingleSortKey,
  K6 extends SingleSortKey,
> = readonly [
  SingleSortKeySpec<I, K1>,
  SingleSortKeySpec<I, K2>,
  SingleSortKeySpec<I, K3>,
  SingleSortKeySpec<I, K4>,
  SingleSortKeySpec<I, K5>,
  SingleSortKeySpec<I, K6>,
]

/**
 * Any compound sort key spec
 */
export type CompoundSortKeySpec<I> =
  | CompoundSortKeySpec2<I, SingleSortKey, SingleSortKey>
  | CompoundSortKeySpec3<I, SingleSortKey, SingleSortKey, SingleSortKey>
  | CompoundSortKeySpec4<I, SingleSortKey, SingleSortKey, SingleSortKey, SingleSortKey>
  | CompoundSortKeySpec5<
      I,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey
    >
  | CompoundSortKeySpec6<
      I,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey,
      SingleSortKey
    >

/**
 * Sort key specification - either single or compound
 */
export type SortKeySpec<I, K extends SingleSortKey> =
  | SingleSortKeySpec<I, K>
  | CompoundSortKeySpec<I>

// =============================================================================
// Index Specs
// =============================================================================

/**
 * Specification for creating a Set index
 */
export interface SetSpec<I> {
  filter?: FilterSpec<I>
}

/**
 * Specification for creating an ArraySet index (maintains insertion order)
 */
export interface ArraySetSpec<I> {
  filter?: FilterSpec<I>
}

/**
 * Specification for creating a UniqueMap index
 */
export interface UniqueMapSpec<I, K> {
  key: MapKeySpec<I, K>
  filter?: FilterSpec<I>
}

/**
 * Specification for creating a UniqueSorted index
 */
export interface UniqueSortedSpec<I, K extends SingleSortKey> {
  key: SortKeySpec<I, K>
  filter?: FilterSpec<I>
}

/**
 * Specification for creating a UniqueBTree index
 */
export interface UniqueBTreeSpec<I, K extends SingleSortKey> {
  key: SortKeySpec<I, K>
  filter?: FilterSpec<I>
}

// =============================================================================
// Subindex Specs
// =============================================================================

/**
 * Function type for creating subindexes in Many indexes
 */
export type SubindexSpec<I, SUBIX extends IndexBase<I>> = (b: IndexBuilder<I>) => SUBIX

/**
 * Specification for creating a ManyMap index
 */
export interface ManyMapSpec<I, K, SUBIX extends IndexBase<I>> {
  key: MapKeySpec<I, K>
  filter?: FilterSpec<I>
  subindex: SubindexSpec<I, SUBIX>
}

/**
 * Specification for creating a ManySorted index
 */
export interface ManySortedSpec<I, K extends SingleSortKey, SUBIX extends IndexBase<I>> {
  key: SortKeySpec<I, K>
  filter?: FilterSpec<I>
  subindex: SubindexSpec<I, SUBIX>
}

/**
 * Specification for creating a ManyBTree index
 */
export interface ManyBTreeSpec<I, K extends SingleSortKey, SUBIX extends IndexBase<I>> {
  key: SortKeySpec<I, K>
  filter?: FilterSpec<I>
  subindex: SubindexSpec<I, SUBIX>
}

// =============================================================================
// Index Builder
// =============================================================================

/**
 * Function type for building indexes within a Multindex
 */
export type IndexBuilderFn<I, IXS> = (b: IndexBuilder<I>) => IXS

/**
 * Builder for creating indexes within a Multindex.
 * Provides methods to create different index types with various configurations.
 */
export interface IndexBuilder<I> {
  // Set indexes
  set(spec?: SetSpec<I>): SetIndex<I>
  arraySet(spec?: ArraySetSpec<I>): SetIndex<I>

  // Unique map indexes
  uniqueMap<K>(spec: UniqueMapSpec<I, K>): UniqueMapIndex<I, K>

  // Unique sorted indexes
  uniqueSorted<K extends SingleSortKey>(spec: UniqueSortedSpec<I, K>): UniqueSortedIndex<I, K>

  uniqueBTree<K extends SingleSortKey>(spec: UniqueBTreeSpec<I, K>): UniqueSortedIndex<I, K>

  // Many map indexes
  manyMap<K, SUBIX extends IndexBase<I>>(spec: ManyMapSpec<I, K, SUBIX>): ManyMapIndex<I, SUBIX, K>

  // Many sorted indexes
  manySorted<K extends SingleSortKey, SUBIX extends IndexBase<I>>(
    spec: ManySortedSpec<I, K, SUBIX>,
  ): ManySortedIndex<I, SUBIX, K>

  manyBTree<K extends SingleSortKey, SUBIX extends IndexBase<I>>(
    spec: ManyBTreeSpec<I, K, SUBIX>,
  ): ManySortedIndex<I, SUBIX, K>

  // Nested multindex (for subindexes)
  mult<IXS extends Record<string, IndexBase<I>>>(f: IndexBuilderFn<I, IXS>): SetIndex<I> & IXS

  // Subtype multindex (for type hierarchies)
  // Items added to the subtype are automatically added to the supertype Multindex
  // Returns a curried function to allow TypeScript to infer IXS from the builder
  subtype<SUB extends I>(): <IXS extends Record<string, IndexBase<SUB>>>(
    f: IndexBuilderFn<SUB, IXS>,
  ) => SetIndex<SUB> & IXS

  // Helper functions for creating key specs
  key<K>(get: (item: I) => K, set?: (item: I, value: K) => void): FullMapKeySpec<I, K>

  asc<K extends SingleSortKey>(
    get: (item: I) => K,
    set?: (item: I, value: K) => void,
  ): FullSingleSortKeySpec<I, K>

  desc<K extends SingleSortKey>(
    get: (item: I) => K,
    set?: (item: I, value: K) => void,
  ): FullSingleSortKeySpec<I, K>

  filter(get: (item: I) => boolean): FullFilterSpec<I>
}
