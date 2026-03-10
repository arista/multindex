# Schema Design Analysis

This is my analysis of the schema-design.md document.

## Overall Impression

The document clearly identifies a real need: Domain Object Models need relationship navigation, cascade operations, and serialization. The key insight that cascade delete, JSON import, and JSON export all depend on the same "owning relationships" is valuable and suggests a unified approach.

## Questions and Concerns

### 1. What does Schema add beyond a plain object?

The document shows:
```
Schema.create<SCH>(f: (b: SchemaBuilder): SCH, config?: SchemaConfig)
```

But what does `SchemaBuilder.multindex()` provide that `createMultindex()` doesn't? If it's just passing through config defaults (domain, reactive), an application could achieve the same with:

```typescript
const config = { domain: myDomain, reactive: true }
const schema = {
  User: createMultindex<User>()((b) => ({ ... }), config),
  Book: createMultindex<Book>()((b) => ({ ... }), config),
}
```

For Schema to be worthwhile, it needs to provide something more:
- Automatic entity factory registration for restore?
- Coordinated clear/dispose across all indexes?
- Schema-level serialization (dump/restore all indexes)?
- A way to get the containing schema from any index?

### 2. How do entities get their schema reference?

The document mentions `this.schema` but doesn't detail how this is set. Options:

**A. Constructor injection:**
```typescript
class Account {
  constructor(private schema: Schema) {}
}
```
Con: Every entity construction needs the schema passed in.

**B. Property assignment after add:**
```typescript
const account = new Account()
schema.Account.add(account) // internally sets account.schema = schema
```
Con: Entity is incomplete between construction and add.

**C. Global/context-based:**
```typescript
const account = schema.Account.create(props) // schema is implicit
```
This might be cleanest - the Multindex creates the entity and injects the schema reference.

### 3. The `deletingEntity` property seems awkward

```typescript
CascadeDeleting<E = unknown> {
  deletingEntity: E  // "used to track which entities have already been marked"
}
```

Why not track entities directly in a Set<CascadeDeleting>? The indirection through `deletingEntity` suggests handling cases where a wrapper implements CascadeDeleting on behalf of an entity. Is this common enough to warrant the complexity?

If wrappers are rare, simplify to:
```typescript
interface CascadeDeleting {
  cascadeDelete(op: DeleteOperation): void
  deleteSelf(): void
}
```
And track with `Set<CascadeDeleting>`.

### 4. Where should "owning relationships" be declared?

The document suggests entities would declare these, but doesn't specify how. Options:

**A. Method override (current approach):**
```typescript
cascadeDelete(op) {
  op.addAll(this.entries)
  op.add(this.summary)
}
```
Con: Must be kept in sync with actual relationships manually.

**B. Declarative metadata:**
```typescript
@owning entries: Entry[]
@owning summary: Summary
```
Or without decorators:
```typescript
static owningRelationships = ['entries', 'summary'] as const
```
Pro: Single source of truth for cascade delete, import, and export.

**C. Convention-based:**
All `get` properties returning `IndexBase` or entities are owning.
Con: Too magical, doesn't distinguish owning from non-owning refs.

I'd lean toward **B** - explicit but declarative. The entity declares its owning relationships once, and cascade delete / import / export all use that declaration.

### 5. The reactive proxy footgun

> "the resulting entity will be wrapped in a reactive Proxy. We need to be careful to use this object from now on"

This is dangerous. Suggestions:

- Document clearly that `add()` returns the proxied entity
- Consider having entity constructors themselves return proxies (via a factory)
- Or have entities be "proxy-aware" - storing self-reference to their proxy

### 6. Leverage existing subtypeName for type discrimination?

Multindex already has `subtypeName` (e.g., "Asset.Vehicle.Car"). Could JSON import/export use this as the type discriminator field automatically?

```typescript
// Export would include: { _type: "Vehicle.Car", ... }
// Import would use _type to call getSubtypeIndex(_type).add(...)
```

This connects the existing subtype infrastructure to serialization.

### 7. InsertOperation and ExportOperation similarity

Both traverse a graph and track visited nodes. Consider a common base:

```typescript
abstract class GraphOperation<TNode, TResult> {
  private visited = new Map<TNode, TResult>()

  process(node: TNode): TResult {
    if (this.visited.has(node)) return this.visited.get(node)!
    const result = this.processNode(node)
    this.visited.set(node, result)
    return result
  }

  abstract processNode(node: TNode): TResult
}
```

## Recommendations

1. **Schema should provide tangible value** - entity factory registration, coordinated operations, schema-from-index lookup

2. **Make relationship metadata declarative** - a single declaration used by cascade delete, import, and export

3. **Leverage subtypeName for serialization** - connect existing infrastructure to JSON type discrimination

4. **Consider a graph operation base** - shared logic for traversing/caching entity graphs

5. **Clarify entity construction lifecycle** - when does schema get assigned? When is proxy wrapping done?

## What Multindex Should Provide

Based on the analysis, Multindex could help with:

| Feature | Multindex | Application |
|---------|-----------|-------------|
| Schema container | Provide Schema.create | Define structure |
| Entity factory registration | Provide registration API | Provide factory functions |
| Cascade delete | Provide DeleteOperation | Declare owning relationships |
| JSON dump/restore | Provide on Schema/Multindex | Minimal - just factories |
| JSON import (hierarchical) | Provide ImportOperation | Declare owning relationships |
| JSON export (hierarchical) | Provide ExportOperation | Declare owning relationships |

The key is that **owning relationships** are the shared concept. If entities can declare these once (via metadata), Multindex can provide the operations that traverse them.
