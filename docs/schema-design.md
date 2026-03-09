# Schemas

## Domain Object Models

A common expected use of Multindex is to create in-memory Domain Object Models.  The application would define such a model, and let Multindex provide the indexing support that allows models to expose relationships, lookups, sorting, etc. without having to hand-code those features.

Domain Models have some very typical needs:

* Relationship modeling - instances in a Domain Model (which we can just start calling **entities**) will avoid referencing each other directly.  Instead, they will implicitly reference each other by id, and will use Multindexes to locate each other based on those id's.  Entities will typically implement getters that perform that lookup, and implement setters that assign id's appropriately.  To do this, entities will need references to the appropriate indexes.

* Import from JSON - this is very common.  Rather than creating entities directly, an application will create a JSON version of the required data and have it turn into the appropriate entities, already added to the appropriate indexes.  This my require an id-generation mechanism.

* Export to JSON - perhaps less common, an application may want to export entities into a JSON form that can later be imported into JSON.

* Cascading deletes - it's not uncommon for an application to want to delete an entire graph of objects "owned" by a single root.

Implementing these functions requires a balance between what is provided by the Multindex package, and what is implemented by the application.  We don't want the application to implement a whole lot of boilerplate, but at the same time we don't a complex and cryptic configuration system.

### Schema definition

A **Schema** is an organized collection of Multindexes, analogous to a Relational Database being made of tables.  Different types of Entities would be added to corresponding Multindexes, and the Schema provides a container for all those Multindexes.

A Schema is defined by the application using whatever structure it wants:

```
Schema.create<SCH>(f: (b: SchemaBuilder): SCH, config?: SchemaConfig): Schema & SCH

SchemaBuilder {
  multindex<I>(... same arguments as Multindex.create)
}

SchemaConfig {
  // These become the defaults for any Multindexes created by SchemaBuilder
  domain?: ChangeDomain
  reactive?: boolean
}
```

The application can organize its Multindexes as it sees fit.  However, it's suggested that an application use an Object, where the keys are capitalized names of Entities:

```
{
  User: b.multindex(...)
  Book: b.multindex(...)
  ...
}
```
If a schema is particularly large, an application may wish to split it into **modules** (FIXME - is there a better name for this?):

```
{
  User: b.multindex(...)
  accounting: {
    Account: b.multindex(...)
    AccountTransaction: b.multindex(...)
    ...
  },
  content: {
    Book: b.multindex(...)
  }
  ...
}
```

Entities will typically need to be created with a reference to their containing Schema and Multindex.  This will be described later.

### Relationship modeling

Entities will typically implement relationships using getters and setters

If an Account wants to retrieve its entries, then it can find the "AccountEntry" Multindex, look for its "byAccountId" index, and return the result:

```
Account {
  get entries(): SetIndex<AccountEntry> {
    this.schema.accounting.AccountEntry.byAccountId.get(this.id)
  }
}
```

And the relationship can go the other way:

```
AccountEntry {
  get account(): Account {
    this.schema.accounting.Account.byId.get(this.accountId)
  }

  set account(val: Account): {
    this.accountId = val.id
  }
}
```
This is one of the reasons an Entity needs a reference to its containing Schema, so it can use `this.schema`.

### Cascading Deletion

Relationships are often used to represent hierarchical structures, which means that some of the relationships in the model would be considered **owning relationships**.  If an entity is deleted, it is expected that any entities transitively referenced through those relationships would also be deleted.

Cascading deletion can get complicated, so the operation is managed by a DeleteOperation.  An Entity will typically implement three methods:

```
MyEntity {
  delete()
  _cascadeDelete(op: DeleteOperation)
  _deleteSelf()
}

CascadeDeleting<E = unknown> {
  // call op methods to add any entities referenced by this entity
  cascadeDelete(op: DeleteOperation)
  // delete this entity
  deleteSelf()
  // reference to the entity being deleted, used to track which entities have already been marked for deletion.  If the entity implements CascadeDeleting itself, it can return deletingEntity directly.  Otherwise the underlying entity should be returned.
  deletingEntity: E
}

DeleteOperation<E = unknown> {
  // Add the given entity if its deletingEntity hasn't already been added
  add(entity: CascadeDeleting)
  // Call add for all the entities in Iterable
  addAll(Iterable<CascadeDeleting>)
  
  static deleteEntity(entity: CascadeDeleting<E>)
}
```

The DeleteOperation operates over items that implement the CascadeDeleting interface.  Entities may implement this interface directly, or utilize wrappers that implement the interface.

The DeleteOperation maintains a list of items that have yet to be cascaded and deleted.  It runs until that list is empty.  Each cycle:

* pop an item e from the list
* call cascadeDelete(e)
* call deleteSelf(e)

Of course, the easiest thing to do is have all of an application's entities descend from a common EntityBase that implements CascadeDeleting directly.  Then it just needs to override cascadeDelete and deleteSelf:

```
cascadeDelete(op) {
  op.addAll(this.accountTransactions)
  op.add(this.accountSummary)
}

deleteSelf() {
  this.schema.accounting.Account.remove(this)
}

```

Of course, there is some risk that one might add relationships to the entity, and forget to add them to cascadeDelete.  This will be addressed later.


### JSON Importing

A very common operation is to import a JSON object into a Schema, resulting in an appropriate Entity instance.  If that JSON object actually represents a hierarchical structure (or even a graph), then those objects should also be transitively added and connected through proper id connections.

It should be noted that the JSON objects being imported will **not** have the same types as the entities.  Some of the JSON fields might be optional, but required in the entity.  And relationships in the JSON object would be represented as direct references or arrays/objects of references, whereas in the entities they would be represented as references to entities or references to Indexes and Multindexes.

Therefore we'll refer to an importable structure as a "Props" object, named according to the entity's name.  For example, a User entity would be constructed from a UserProps structure.

So a big question is how much of this can/should the application do itself, while trying to minimize boilerplate, and how much can the Multindex library help with this.

We'll assume that the application will define and call a method like this:

AccountEntry {
  create(props: AccountProps, schema: Schema): AccountEntry
}

This method will need to:

* figure out which entity class to construct
    * if AccountEntry has subtypes, then it needs to dispatch based on the type discriminator in AccountProps, passing the call to the appropriate AccountEntry subclass
* call the entity instance constructor, passing in the schema, and the props
* the constructor stores the schema reference in this.schema
* the constructor assigns any non-relationship values from props to the entity instance
    * If any normalization is required, that happens here
    * Default assignment, and id generation, would also happen here
* if there's a type discriminator involved, the constructor should also store that - it can get that from its index
* add the entity to the appropriate index.
    * it's likely that the entity classes will implement a "schemaIndex" getter that retrieves the appropriate index from schema.  Subtype entity classes will return their appropriate subtype multindex
* the resulting entity will be wrapped in a reactive Proxy.  We need to be careful to use this object from now on

Up to this point, it seems like all of this needs to be application code.  I'm not sure that Multindex can add very much.

Now we get to the interesting part:

* recursively add entities from any relationships.  For each relationship property in props:
    * get the props property value
    * if it's a One relationship
        * create the foreign entity for the property value
        * call the relationship setter, assigning the foreign entity to the primary entity
    * if it's a Many relationship
        * recursivey create the foreign entities for the property value (presumably an array or object or other collection)
            * there may be additional properties to set on the entity that wouldn't be set on the props, such as the array index, or the object key.  Those would be assembled here and passed in
        * get the relationship on the primary entity - this should be an Index
        * add all the foreign entities to that Index

On top of this, we want to handle object graphs - that is, values that appear multiple times in the props.  We don't want those items to be added multiple times, so somewhere we need to keep a mapping from source props object to resulting Entity.  That means we probably need some kind of "InsertOperation" object that gets passed around throughout the whole insert operation.

Is there room for Multindex to provide help with this part?  It does seem that same set of "owning indexes" used for cascade deletes is also involved here.  That suggests that maybe something could be done.

### JSON Exporting

There are two forms of JSON exporting:

* Performing a "dump" of an index.  This should just return the "own" properties of all the entities in the index, probably just returned as an Array.  Similar to a table dump from a database.  No relationships would be followed.  A regular JSON.stringify would probably work just fine
    * The "schema" will likely be stored as a property, and should be omitted.  Maybe there's a general way for an entity to mark certain properties not to be involved in JSON serializing?
    * It might make sense to just implement toJSON on indexes, to do this.  Then perhaps an entire Schema could be dumped with just toJSON.
* Exporting an entity as a JSON object
    * This involves exporting the entity's "own" properties, but then also recursively exporting the entity's relationship properties.

Again, we might be dealing with object graphs, so the export operation needs to cache entity instances with already-exported values, so that they get reused.  So that implies an ExportOperation being passed around through the calls.


### JSON Restore

In JSON Exporting, we talked about an index "dump".  There should probably be an equivalent "restore" operation which just loads an index with entities set up with their "own" properties set.

The process here would be different from the JSON Import operation described earlier.  The appropriate Entity instance needs to be constructed from the incoming JSON object.  For types with subclasses, this means that the incoming JSON object needs some kind of value to act as a type discriminator.

Once the appropriate instance has been created, presumably with a reference to the Schema, then all the properties from the JSON object should be assigned to the entity.  Then the entity is added to the index.

This implies a couple things:

* The Schema needs to know how to create an entity instance for a given Multindex.  The application code can handle creating the appropriate entity subclass depending on an incoming type discriminator.  However, the Schema needs to know what function to call at all for the Multindex
* The "create an instance" function should be separated from the JSON importing process described above.  This implies that an entity's constructor should really just take a reference to the Schema.  The actual JSON importing from props should take place in a separate function (which presumably would also take the InsertOperation)



### So How Can Multindex Help?

A lot of the above operations seem like they could be done in application code.  Can Multindex help?

Certainly with the JSON dump/restore operation, the application doesn't have to be very involved.  It does need to provide entity creation functions for each of the Multindexes, and maybe it needs to do dispatching on type discrimination.

But for cascade delete, JSON export, and JSON import, those all seem to depend on the same set of "owning references".  Maybe there's some way that an entity can declare those relationships once, and get all of those operations for free.

