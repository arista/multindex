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

> Author's response: I'm open to limiting compound keys to a maximum arity. Is there a typical number used in systems like these?

**SubindexSpec Type Mismatch** (line 137): `SubindexSpec` returns `Subindex<I>`, but `ManyMapSpec` declares `SUBIX extends Index<I>`. The relationship between these needs clarification.

> Author's response: corrected

### API Gaps

**Missing Convenience Methods**:

- No `isEmpty` on indexes
- No `first()` / `last()` on SortedIndex (common use case)
- No bulk operations (`addAll`, `removeAll`)
- No `toArray()` method (must use `Array.from(index.items)`)

> Author's response: these are all good. However, right now I'm trying to concentrate on core functions that might illuminate issues in the architecture, and it doesn't seem like these would do that. Perhaps adding a TODO to PLANS.md would make sense

**Multindex.remove Return Type** (line 17): Returns `I`, but what if the item wasn't present? Should return `I | undefined` for consistency with Map.delete semantics, or return `boolean`.

> Author's response: I think that's a mistake. I'm just having it return void now.

**SortedIndex View Semantics** (line 169-172): `query()` and `reverse()` return `SortedIndex`, but are these:

- Live views that reflect changes to the underlying index?
- Read-only views?
- Can you chain them (`index.reverse().query({gt: x})`)?

This needs explicit specification.

> Author's response: good point. I think perhaps it makes sense to introduce a SortedView interface which is chainable. And see if part of the SortedIndex interface can be replaced with the SortedVies.

### Implementation Ambiguities

**processChange Parameter Inconsistency** (line 383-410): The method signature shows `processChange(addedItem, change)` but the calls at lines 384-388 only pass a lambda. The signature should be:

```
processChange(addedItem: AddedItem<I, K>, change: () => void)
```

> Author's response: corrected

**AddedItem Method Access** (line 244-248): `computeKey()` and `computeFilter()` need access to the index's `keyFn` and `filterFn`. Either:

- AddedItem needs a reference back to its owning index, or
- These should be methods on the index that take an AddedItem

> Author's response: I think the latter is a better approach (unless there are other things on AddedItem that require a reference to the index, but even so, perhaps it's better to move those out as well)

**Key Equality Depth** (line 324-325): For compound keys, "array element equality" needs clarification:

- Shallow comparison of array elements?
- What if a key element is an object?
- Consider using `===` for primitives, `Object.is` for objects, or allowing custom comparators

> Author's response: yes, I need to specify better. The idea is to see if a key changed without doing a ton of work. What you suggest might work ok (without custom comparators), but what is `Object.is`? Also I need to make sure that compound keys are treated specially, so that they do a shallow compare on the elements of the key

**Error Handling Strategy**: "uniqueness violation error" (line 347) - is this a thrown exception? What type? Consider defining a `MultindexError` class hierarchy.

> Author's response: yes, exceptions should be thrown. I think a MultindexError is proposed in the overview-analysis.md.

### The `mult` Builder Function

The `mult` function (line 44) returns `SetIndex & IXS` without `remove()`. The rationale ("similar to a Multindex, except that it doesn't have a remove method") is unclear:

- Why can you `add` but not `remove`?
- If this is for subindexes, removal should flow down from the parent anyway
- Consider documenting the intended use case

> Author's response: what I'm trying to get across, perhaps unclearly, is that something like Multindexes can be used as subindexes, in that they are SetIndexes with additional indexes as properties. But technically they're not quite Multindexes since they don't have the remove() method. And like other subindexes, add() has a slightly different meaning, in that it's meant to set the properties of an item so that it matches the key of the subindex. Wait a second... I totally forgot to spec out add() on subindexes! I should do that, and remember that it needs to be recursive. But yes, the idea is that using a multindex in this way is supposed to allow its add/remove to be called behind the scenes, and present a more restrictive interface to the app than the full Multindex.

### Memory and Performance

**Subindex Cleanup for Deep Hierarchies**: `checkForEmptySubindexAtKey` handles immediate cleanup, but what about deeply nested Many indexes? A chain like `ManyMap -> ManyMap -> ManyMap` might accumulate empty intermediate subindexes if cleanup doesn't propagate fully.

**addedItems Map Optimization** (lines 258-262): The design mentions this map "might be optimized out" for indexes without keys/filters or without reactivity. Consider making this a first-class configuration option rather than an implementation detail, as it could significantly impact memory usage for large collections.

> Author's response: what configuration would you suggest?

### Reactivity Edge Cases

**Rapid Changes**: What happens if an item's key changes multiple times within a single reactive batch? The design should specify if changes are coalesced or processed individually.

> Author's response: interesting - so you're talking perhaps about waiting for a nextTick or something like that? Perhaps it would make the most sense to put that kind of option in the chchchchanges library (which I do control)

**Filter/Key Function Errors**: What happens if `keyFn` or `filterFn` throws an error? Should the item be excluded? Should an error propagate?

> Author's response: for now, just propagate errors

**Concurrent Modification**: What if an item is modified during iteration? This is particularly relevant for reactive scenarios.

> Author's response: I want to avoid getting too fancy here. The easiest thing to do is nothing - basically an app just has to deal with it the same was as if it were knowingly modifying a structure while iterating over it. Another approach is to rely on those sorts of "nextTick" transactions. Regardless, I'm hoping to not introduce a special mechanism for this

### Missing from Design

**Index Serialization**: No mention of serializing/deserializing indexes. For persistence or transfer, this could be useful.

> Author's response: good to add to TODO of PLANS.md

**Index Events/Observers**: Beyond chchchchanges integration, having explicit events (`onAdd`, `onRemove`, `onReindex`) could be useful for debugging or external integrations.

> Author's response: good to add to TODO of PLANS.md

**BTree Configuration**: `UniqueBTreeSpec` and `ManyBTreeSpec` are mentioned but "implementation TBD". Consider what configuration options BTrees might need (node size, etc.).

## Suggestions

1. **Clarify view semantics** for `query()` and `reverse()` - these are likely to be a source of confusion.

2. **Add convenience methods** (`first()`, `last()`, `isEmpty`) - they're trivial to implement and commonly needed.

3. **Define error types** - a `MultindexError` base class with subclasses for uniqueness violations, key-not-found, etc.

4. **Document the TypeScript approach** for compound key types once decided.

5. **Consider a "strict mode"** that catches issues like modifying items during iteration.

6. **Add examples** - the design is quite abstract. Concrete examples of building and using indexes would help validate the API ergonomics.

> Author's response: this is a good point. Are you saying that examples would help you understand this more (doesn't seem like it), or more for humans reading?

## Questions for Clarification

1. Should `SortedIndex` views be live or snapshot-based?

> Author's response: definitely live

2. What's the intended maximum arity for compound keys?
3. Should indexes support a "frozen" or read-only mode?

> Author's response: do you mean something that errors if any modifications are attempted? I think that might require additional features in chchchchanges. Might be worthwhile, but probably more a future thing. Unless that's not what you intended.

4. How should errors in key/filter functions be handled?
5. Is there a use case for non-reactive Multindexes (for performance)?

> Author's response: it's sounding more and more like this is a good idea, both for efficiency and functionality. The question is how to make it obvious what's happening in configuration or something, so that developers aren't surprised by either that lack of reactivity, or unexpected ineffeciency for static data.

> Author's response: I also just realized that I never specified that add() is supposed to wrap the object in chchchchanges reactivity

## Design Document Checklist

Items to address before implementation:

- [x] Specify maximum compound key arity (recommend 4-5) - chose 6
- [x] Introduce `SortedView` interface for `query()`/`reverse()` results - specify live, read-only, chainable behavior
- [x] Spec out `add()` on subindexes - recursive key-setting behavior
- [x] Document that `add()` wraps objects in chchchchanges reactivity
- [x] Clarify key equality: `===` for primitives, shallow element comparison for compound key arrays
- [x] Add `reactive?: boolean` to `MultindexConfig` for non-reactive mode
- [x] Change `Multindex.remove()` return type to `void`
- [x] Move `computeKey()`/`computeFilter()` from `AddedItem` to index methods

## Conclusion

The design is solid overall, with good abstractions and careful attention to the complex interactions between filters, keys, subindexes, and reactivity. The main areas needing attention are:

- TypeScript type machinery for compound keys
- Clarifying view/query semantics
- Error handling strategy
- A few API conveniences

Addressing these before implementation will save significant refactoring effort.
