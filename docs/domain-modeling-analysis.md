# Domain Modeling Analysis

Summary of discussion on domain modeling patterns with Multindex.

## Naming Conventions

Settled on these JSON format names:

| Name | Purpose | Relationships | Strictness |
|------|---------|---------------|------------|
| **Props** | Own properties, passed to constructor, used for dump/restore | No | Strict (all fields) |
| **Input** | Graph format for creation | Yes (nested) | Forgiving (optional fields, defaults) |
| **JSON** | Graph format for export | Yes (nested) | Strict |

- `UserProps` - flat, own properties
- `UserInput` - for creating entities with relationships
- `UserJSON` - for exporting entities with relationships

Utility type for making specific fields optional in Input:
```typescript
type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

type UserInput = MakeOptional<UserProps, 'id' | 'createdAt'> & {
  posts?: PostInput[]  // relationships
}
```

## Entity Construction Pattern

**Constructor takes Props (complete, flat):**
```typescript
constructor(props: UserProps, ctx: Ctx) {
  super(ctx)
  this.id = props.id
  this.name = props.name
  // ...
}
```

**fromInput factory normalizes Input to Props:**
```typescript
static fromInput(input: UserInput, ctx: Ctx): User {
  const props = User.inputToProps(input, ctx)
  const user = new User(props, ctx)
  ctx.schema.User.add(user)
  // handle relationships...
  return user
}

static inputToProps(input: UserInput, ctx: Ctx): UserProps {
  return {
    id: input.id ?? ctx.generateId(),
    name: input.name,
    // normalize, apply defaults
  }
}
```

**Subtype dispatch:** Simple switch statement in fromInput is most straightforward:
```typescript
static fromInput(input: VehicleInput, ctx: Ctx): Vehicle {
  switch (input._type) {
    case "Car": return Car.fromInput(input, ctx)
    case "Truck": return Truck.fromInput(input, ctx)
    default: // ...
  }
}
```

## Schema

Schema is just an object holding Multindexes - no formal construct needed:
```typescript
const ctx = {
  schema: {
    User: createMultindex<User>()(...),
    Address: createMultindex<Address>()(...),
  },
  generateId: () => { ... }
}
```

Entities hold reference to ctx for relationship lookups and utilities.

## Owned Relationships

Used for three operations:
1. **Cascade delete** - delete entity and all owned children
2. **Import (fromInput)** - create entity and owned children from Input
3. **Export (toJSON)** - serialize entity and owned children

Currently implemented manually in each operation:
```typescript
// Cascade delete
cascadeDelete(op: DeleteOperation) {
  op.addAll(this.posts)
  op.add(this.profile)
}

// Import
static fromInput(input: UserInput, ctx: Ctx): User {
  // ...create user...
  for (const postInput of input.posts ?? []) {
    Post.fromInput({ ...postInput, userId: user.id }, ctx)
  }
}

// Export
toJSON(): UserJSON {
  return {
    ...this.toProps(),
    posts: this.posts.map(p => p.toJSON()),
  }
}
```

**Tradeoff:** Same relationships listed in 3 places. Could declare once and reuse later if duplication becomes painful.

## The Boilerplate Problem

For a simple entity like Address (3 properties, no relationships), you need ~35 lines:

1. `AddressProps` type
2. `AddressInput` type
3. `AddressJSON` type
4. `Address` class with:
   - Property declarations (repeating Props)
   - Constructor (assigning each property)
   - `entityIndex` getter
   - `deleteEntity` method
   - `toJSON` method (listing properties again)
   - `inputToProps` static (listing properties again)
   - `fromInput` static

Property names repeated in 5+ places. This is nearly unusable without some level of automation.

## Descriptor Approach (Future Direction)

Define entity once, derive everything:

```typescript
const AddressDef = defineEntity({
  props: {
    id: t.string,
    city: t.string,
    zip: t.string.nullable,
  },
  optionalInInput: ['id', 'zip'],
  defaults: { zip: null },
  generateId: 'id',
})

// Derive types
type AddressProps = PropsOf<typeof AddressDef>
type AddressInput = InputOf<typeof AddressDef>
type AddressJSON = JSONOf<typeof AddressDef>

// Derive class with constructor, toJSON, fromInput
class Address extends entity(AddressDef) {
  // Just custom methods/getters
}
```

**Needs exploration:**
- How to handle relationships in descriptor
- How to handle inheritance/subtypes
- How much can be derived vs. needs explicit declaration
- Runtime descriptor that generates TypeScript types (Zod-like)

## Open Questions

1. Can owned relationships be declared in the descriptor and used for all three operations?

2. How does the descriptor approach handle subtype hierarchies?

3. What's the minimum viable descriptor that eliminates the worst boilerplate?

4. How does this integrate with Multindex subtype declarations?

## Next Steps

Work through more examples by hand to understand requirements, then design a descriptor format that eliminates repetition while staying understandable.
