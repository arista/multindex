/**
 * Multindex - Reactive multi-indexed collections
 */

// Core types
export type {
  SingleSortKey,
  CompoundSortKey,
  CompoundSortKey2,
  CompoundSortKey3,
  CompoundSortKey4,
  CompoundSortKey5,
  CompoundSortKey6,
  SortKey,
  PartialSortKey,
  PartialSortKey2,
  PartialSortKey3,
  PartialSortKey4,
  PartialSortKey5,
  PartialSortKey6,
  MultindexConfig,
  SortQuery,
  AddResult,
  RemoveResult,
} from "./types.js"

// Index interfaces
export type {
  IndexBase,
  SetIndex,
  MapIndex,
  SortedView,
  SortedIndex,
  UniqueMapIndex,
  ManyMapIndex,
  UniqueSortedIndex,
  ManySortedIndex,
  Multindex,
} from "./interfaces.js"

// Specification types
export type {
  FilterSpec,
  GetterFilterSpec,
  FullFilterSpec,
  MapKeySpec,
  GetterMapKeySpec,
  FullMapKeySpec,
  SortDirection,
  SingleSortKeySpec,
  GetterSingleSortKeySpec,
  FullSingleSortKeySpec,
  CompoundSortKeySpec,
  CompoundSortKeySpec2,
  CompoundSortKeySpec3,
  CompoundSortKeySpec4,
  CompoundSortKeySpec5,
  CompoundSortKeySpec6,
  SortKeySpec,
  SetSpec,
  ArraySetSpec,
  UniqueMapSpec,
  UniqueSortedSpec,
  UniqueBTreeSpec,
  SubindexSpec,
  ManyMapSpec,
  ManySortedSpec,
  ManyBTreeSpec,
  IndexBuilderFn,
  IndexBuilder,
} from "./specs.js"

// Errors
export {
  MultindexError,
  UniquenessViolationError,
  KeyNotFoundError,
  KeySetterRequiredError,
  InvalidOperationError,
} from "./errors.js"

// Multindex factory
export { createMultindex } from "./multindex.js"
