# Design Analysis

Analysis of the Multindex technical design document.

## Summary

The design presents a well-structured approach to building reactive multi-indexed collections. The API is cleanly separated into building (IndexBuilder) and using (Index interfaces) phases, with good TypeScript generics for type safety. The IndexImplBase approach of concentrating common functionality is sound.

## Strengths

### Clean API Separation
The distinction between `IndexBuilder` (construction-time) and the `Index` interfaces (usage-time) provides good separation of concerns. Applications define their index structure once, then use a clean read/query API.

### Thoughtful Filter Handling
The distinction between "added" and "included" items is well-considered. Tracking added-but-not-included items allows filters to become true later through reactivity, which is exactly the right behavior.

### Flexible Key Specifications
Supporting both getter functions (`i => i.name`) and full specs with optional setters provides a good balance of simplicity for common cases and power for advanced use cases (like adding to subindexes).

### Compound Sort Key Design
The partial key type (`PartialSortKey`) for range queries on compound keys is elegant. Allowing queries like `ge: [date]` on a `[date, name, id]` key is very useful.

### Centralized Implementation Logic
The `IndexImplBase` design that handles keys, filters, subindexes, and reactivity in one place, with subclasses only implementing storage-specific methods, should reduce code duplication and bugs.

## Issues and Concerns

### Type System Challenges

**Compound Key Tuple Types** (line 114-121): The comment "Does it make sense to explicitly list out tuple types..." reflects a real TypeScript challenge. Deriving `PartialSortKey` from arbitrary tuple types is difficult. Consider:
- Limiting compound keys to a maximum arity (e.g., 5 elements)
- Using explicit tuple overloads rather than trying to derive them generically
- Documenting the approach taken

**SubindexSpec Type Mismatch** (line 137): `SubindexSpec` returns `Subindex<I>`, but `ManyMapSpec` declares `SUBIX extends Index<I>`. The relationship between these needs clarification.

### API Gaps

**Missing Convenience Methods**:
- No `isEmpty` on indexes
- No `first()` / `last()` on SortedIndex (common use case)
- No bulk operations (`addAll`, `removeAll`)
- No `toArray()` method (must use `Array.from(index.items)`)

**Multindex.remove Return Type** (line 17): Returns `I`, but what if the item wasn't present? Should return `I | undefined` for consistency with Map.delete semantics, or return `boolean`.

**SortedIndex View Semantics** (line 169-172): `query()` and `reverse()` return `SortedIndex`, but are these:
- Live views that reflect changes to the underlying index?
- Read-only views?
- Can you chain them (`index.reverse().query({gt: x})`)?

This needs explicit specification.

### Implementation Ambiguities

**processChange Parameter Inconsistency** (line 383-410): The method signature shows `processChange(addedItem, change)` but the calls at lines 384-388 only pass a lambda. The signature should be:
```
processChange(addedItem: AddedItem<I, K>, change: () => void)
```

**AddedItem Method Access** (line 244-248): `computeKey()` and `computeFilter()` need access to the index's `keyFn` and `filterFn`. Either:
- AddedItem needs a reference back to its owning index, or
- These should be methods on the index that take an AddedItem

**Key Equality Depth** (line 324-325): For compound keys, "array element equality" needs clarification:
- Shallow comparison of array elements?
- What if a key element is an object?
- Consider using `===` for primitives, `Object.is` for objects, or allowing custom comparators

**Error Handling Strategy**: "uniqueness violation error" (line 347) - is this a thrown exception? What type? Consider defining a `MultindexError` class hierarchy.

### The `mult` Builder Function

The `mult` function (line 44) returns `SetIndex & IXS` without `remove()`. The rationale ("similar to a Multindex, except that it doesn't have a remove method") is unclear:
- Why can you `add` but not `remove`?
- If this is for subindexes, removal should flow down from the parent anyway
- Consider documenting the intended use case

### Memory and Performance

**Subindex Cleanup for Deep Hierarchies**: `checkForEmptySubindexAtKey` handles immediate cleanup, but what about deeply nested Many indexes? A chain like `ManyMap -> ManyMap -> ManyMap` might accumulate empty intermediate subindexes if cleanup doesn't propagate fully.

**addedItems Map Optimization** (lines 258-262): The design mentions this map "might be optimized out" for indexes without keys/filters or without reactivity. Consider making this a first-class configuration option rather than an implementation detail, as it could significantly impact memory usage for large collections.

### Reactivity Edge Cases

**Rapid Changes**: What happens if an item's key changes multiple times within a single reactive batch? The design should specify if changes are coalesced or processed individually.

**Filter/Key Function Errors**: What happens if `keyFn` or `filterFn` throws an error? Should the item be excluded? Should an error propagate?

**Concurrent Modification**: What if an item is modified during iteration? This is particularly relevant for reactive scenarios.

### Missing from Design

**Index Serialization**: No mention of serializing/deserializing indexes. For persistence or transfer, this could be useful.

**Index Events/Observers**: Beyond chchchchanges integration, having explicit events (`onAdd`, `onRemove`, `onReindex`) could be useful for debugging or external integrations.

**BTree Configuration**: `UniqueBTreeSpec` and `ManyBTreeSpec` are mentioned but "implementation TBD". Consider what configuration options BTrees might need (node size, etc.).

## Suggestions

1. **Clarify view semantics** for `query()` and `reverse()` - these are likely to be a source of confusion.

2. **Add convenience methods** (`first()`, `last()`, `isEmpty`) - they're trivial to implement and commonly needed.

3. **Define error types** - a `MultindexError` base class with subclasses for uniqueness violations, key-not-found, etc.

4. **Document the TypeScript approach** for compound key types once decided.

5. **Consider a "strict mode"** that catches issues like modifying items during iteration.

6. **Add examples** - the design is quite abstract. Concrete examples of building and using indexes would help validate the API ergonomics.

## Questions for Clarification

1. Should `SortedIndex` views be live or snapshot-based?
2. What's the intended maximum arity for compound keys?
3. Should indexes support a "frozen" or read-only mode?
4. How should errors in key/filter functions be handled?
5. Is there a use case for non-reactive Multindexes (for performance)?

## Conclusion

The design is solid overall, with good abstractions and careful attention to the complex interactions between filters, keys, subindexes, and reactivity. The main areas needing attention are:
- TypeScript type machinery for compound keys
- Clarifying view/query semantics
- Error handling strategy
- A few API conveniences

Addressing these before implementation will save significant refactoring effort.
