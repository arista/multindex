# Domain Nodeling with Multindex

Many applications will use Multindex to implement an in-memory Domain Object model, mapping a Domain class hierarchy to Multindexes that act like "tables" in a relational model. When used like this, the instances of the Domain model, typically called **entities**, will be the items added to the Multindexes.

Similar to rows in a relational model, entities will typically contain only properties with primitive values. References to other entities, called **relationships**, are handled through id's, and implemented as index lookups on other Multindexes.

## Basic Concepts

### Schema

An application will typically use several Multindexes to implement its Domain model. It's considered best practice for the application to gather all of those Multindexes into an object hierarchy, called a **Schema**. For example:

```
schema = {
  User: Multindex.create<User>()(...)
  accounting: {
    Account: Multindex.create<Account>()(...)
    AccountTransaction: Multindex.create<AccountTransaction>()(...)
    ...
  },
  content: {
    Book: Multindex.create<Book>()(...)
  }
  ...
}
```

In this example, each entity type gets its own Multindex. Some Multindexes are gathered together into their own namespace, which might be typical in a more complex schema.

Each Entity in the system is created with a reference to the complete Schema, allowing an Entity to resolve relationship references.

### Relationships

Entities will typically implement relationships using getters and setters, going through the

If an Account wants to retrieve its transactions, then it can find the "AccountTransaction" Multindex, look for its "byAccountId" index, and return the result:

```
Account {
  get entries() {
    AccountTransaction.indexes(this.schema).byAccountId.get(this.id)
  }
}
```

And the relationship can go the other way:

```
AccountTransaction {
  get account(): Account {
    this.schema.accounting.Account.byId.get(this.accountId)
  }

  set account(val: Account): {
    this.accountId = val.id
  }
}
```

### JSON representations

Domain models are typically paired with a JSON representation. There are actually three different JSON representations:

- **Props** - this is the "raw" representation of an Entity, containing just the properties and no relationships. It is sufficient for dumping and restoring the state of a set of Entities. It's what is passed to an Entity in its constructor.
- **Input** - this is a more meaningful JSON format that can be used to build Entity instances. It will typically contain the entity's property values, but it may also contain references to other objects, which would be translated into relationships when brought into the domain model. This can continue to any level of recursion, and could even contain graphs (multiple references to the same Props instance within the structure). The Input structure will typically be somewhat lenient, with optional properties that would be replaced by defaults when turned into an Entity.
- **JSON** - the export format for representing a Domain entity and its relationship references to other entities. This is similar to Props, but generally with fewer optional properties.

When an application defines an entity for its Domain model, it will often need to define the Entity's class, its Multindexes, its Props format, and its JSON format. The latter two are usually named based on the Entity name - for example, "User", "UserProps" and "UserJSON". It maybe possible to create a utility type that transforms a Props to JSON for typical cases.

### Owning Relationships

Domain models will often represent hierarchical structures through relationships. The relationships that are used for that purpose are called "owning relationships". These are the relationships that are expected to be used in the Props and JSON formats.

These relationships are also used to implement **cascading deletes**, where removing one object also removes all of the objects that are owned by that original object. That ownership is determined by transitively following all of the "owning relatioships".

### Inheritance Model

A Domain model may include inheritance, expressed by a domain class defined as a subclass of another domain class. This inheritance can be reflected in the Multindex model, by defining Multindexes with subtype Multindexes.

## Domain Model Functions

A Domain Model should be able to perform these general functions:

- **Create From Props** - given a Props object graph, create and add the corresponding Entities to the Schema, following the owning relationships.
- **Cascade Delete** - given an Entity, remove that entity from the Multindex, along with all its owned entities, found by following the transitive closure of the owning relationships
- **Export to JSON** - given an Entity, export it to its JSON format, following the owning relationships
- **Dump and Restore** - export all of the items in a Multindex (or an entire Schema) into the Flat JSON format, and recreate a Schema from that same format.

## Entity base class

```
class Entity<PROPS, SCHEMA> {
  constructor(public entitySchema: SCHEMA) {}

  // To be overridden by subclasses

  // Assign the entity's properties from the given props object.  Only assign properties, not relationships.  This should handle normalizing values, setting defaults, generating id's, etc.  Entities should be sure to call super.setEntityProps
  setEntityProps(props: PROPS)

  // Return the entity's index, retrieving it from the entitySchema assigned to it
  abstract entityIndex: Multindex<E extends Entity<PROPS, SCHEMA>>
}

const schema = {
  User: Multindex.create<User>()(...)
}

const Schema = typeof schema


class EntityBase {
  constructor(public entitySchema: typeof Schema) {}
}


type UserProps = {
  ...
}

type UserInput = {
  ...
}

type UserJSON = {
  ...
}

class User extends EntityBase {
  constructor(props: UserProps, schema: Schema) {
    super(schema)
    this.name = props.name
    ...
  }

  deleteEntity() {
    // FIXME - implement this
  }

  toJSON(): UserJSON {
    // FIXME - implement this
  }

  get entityIndex() { this.schema.User }

  static entityIndex(schema: Schema) {
    return schema.User
  }

  static inputToProps(input: UserInput, schema: Schema): UserProps {
  }

  static fromProps(props: UserProps, schema: Schema): User {
  }
}
```

## Domain model patterns

Maybe it would help to have an actual example. Let's say we have a User that has an Address and Assets. And lets say we have a class hierarchy:

Asset
House
Vehicle
Car
Bus

```
const ctx = {
  schema: {
    User: Multindex.create<User>()(...),
    Address: Multindex.create<Address>()(...),
    Vehicle: Multindex.create<User>()(...) - with subclass index definitions
  }

  generateId: ()=>{...}
}

const Ctx = typeof ctx

// Entity

class Entity {
  constructor(public ctx: Ctx) {}
}


// Address < Entity

type AddressProps = {
  id: string
  city: string
  zip: string|null
}

type AddressInput = MakeOptional<UserProps, "id" | "zip">

type AddressJSON = AddressProps

class Address extends Entity implements AddressProps {
  id: string
  city: string
  zip: string|null

  constructor(props: AddressProps, ctx: Ctx) {
    super(props, ctx)
    this.id = props.id
    this.city = props.city
    this.zip = props.zip
  }

  get entityIndex() { return this.ctx.schema.Address }

  deleteEntity() {
    this.entityIndex.remove(this)
  }

  toJSON(): AddressJSON {
    return {
      id: this.id,
      city: this.city,
      zip: this.zip,
    }
  }

  static inputToProps(input: AddressInput, ctx: Ctx): AddressProps {
    return {
      id: input.id ?? ctx.generateId(),
      city: input.city,
      zip: input.zip ?? null
    }
  }

  static fromInput(input: AddressInput, ctx: Ctx): Address {
    const props = this.inputToProps(input, ctx)
    return new Address(props, ctx)
  }
}


// User < Entity

type UserProps = {
  id: string
  name: string|null
}

type UserInput = MakeOptional<UserProps, "id" | "name"> & {
  assets?: Array<AssetInput>
  address: AddressInput
}

type UserJSON = UserProps & {
  assets?: Array<AssetJSON>
  address: AddressJSON
}

class User extends Entity {
}





type AssetProps = HouseProps | VehicleProps

class Asset extends Entity, AssetProps {
}

// Asset

type AssetPropsBase = {
  id: string
  name: string
}

type AssetProps = HouseProps | VehicleProps

class Asset extends Entity, AssetProps {
}

// House < Asset

type HouseProps = AssetPropsBase & {
  type: "House"
  address: string
}

class House extends Asset {
}

// Vehicle < Asset

class Vehicle extends Asset {
}

// Car < Vehicle

class Car extends Vehicle {
}

// Bus < Vehicle

class Bus extends Vehicle {
}

```
