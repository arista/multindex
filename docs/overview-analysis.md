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

#### Author's Response:

Removed the second SortedIndex - yes, that was an oversight

#### Follow-up:

Good, that clears it up.

### 2. Iteration vs Values

The interfaces extend `Iterable<I>` and have an `items` property returning `IterableIterator<I>`, but for `MapIndex`, what does iteration yield? The items `I`, or the values `V`? For Many indexes where `V` is a subindex, this distinction matters. The document should clarify:
- Does iterating a `ManyMapIndex` yield items `I`, or subindexes `V`?
- Should there be a separate `values: IterableIterator<V>` property?

#### Author's Response:

I think iterating over any index should return its items.  I think this is implied by the IndexBase inheritance, no?

#### Follow-up:

Yes, `IndexBase<I>` extending `Iterable<I>` does imply iteration yields items. My concern was more about whether `ManyMapIndex` should *also* provide access to its subindexes (the `V` values). Consider: if you have invoices grouped by customer, you might want to iterate all invoices (items), but you might also want to iterate the customer groups (subindexes). Currently `keys` gives you customer IDs, and `get(customerId)` gives you one subindex, but there's no `values` iterator. Probably fine to defer this - users can do `for (const key of index.keys) { const subindex = index.get(key); ... }`.

### 3. Deletion Semantics

The overview states removing can only happen at the top-level Multindex, not in subindexes. This makes sense for data integrity, but what about:
- Removing all items matching a key from a ManyMapIndex?
- Removing items matching a query from a SortedIndex?

These could be useful convenience methods, even if they ultimately delegate to the parent Multindex.

#### Author's Response:

Those two suggestions are actually quite interesting!  Would those make more sense as a "clear()" method on any index or Multindex?  Oh nvm, I see you suggest that later.

#### Follow-up:

Yes, `clear()` on any index/subindex makes sense. The semantics would be: remove all items contained in this index from the parent Multindex. For a subindex in a ManyMapIndex, that means removing all items with that particular key. For a query result from a SortedIndex, that means removing all items in the range. Clean and intuitive.

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

#### Author's Response:

Ok, your suggestion sounds good.  My only question would be setters, if the application wants to use them.  Would they be specified in the same place, perhaps with a helper?  Something like:

uniqueMap(key(i=>i.name, (i,v)=>{i.name = v}))

#### Follow-up:

Yes, that pattern would work. For compound keys with setters:

```typescript
manySorted(compoundKey(
  asc(i => i.date, (i, v) => { i.date = v }),
  desc(i => i.priority, (i, v) => { i.priority = v })
))
```

The type signature for the helper would be something like:
```typescript
function asc<I, K>(
  getter: (item: I) => K,
  setter?: (item: I, value: K) => void
): SortSpec<I, K>
```

If setter is provided, it unlocks `subindex.add(item)` functionality. If not, that method could either be unavailable (via conditional types) or throw at runtime. I'd lean toward the latter for simplicity - the conditional types approach gets complex.

### 5. Partial Key Types for Compound Keys

The `PK` (partial key) concept is mentioned but not fully specified. For a compound key `[K1, K2, K3]`, the partial key type should be:
```typescript
type PK = [] | [K1] | [K1, K2] | [K1, K2, K3]
```

This can be expressed in TypeScript using recursive conditional types, but it's worth noting this adds complexity. Consider whether the implementation will handle this or if it should be simplified (e.g., always require full keys for queries, or use a different query syntax).

#### Author's Response:

I think the ability to specify bounds with partial keys is valuable, and difficult to do without built-in functionality.  I'm counting on TypeScript (well, you being able to write TypesScript) being able to specify this, and to do it with minimal impact on the user through some powerful inference magic.

#### Follow-up:

Agreed, and yes this is achievable. Here's a sketch of the type-level machinery:

```typescript
// Generate prefix types from a tuple
type Prefixes<T extends any[]> = T extends [infer First, ...infer Rest]
  ? [] | [First, ...Prefixes<Rest>]
  : [];

// Example: Prefixes<[Date, string, number]> =
//   [] | [Date] | [Date, string] | [Date, string, number]
```

The user never sees this - they just write `index.query({ ge: [someDate] })` and TypeScript validates that `[Date]` is a valid prefix of `[Date, string, number]`. If they try `{ ge: [someString] }` they get a type error. The inference magic comes from the `compoundKey()` helper inferring the full key tuple type, then the index type computing the prefix type automatically.

### 6. Error Handling

The overview mentions "error if key not found" for `get()` and "error if uniqueness violated" for unique indexes. Consider:
- What type of error? A specific `MultindexError` class hierarchy?
- Should there be options for different behaviors (throw vs return undefined vs return default)?
- For uniqueness violations during add, is the add rejected entirely, or does it replace the existing item?

#### Author's Response:

I'm not sure there are going to be a whole lot of errors involved in the library.  But to address a couple of your questions:

* for a key not found, the MapIndex has both tryGet (no error), and get (error)
* for uniqueness violation, it should ignore the input and throw an error

So I guess that's two errors, which I guess means it makes sense for there to be a MultindexError hierarchy

#### Follow-up:

Makes sense. A simple hierarchy would be:

```typescript
class MultindexError extends Error {}
class KeyNotFoundError extends MultindexError { key: unknown }
class DuplicateKeyError extends MultindexError { key: unknown; existingItem: unknown }
```

The `DuplicateKeyError` including the existing item is useful for debugging ("you tried to add invoice 123 but invoice 123 already exists"). Keep it minimal - we can add more error types later if needed.

### 7. Reactivity Integration

The dependency on chchchchanges is mentioned but details are sparse. Questions:
- Is reactivity opt-in per index, or all-or-nothing per Multindex?
- What's the notification mechanism? Signals? Callbacks?
- How are batch updates handled? If 100 items change, do we get 100 reindex operations or can they be batched?
- What happens if a key change would violate uniqueness? Is this detected before or after the underlying data changes?

#### Author's Response:

Yes, this is a ittle vague right now.   My guess is that each Multindex is created with some kind of context, which includes the ChangeDomain.  It would be nice if there's a way to make this more ergonomic.  I suppose having an implicit global ChangedDomain would work, and require each Multindex to opt-out.  That might require some support from chchchchanges for a global ChangeDomain, which so far hasn't been offered.

For the notification mechanism, can it just be whatever chchchchanges offers?

Regarding batch updates, see #8 below

#### Follow-up:

Using whatever chchchchanges offers makes sense - keeps the libraries cleanly separated. For ergonomics, a pattern I've seen work well:

```typescript
// Option 1: Explicit context
const ctx = new MultindexContext(changeDomain)
const invoices = new InvoiceIndex(ctx)

// Option 2: Global default with override
MultindexContext.setDefault(changeDomain)
const invoices = new InvoiceIndex() // uses default
const special = new InvoiceIndex({ changeDomain: otherDomain }) // override
```

Option 2 is more ergonomic for apps that use a single ChangeDomain everywhere (probably common), while still allowing flexibility. I'd suggest starting with Option 1 (explicit) and adding the global default later if it becomes painful.

### 8. Memory and Performance Considerations

Not addressed in the overview:
- Memory overhead per item per index?
- What happens with very large datasets (millions of items)?
- Are indexes lazy or eager? (e.g., does a SortedIndex maintain sorted order on every add, or sort lazily on iteration?)
- Index rebuild strategies after bulk operations?

#### Author's Response:

I think the memory and large datasets issues are just going to be what they will be.  For now, no need to optimize for them, or to disallow them

For deferring and batching indexing operations, though, especially around sorting, this is a really good question.  To start with, the easiest thing is to just reindex with every change.

If we want to handle bulk operations, then I think we'll need to introduce an application-level concept like a transaction, to allow the application to demarcate the bulk update.  The semantics should also be well defined, that in such a situation no updates to the indexes should be expected until the end of the transaction, otherwise updates will be immediate.

I guess a bulk update will help with the case where an object might otherwse get re-indexed multiple times.

You also brought up the issue of lazy or eager indexes.  I think that matters most for a sorted array index (not BTree, I think), where it's probably easier to sort a bunch entries at once rather than reindexing them all one by one.  For that, I think there needs to be some kind of heuristic connected to a transaction - if a transaction ends up wanting to reindex some significant fraction of a sorted index, then go ahead and do a full re-sort.

Regarding lazy regeneration - this is a good question.  The system is meant to work with chchchchanges, and possibly even with [brint](../../brint/README.md).  There is already a notion of signaling changes to values that downstream items can use to invalidate cached values and regenerate when they need to.  We should think how to hook into those systems more deeply, but perhaps start with just a "dumb" approach.

#### Follow-up:

Agreed on starting "dumb" (eager reindexing on every change). The transaction concept is the right abstraction for bulk operations. Sketch:

```typescript
multindex.transaction(() => {
  for (const invoice of invoices) {
    multindex.add(invoice)
  }
}) // indexes updated once here
```

For the sorted array heuristic: if > 10-20% of items need reindexing within a transaction, do a full sort instead of N individual reindex operations. This threshold can be tuned later based on benchmarks.

The lazy/eager question can probably be deferred. Start eager, and if profiling shows it's a bottleneck, add a lazy mode where indexes mark themselves dirty and rebuild on first access after a transaction.

### 9. Subindex Configuration

For Many indexes, the overview says:
> "those subindexes are defined when the Many index is created"

This raises questions:
- Is the subindex type/configuration the same for all keys, or can it vary per key?
- Can subindexes themselves be Many indexes, creating deeply nested structures?
- What's the syntax for defining the subindex factory?

#### Author's Response:

Subindex type is the same for all keys - it's part of the parent's signature (although hopefully inferred).  Configuration in theory could vary, but in practice it really shouldn't.

Yes, subindexes can be many indexes - deep nesting is perfectly allowed

The syntax is still TBD, it's likely a required parameter to a many index - a function that takes a key from the parent and returns a subindex

#### Follow-up:

For the factory syntax, something like:

```typescript
manyMap(
  i => i.customerId,
  (key) => uniqueSortedArray(i => i.date) // subindex factory
)
```

The factory receives the key so it *could* use it for configuration, but typically won't. The return type of the factory determines the `V` type parameter. TypeScript should infer all of this:

```typescript
// Inferred type:
// ManyMapIndex<Invoice, UniqueSortedIndex<Invoice, Date>, string>
```

### 10. Missing Functionality

Consider adding:
- `clear()` - remove all items
- `addAll(items: Iterable<I>)` - bulk add with potential optimizations
- `find(predicate)` / `filter(predicate)` - though this might conflict with the Index Filter concept
- Index statistics (for debugging/optimization)

#### Author's Response:

clear and addAll are good.  I suppose find is good... although, is there a general set of functions available to anything that's Iterable?  Or maybe a widespread library of such?

#### Follow-up:

For iterable utilities, there's [iterare](https://www.npmjs.com/package/iterare) and similar libraries, but nothing in the standard library beyond `Array.from()`. Since indexes already extend `Iterable<I>`, users can do `Array.from(index).find(...)` or use a library.

That said, `find()` on an index could be smarter than the generic version - it could stop early and avoid materializing an array. Probably not worth adding initially, but keep it in mind.

The more valuable addition might be `first()` and `last()` for SortedIndex - getting the min/max item without iteration. These are O(1) for most sorted data structures.

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

#### Author's Response:

Regarding removing setters - hm.  I'll have to think about this.  I know in ORM's it's fairly useful (at least in ActiveRecord, but I know other ORM's don't offer this).  You might be right that it's not worth it.

#### Follow-up:

Fair point about ORMs. If we do support setters, I'd make them fully optional - a convenience for those who want it, but not required. The key design (with optional setter parameter) I proposed earlier would support this naturally. We can defer the decision and add setter support later without breaking changes.

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

#### Author's Response

That's a shame about "this" not being available.  I do want this to be typesafe, so you can just do invoiceItems.byId..., but also ergonomic - ideally declaring the property, configuring the index, and having the type be inferred.  Can any of the above do that?

#### Follow-up:

**Option A (Builder)** can achieve all three goals:

```typescript
const InvoiceItems = Multindex.create<Invoice>(b => ({
  byId: b.uniqueMap(i => i.id),
  byDate: b.manySorted(asc(i => i.date))
}))

// TypeScript infers:
// {
//   byId: UniqueMapIndex<Invoice, string>,
//   byDate: ManySortedIndex<Invoice, ..., Date>
// } & MultindexBase<Invoice>

const items = new InvoiceItems()
items.byId.get("123") // fully typed
```

The builder function's return type is inferred from the object literal, and `Multindex.create` returns a class that has those properties typed correctly. This requires some type-level gymnastics but is definitely achievable.

**Option B (Decorators)** requires explicit type annotations (the `!:` syntax), so it fails the "type be inferred" requirement.

**Option C (Static)** could work with some cleverness, but feels less natural.

I'd recommend Option A. Want me to prototype the types for `Multindex.create`?

### Reactivity Strategy

Given the dependency on chchchchanges, I'd suggest:
1. Keys should be computed from reactive properties
2. The index wraps the key function to track which properties are accessed
3. When those properties change, the index receives before/after notifications
4. Batch changes within a transaction/effect boundary into a single reindex operation

#### Author's Response

This looks good.  I think another question is downstream changes - can reactive functions be built on the indexes themselves.  Would this mean giving them first-class support in chchchchanges?  Or maybe defining an extension mechanism for chchchchanges?

#### Follow-up:

Good question. For downstream reactivity (e.g., a computed value that depends on `index.count`), there are a few approaches:

1. **Index properties as signals**: `index.count` could itself be a reactive signal that updates when items are added/removed. This would require chchchchanges integration.

2. **Change events**: Indexes emit events (`itemAdded`, `itemRemoved`, `reindexed`) that downstream code can subscribe to. More traditional but less elegant with signals.

3. **Extension mechanism**: Multindex provides hooks that chchchchanges can use to wrap index properties as signals. This keeps the libraries decoupled.

I'd lean toward option 3 - define a clear interface (like `IndexObserver`) that chchchchanges can implement. This way multindex doesn't depend on chchchchanges internals, just on an abstract observer interface. The chchchchanges integration would be a separate adapter.

## Questions for the Author

1. What's the expected scale? Dozens of items? Thousands? Millions?
2. Should indexes support "views" that don't copy data but provide filtered/sorted access to another index?
3. Is there a use case for indexes that span multiple Multindexes (like a database join)?
4. How should serialization/deserialization work?
5. Should there be immutable variants that return new indexes instead of mutating?

#### Author's Response

1. call it thousands
2. not interested in that for now
3. no I don't think so, at least not now.  That can probably be done at the application level if needed
4. not sure about that for now.  It's an interesting question - sort of a "database dump"
5. no - this is meant more for interaction with things like chchchchanges or brint, less with things like purely functional React.

#### Follow-up:

These answers help scope the initial implementation. A few notes:

- **Thousands of items**: This means we don't need to worry about memory-mapped structures or streaming. Simple in-memory data structures (arrays, Maps, Sets) will work fine. BTree might still be useful for sorted indexes with frequent insertions, but a sorted array with binary search is a reasonable starting point.

- **Serialization**: Could be as simple as `JSON.stringify(Array.from(multindex))` for the items, then rebuilding indexes on load. The indexes themselves don't need to be serialized since they're derived from the items. Something to design later but not blocking.

- **No immutable variants**: Makes sense given the reactive focus. Mutability is the point.

## Conclusion

The Multindex library has a solid conceptual foundation. The main areas needing more detail are:
1. Concrete index creation syntax
2. Reactivity integration specifics
3. Error handling strategy
4. Partial key type handling for compound keys

The key specification discussion is the most complex design decision. I recommend the function-based approach with helpers, as it provides the best balance of type safety, flexibility, and ergonomics.
