# Overview

A **Multindex** is a structure that contains multiple collections of a single object. For example, a multindex of Invoices might contain a mapping from invoice number to Invoice, and also contain an ordered list of Invoices sorted by date. Adding an Invoice to the multindex automatically adds it to all of the indexes, and removing from the multindex removes it from the indexes.

Multindex is also able to use reactivity, allowing it to automatically re-index objects that change their values, without requiring manual intervention from the application. That reactivity is provided by the [chchchchanges library](../../chchchanges).

In effect, a Multindex acts like a "table" in a relational database, and those collections act like "indexes". In fact, the ultimate goal of the Multindex library is to enable applications to manage complex in-memory data using relational techniques. Indexing is often main barrier for applications wishing to do this, so multindex tries to lower that barrier.

## Index Types

Multindex offers several different types of indexes, which combine different groups of functionality, described by these "interfaces":

- Index - base functionality inherited by all indexes
  - get number of items in the index
  - iterate through the items in the index (order determined by the concrete index type)
- SetIndex - test for set membership
  - inherits from Index
  - test if an item is in the index
- MapIndex - map keys to items, where the keys are derived from data on the item (e.g., item property values)
  - inherits from SetIndex
  - get item by key
  - test presence of key
  - iterate through the map's keys
- SortedIndex - sort items by keys derived from data on the item (e.g., item property values)
  - inherits from MapIndex
  - obtain subsets of items bounded by key ranges, possibly reversed

For MapIndexes (and, by inheritance, SortedIndexes), there are two varieties:

- Unique
  - each key maps to at most one item
  - error if this violated
- Many
  - each key maps to potentially many items
  - those items must be contained by a "subindex", which is another index or multindex
    - those subindexes are defined when the Many index is created
    - each item of the Many index is actually that subindex

This means that there are two varieties of MapIndex - UniqueMapIndex and ManyMapIndex. And because SortedIndex inherits the same functionality from MapIndex, the same is true of SortedIndex: UniqueSortedIndex and ManySortedIndex.

## Index Keys

MapIndex and SortedIndex make use of a key that maps to items, and (in the case of SortedIndex), is used to sort items. The key should be formed from data found on the item. Changes to the item which affect the key can then cause the item to be automatically re-indexed (if the index is enabled for reactivity using chchchchanges).

When an index is created, the application needs to tell the index how to generate a key from an item. The most straightforward approach is to let the application supply a function to do just that. However, there are some additional considerations, particularly around potentially useful functionality that would be difficult to implement with this naive approach. There are also ergonomic considerations that could be alleviated by taking an alternative key approach.

- SortedIndexes
  - Many SortedIndexes will sort according to compound keys - for example, sort by date, then name, then id. Obviously this could be done by having an application function return arrays of values, and have a general way to compare arrays. However, a couple considerations:
    - compound keys in which items of the key should be sorted in ascending order, and some in descending order. This could be addressed by allowing the application to supply a function for comparing keys, but this starts getting much more burdensome for the developer.
    - subsets based on subkeys - SortedIndexes allow subsets to be defined bounded by a key range. For compound keys, it would be very useful for an application to be able to define bounds using a prefix of the key. For example in the [date, name, id] case above, an application might want to define bounds using just [date, name]. Again, this could still be addressed with an application-supplied comparison function, but it gets even more complicated. It's also not clear that this approach could provide type-safe interfaces for this bounding functionality.
- Adding to Subindexes
  - For Many indexes, the value associated with a key is actually a subindex, which collects all of the items with the same key from the parent index. A potentially useful function would be the ability to add an item directly to that subindex. That would mean modifying the item such that its key now matches the keys in that subindex. Again, this could be accomplished by allowing the application to provide a function that "backfills" an item to have a given key. But again, this becomes burdensome for an application.

So this seems to indicate that while most, maybe all, of this functionality could be implemented using application-supplied functions, perhaps there are more ergonomic ways to do this.

One approach is to declare that keys must be formed from an item's properties, and that the application defines an index's key by specifying which property (or list of properties for compound keys) are to be used. For sort keys, an application can even accompany each property name with an "ascending" or "descending" marker (or maybe even precede a property name with "+" or "-").

This would enable all of the above functionality, at the expense of the flexibility of arbitrary functions. Perhaps that's a fine tradeoff. Although it's not clear to me if this is compatible with easy type safety. For example, a MapIndex's get() function requires a type declaration for the key, which (I assume) requires more work on the developer's part if the key is just being specified as a property name. However, if a key is specified as a function (e.g., "i=>i.name"), then the type safety comes for free.

Perhaps there's a hybrid model, where keys are still specified as functions, but compound keys are specified as arrays of functions (e.g., [i=>i.name, i=>i.date]). For the "add" functionality case, this would mean supplying a corresponding array of setters (e.g., [(i,v)=>{i.name = v}, (i,v)=>{i.date = v}]). Again, this is assuming that type safety is difficult to ensure if an application just supplies property names(e.g., ["name", "date"]) - if that's not the case, then perhaps this need is decreased.

It's also possible that there is some kind of continuum, where the application can specify keys in a variety of ways (string, function, array of strings, array of functions, with or without corresponding setters, etc.), and depending on what's been supplied, certain functions are unlocked or not (adding to subindexes, obtaining sublists of SortedArrays bounded by partial keys, etc.)

## Index Filters

Another useful function is the ability to define filters for indexes, which determine if an item should be included in an index or not. Again, this follows some of the same discussion above for specifying keys, although perhaps with less emphasis on filters built from multiple values (since the system can require that the application define new boolean properties for driving filters).

## Index API

From the application's perspective, the various interfaces look something like this when in use:

```
I = the underlying data item being added to an index
V = the values returned by the index.  For a Unique index, this is typically the same as I.  For a Many index, this is a nested index/multindex
K = the key type for Map indexes
PK = the partial key type used for SortedIndex sublists.  For compound keys ([K1, K2, K3, ...]), PK would be any array that's a prefix of K ([], [K1], [K1, K2], ...).  For non-compound keys, PK and K are the same

IndexBase<I> extends Iterable<I> {
  count: number
  items: IterableIterator<I>
  add(item: I): I
}

SetIndex<I> extends IndexBase<I> {
  has(item: I): boolean
}

MapIndex<I, V, K> extends SetIndex<I> {
  hasKey(key: K): boolean
  tryGet(key: K): V | null
  // error if key not found
  get(key: K): V
  keys: IterableIterator<K>
}

SortedIndex<I, V, K, PK> extends MapIndex<I, V, K> {
  // Returns a version of the SortedIndex where iteration runs in reverse order
  reverse(): SortedIndex<I, V, K, PK>

  // Returns a version of the SortedIndex whose keys are bounded by the given range
  query(q: SortQuery): SortedIndex<I, V, K, PK>
}

// Note: at most one of gt/ge may be specified, same for lt/le
SortQuery<PK> {
  gt?: PK
  ge?: PK
  lt?: PK
  le?: PK
}

UniqueMapIndex<I, K> extends MapIndex<I, I, K>

ManyMapIndex<I, V, K> extends MapIndex<I, V, K>

UniqueSortedIndex<I, K> extends SortedIndex<I, I, K>

ManySortedIndex<I, V, K> extends SortedIndex<I, V, K>

// This is the main class, which will contain other indexes.  Applications can only add or remove items.  Any other operations need to take place using indexes created in the Multindex.  While some indexes might also allow direct adding, removing can only take place at the "top-level" Multindex level (not in a subindex)
Multindex<I> {
  add(item: I): I
  remove(item: I)
}
```

## Creating Indexes

Still TBD. This is how an application builds Multindexes, generally with properties that are the individual indexes. For example, it might look something like this:

```
class InvoiceItems extends Multindex {
  constructor(ctx: MultindexContext) {super(ctx)}

  byId: this.uniqueHashMap<Invoice>(...)
  byDate: this.manySorted<Invoice>(...)
}
```

This is where the application decides what specific index implementations to use, what keys are involved in each index, how to create subindexes, etc.

There will presumably be various implementations that the application can choose from:

- Unique/ManySet - just a JS Set
- Unique/ManyArraySet - SetIndex implementation that retains the order of items added to it
- Unique/ManyMap - just a JS Map
- Unique/ManySortedArray - a sorted Array
- Unique/ManyBTreeIndex - a more scalable sort implementation

## Index Implementations

Still TBD.

To note, indexes will need to be reactive, based on the [chchchchanges library](../../chchchanges) library. This probably means wrapping key generation functions. This also probably means that indexes will need to be notified both before and after a key property is about to change. Before, because the indexes will probably need to have the old value of a key in order to locate the item in the index before it is changed. Then after, so that, given the old key and new key, the index can find the item with the old key, and reindex it according to the new key.

Subindexes also make things interesting. The Many indexes will need to be configured with a function for creating a new subindex with a particular key. This could return just another index, or even another Multindex. This implies that there might be some common internal interface implemented by all these options. The Many indexes should be able to recursively call this interface for add/remove/reindexing operations.
