# Implementation Plan

This document outlines the implementation plan for Multindex, divided into logical, reviewable steps.

implement each step on branch nsa-implementation-{step number}. When finished, mark the step as complete, and update PLANS.md as to which step is next.

## Step 1: Project Scaffolding

Set up the TypeScript project structure following the pattern from chchchchanges and brint.

**Files to create:**

- `package.json` - with dependency on `chchchchanges` (file:../chchchchanges)
- `tsconfig.json` - ES2022 target, strict mode
- `tsup.config.ts` - ESM and CJS builds with types
- `eslint.config.js` - TypeScript ESLint with Prettier
- `.prettierrc` - consistent with other projects
- `.gitignore` - node_modules, dist, coverage, etc.
- `src/index.ts` - empty exports placeholder
- `test/index.test.ts` - basic import test
- `DEVELOPMENT.md` - development instructions

**Verification:** `npm install && npm run check` passes

## Step 2: Public API Types

Define all public-facing interfaces and types from the design document.

**Files:**

- `src/types.ts` - Core types (SingleSortKey, SortKey, PartialSortKey, etc.)
- `src/interfaces.ts` - Index interfaces (IndexBase, SetIndex, MapIndex, SortedIndex, SortedView)
- `src/specs.ts` - Builder specs (SetSpec, UniqueMapSpec, SortedKeySpec, FilterSpec, etc.)
- `src/errors.ts` - MultindexError and subclasses
- `src/index.ts` - Export all public types

**Verification:** `npm run typecheck` passes, types are usable in test file

## Step 3: AddedItem and IndexImplBase Foundation

Implement the core internal structures that all indexes depend on.

**Files:**

- `src/added-item.ts` - AddedItem structure for tracking reactive state
- `src/index-impl-base.ts` - IndexImplBase with:
  - addedItems Map management
  - createAddedItem, getAddedItem, removeAddedItem
  - computeKey, computeFilter
  - keysEqual (with Date and compound key handling)
  - Abstract methods: getValueWithKey, addValueWithKey, removeValueWithKey, clearValues, isUnique

**Verification:** Unit tests for AddedItem and base class utilities

## Step 4: SetIndex Implementations

Implement the simplest index types.

**Files:**

- `src/set-index-impl.ts` - SetIndexImpl backed by JS Set
- `src/array-set-index-impl.ts` - ArraySetIndexImpl backed by Array (maintains insertion order)

**Verification:** Tests for add, remove, has, count, iteration

## Step 5: UniqueMapIndex Implementation

Implement unique key-to-item mapping.

**Files:**

- `src/unique-map-index-impl.ts` - UniqueMapIndexImpl backed by JS Map

**Verification:** Tests for add, remove, get, tryGet, hasKey, keys iteration, uniqueness violation errors

## Step 6: ManyMapIndex Implementation

Implement key-to-subindex mapping, introducing subindex handling.

**Files:**

- `src/many-map-index-impl.ts` - ManyMapIndexImpl with subindex creation and management
- `src/subindex-impl.ts` - SubindexImpl interface refinements if needed

**Verification:** Tests for nested add/remove, subindex creation, empty subindex cleanup, count propagation

## Step 7: SortedIndex Implementations

Implement sorted indexes with query and reverse support.

**Files:**

- `src/sorted-view-impl.ts` - SortedView implementation (live, chainable views)
- `src/unique-sorted-index-impl.ts` - UniqueSortedIndexImpl backed by sorted Array
- `src/many-sorted-index-impl.ts` - ManySortedIndexImpl with subindexes

**Verification:** Tests for ordering, compound keys, partial key queries, reverse, query chaining

## Step 8: Multindex and IndexBuilder

Implement the top-level Multindex and the builder API.

**Files:**

- `src/multindex.ts` - Multindex implementation
- `src/index-builder.ts` - IndexBuilder with all builder methods
- Update `src/index.ts` - Export Multindex.create and all public APIs

**Verification:** Integration tests building complete Multindexes with multiple index types, add/remove propagation

## Step 9: Reactivity Integration

Ensure full integration with chchchchanges.

**Files:**

- Updates to existing implementations for reactive wrapping on add()
- Tests with reactive: true (default) and reactive: false

**Verification:** Tests demonstrating automatic re-indexing on item property changes

## Step 10: BTree Implementations (Future)

Implement BTree-backed sorted indexes for better scaling.

**Files:**

- `src/unique-btree-index-impl.ts`
- `src/many-btree-index-impl.ts`

**Verification:** Same tests as sorted array implementations, plus performance benchmarks

---

## Branch Strategy

Each step is implemented on its own branch: `nsa-implementation-{step number}`

- `nsa-implementation-1` - Project scaffolding
- `nsa-implementation-2` - Public API types
- `nsa-implementation-3` - AddedItem and IndexImplBase
- `nsa-implementation-4` - SetIndex implementations
- `nsa-implementation-5` - UniqueMapIndex
- `nsa-implementation-6` - ManyMapIndex
- `nsa-implementation-7` - SortedIndex implementations
- `nsa-implementation-8` - Multindex and IndexBuilder
- `nsa-implementation-9` - Reactivity integration
- `nsa-implementation-10` - BTree implementations

## Review Strategy

Each step produces a reviewable PR:

1. Steps 1-2: Foundation (scaffolding + types)
2. Steps 3-4: Basic indexes (AddedItem + Set implementations)
3. Steps 5-6: Map indexes (Unique + Many)
4. Step 7: Sorted indexes
5. Step 8: Multindex integration
6. Step 9: Reactivity
7. Step 10: BTree (future)

Steps can be combined if they're small, or split if they're large.
