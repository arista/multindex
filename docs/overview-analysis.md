# Overview Analysis

This document provides analysis of the [overview](./overview.md) design document for the Multindex library.

## Summary

Multindex is a well-conceived library for managing multiple indexed views of in-memory data, inspired by relational database indexing. The core abstraction is sound: a single authoritative collection that automatically maintains multiple derived indexes.

## Strengths

1. **Clear hierarchy of index types** - The inheritance chain (Index → SetIndex → MapIndex → SortedIndex) is logical and each level adds meaningful functionality.

2. **Unique vs Many distinction** - Separating unique-key and many-key indexes into different types is the right call. This enables type-safe APIs where unique indexes return `V` directly while many indexes return subindexes.

3. **Subindex concept** - Allowing Many indexes to contain nested indexes/multindexes is powerful. This enables hierarchical data organization (e.g., invoices grouped by customer, then sorted by date within each customer).

4. **Query API for SortedIndex** - The `SortQuery<PK>` approach with gt/ge/lt/le bounds is clean and familiar to anyone who's used database range queries.

## Gaps and Concerns

### 1. API Inconsistencies

The API shows `SortedIndex` defined twice (lines 98-104 and 118-119). The second definition extends `IndexBase<I>` instead of `MapIndex`, which contradicts the stated inheritance hierarchy. This appears to be an oversight.

### 2. Iteration vs Values

The interfaces extend `Iterable<I>` and have an `items` property returning `IterableIterator<I>`, but for `MapIndex`, what does iteration yield? The items `I`, or the values `V`? For Many indexes where `V` is a subindex, this distinction matters. The document should clarify:
- Does iterating a `ManyMapIndex` yield items `I`, or subindexes `V`?
- Should there be a separate `values: IterableIterator<V>` property?

### 3. Deletion Semantics

The overview states removing can only happen at the top-level Multindex, not in subindexes. This makes sense for data integrity, but what about:
- Removing all items matching a key from a ManyMapIndex?
- Removing items matching a query from a SortedIndex?

These could be useful convenience methods, even if they ultimately delegate to the parent Multindex.

### 4. Key Specification - The Hybrid Approach

The document explores several approaches for specifying keys:
- Functions: `i => i.name`
- Property names: `"name"`
- Arrays for compound keys: `[i => i.date, i => i.name]` or `["date", "name"]`

**My recommendation: Functions with helper utilities**

```typescript
// Simple key
const byName = uniqueMap(i => i.name)

// Compound key with mixed sort orders using a helper
const byDateName = manySorted(
  compoundKey(
    asc(i => i.date),
    desc(i => i.name),
    asc(i => i.id)
  )
)
```

This approach:
- Preserves full type inference (TypeScript can infer key types from function return types)
- Supports arbitrary computed keys, not just property access
- Makes sort order explicit via `asc()`/`desc()` wrappers
- Compound key helpers can return typed tuples for partial key matching

The property-name approach has type safety challenges. Given `["date", "name"]`, TypeScript would need mapped types or template literal types to infer the key type as `[Date, string]`. This is possible but complex and error-prone.

### 5. Partial Key Types for Compound Keys

The `PK` (partial key) concept is mentioned but not fully specified. For a compound key `[K1, K2, K3]`, the partial key type should be:
```typescript
type PK = [] | [K1] | [K1, K2] | [K1, K2, K3]
```

This can be expressed in TypeScript using recursive conditional types, but it's worth noting this adds complexity. Consider whether the implementation will handle this or if it should be simplified (e.g., always require full keys for queries, or use a different query syntax).

### 6. Error Handling

The overview mentions "error if key not found" for `get()` and "error if uniqueness violated" for unique indexes. Consider:
- What type of error? A specific `MultindexError` class hierarchy?
- Should there be options for different behaviors (throw vs return undefined vs return default)?
- For uniqueness violations during add, is the add rejected entirely, or does it replace the existing item?

### 7. Reactivity Integration

The dependency on chchchchanges is mentioned but details are sparse. Questions:
- Is reactivity opt-in per index, or all-or-nothing per Multindex?
- What's the notification mechanism? Signals? Callbacks?
- How are batch updates handled? If 100 items change, do we get 100 reindex operations or can they be batched?
- What happens if a key change would violate uniqueness? Is this detected before or after the underlying data changes?

### 8. Memory and Performance Considerations

Not addressed in the overview:
- Memory overhead per item per index?
- What happens with very large datasets (millions of items)?
- Are indexes lazy or eager? (e.g., does a SortedIndex maintain sorted order on every add, or sort lazily on iteration?)
- Index rebuild strategies after bulk operations?

### 9. Subindex Configuration

For Many indexes, the overview says:
> "those subindexes are defined when the Many index is created"

This raises questions:
- Is the subindex type/configuration the same for all keys, or can it vary per key?
- Can subindexes themselves be Many indexes, creating deeply nested structures?
- What's the syntax for defining the subindex factory?

### 10. Missing Functionality

Consider adding:
- `clear()` - remove all items
- `addAll(items: Iterable<I>)` - bulk add with potential optimizations
- `find(predicate)` / `filter(predicate)` - though this might conflict with the Index Filter concept
- Index statistics (for debugging/optimization)

## Opinion on Key Design Discussions

The overview presents a thoughtful exploration of the key specification problem. Here's my take:

**Use functions for keys, but provide ergonomic helpers for common patterns.**

The flexibility of arbitrary functions is too valuable to give up. However, the compound key problem is real. Here's a possible solution:

```typescript
// Key specification types
type KeyFn<I, K> = (item: I) => K
type SortDir = 'asc' | 'desc'
type SortSpec<I, K> = { key: KeyFn<I, K>, dir: SortDir }

// Helpers
function asc<I, K>(key: KeyFn<I, K>): SortSpec<I, K> { return { key, dir: 'asc' } }
function desc<I, K>(key: KeyFn<I, K>): SortSpec<I, K> { return { key, dir: 'desc' } }

// Compound key that extracts tuple type
function compoundKey<I, Specs extends SortSpec<I, any>[]>(...specs: Specs): CompoundKeySpec<I, Specs>

// Usage
const index = manySorted(compoundKey(
  asc(i => i.date),
  desc(i => i.priority),
  asc(i => i.id)
))
// Inferred key type: [Date, number, string]
// Partial key types: [] | [Date] | [Date, number] | [Date, number, string]
```

For the "add to subindex" functionality (setting an item's key to match a subindex), I'd suggest making this explicit rather than automatic:
```typescript
// Instead of magical backfilling
subindex.add(item) // implicitly sets item.customerId = subindexKey

// Be explicit
item.customerId = customerId
multindex.add(item)
```

This avoids the complexity of setter specifications and keeps data mutation explicit.

## Implementation Suggestions

### Index Creation API

The example in the overview is a bit awkward:
```typescript
class InvoiceItems extends Multindex {
  byId: this.uniqueHashMap<Invoice>(...)
```

This won't work because `this.uniqueHashMap()` can't be called in a property initializer before `super()`. Consider:

```typescript
// Option A: Builder pattern
const invoiceItems = Multindex.create<Invoice>(builder => ({
  byId: builder.uniqueMap(i => i.id),
  byDate: builder.manySorted(asc(i => i.date))
}))

// Option B: Decorator-based
class InvoiceItems extends Multindex<Invoice> {
  @uniqueMap(i => i.id)
  byId!: UniqueMapIndex<Invoice, string>

  @manySorted(asc(i => i.date))
  byDate!: ManySortedIndex<Invoice, SortedIndex<Invoice>, Date>
}

// Option C: Static definition
class InvoiceItems extends Multindex<Invoice> {
  static indexes = {
    byId: uniqueMap(i => i.id),
    byDate: manySorted(asc(i => i.date))
  }
}
```

### Reactivity Strategy

Given the dependency on chchchchanges, I'd suggest:
1. Keys should be computed from reactive properties
2. The index wraps the key function to track which properties are accessed
3. When those properties change, the index receives before/after notifications
4. Batch changes within a transaction/effect boundary into a single reindex operation

## Questions for the Author

1. What's the expected scale? Dozens of items? Thousands? Millions?
2. Should indexes support "views" that don't copy data but provide filtered/sorted access to another index?
3. Is there a use case for indexes that span multiple Multindexes (like a database join)?
4. How should serialization/deserialization work?
5. Should there be immutable variants that return new indexes instead of mutating?

## Conclusion

The Multindex library has a solid conceptual foundation. The main areas needing more detail are:
1. Concrete index creation syntax
2. Reactivity integration specifics
3. Error handling strategy
4. Partial key type handling for compound keys

The key specification discussion is the most complex design decision. I recommend the function-based approach with helpers, as it provides the best balance of type safety, flexibility, and ergonomics.
