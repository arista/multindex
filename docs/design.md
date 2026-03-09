# Design

Technical design for Multindex

## Public API

### Building Multindexes

```
// A Multindex is a SetIndex that contains additional indexes defined by the application.  Items added to the Multindex are added to all of those additional indexes.  Multindex also has a remove function that removes an item from the Multindex and all its additional indexes.

Multindex<I> extends SetIndex<I> {
  static create<I, IXS>(f: IndexBuilderFn<IXS>, config?: MultindexConfig): Multindex<I> & IXS

  // Remove an item from the Multindex and all its contained indexes
  remove(item: I)

  // If the Multindex has a supertype Multindex, this would be {supertype Multindex subtypeName}.{this Multindex's property name within the supertype Multindex}.  Otherwise this is null
  subtypeName: string|null
  
  // If the Multindex has subtype Multindexes, this will locate the Multindex with the given subtypeName, then perform the add or remove operation on it.  If subtypeName is null, then the operation is performed on this Multindex
  addSubtype(item: I, subtypeName: string|null)
  removeSubtype(item: I, subtypeName: string|null)
}

// The IndexBuilderFn should return a mapping from name to index implementation (supplied by the IndexBuilder).  Those mappings will become properties of a Multindex
IndexBuilderFn<IXS> = (b: IndexBuilder) => IXS


MultindexConfig {
  domain?: ChangeDomain // From chchchchanges

  // When true (the default), items added to the Multindex are wrapped in chchchchanges
  // reactivity, and the index automatically re-indexes items when their keys or filter
  // values change. When false, no reactivity overhead is incurred, but items will not
  // be automatically re-indexed on change.
  reactive?: boolean // Default: true
}

IndexBuilder<I> {
  // Allow the app to choose different index characteristics and, in some cases, actual implementations (e.g., set vs. arraySet, sorted vs. BTree).  This is used to build indexes contained by a top-level Multindex, and also subindexes.

  set(spec?: SetSpec<I>) => SetIndex
  arraySet(spec?: ArraySetSpec<I>) => SetIndex

  uniqueMap<K>(spec: UniqueMapSpec<I, K>) =>  UniqueMapIndex<I, K>
  uniqueSorted<K>(spec: UniqueSortedSpec<I, K>) =>  UniqueSortedIndex<I, K>
  uniqueBTree<K>(spec: UniqueBTreeSpec<I, K>) =>  UniqueBTreeIndex<I, K>

  manyMap<K>(spec: ManyMapSpec<I, K>) =>  ManyMapIndex<I, K>
  manySorted<K>(spec: ManySortedSpec<I, K>) =>  ManySortedIndex<I, K>
  manyBTree<K>(spec: ManyBTreeSpec<I, K>) =>  ManyBTreeIndex<I, K>

  // Returns a multindex implementation that acts like a Set, but also contains additional indexes defined by f.  The result is similar to a Multindex, except that it doesn't have a "remove" method
  mult(f: IndexBuilderFn<IXS>) => SetIndex & IXS

  // Returns a multindex containing a subtype of I.  Any items added to or removed from the subtype's multindex will also be added to or removed from this multindex.
  subtype<SUB extends I>(f: IndexBuilderFn<IXS>) => SetIndex<SUB> & IXS

  // helper functions
  key<K>(get: (item: I) => K, set?: (item: I, value: K) => void) => MapKeySpec<I, K>
  asc<K extends SingleSortKey>(get: (item: I) => K, set?: (item: I, value: K) => void) => SingleSortKeySpec<I, K>
  desc<K extends SingleSortKey>(get: (item: I) => K, set?: (item: I, value: K) => void) => SingleSortKeySpec<I, K>
  filter: (get: (item: I) => boolean) => FilterSpec
}

FilterSpec<I> = GetterFilterSpec<I> | FullFilterSpec<I>

GetterFilterSpec<I> = (item: I) => boolean

FullFilterSpec<I> = {
  get: (item: I) => boolean
}



SetSpec<I> => {
  filter?: FilterSpec<I>
}

ArraySetSpec<I> => {
  filter?: FilterSpec<I>
}

UniqueMapSpec<I, K> = {
  key: MapKeySpec<I, K>
  filter?: FilterSpec<I>
}

MapKeySpec<I, K> = GetterMapKeySpec<I, K> | FullMapKeySpec<I, K>

GetterMapKeySpec<I, K> = (item: I) => K

FullMapKeySpec<I, K> = {
  get: (item: I) => K
  set?: (item: I, value: K) => void
}


UniqueSortedSpec<I, K> = {
  key: SortedKeySpec<I, K>
  filter?: FilterSpec<I>
}

UniqueBTreeSpec<I, K> = {
  key: SortedKeySpec<I, K>
  filter?: FilterSpec<I>
}

SortKeySpec = SingleSortKeySpec | CompoundSortKeySpec

SingleSortKeySpec<I, K extends SingleSortKey> =
  GetterSingleSortKeySpec<I, K> // Defaults to "asc" direction
  | FullSingleSortKeySpec<I, K>

GetterSingleSortKeySpec<I, K extends SingleSortKey> = (item: I) => K

FullSingleSortKeySpec<I, K extends SingleSortKey> = {
  direction: "asc" | "desc"
  get: (item: I) => K
  set?: (item: I, value: K) => void
}

SortKey = SingleSortKey | CompoundSortKey

SingleSortKey = null | undefined | boolean | string | number | Date

// Explicitly define types for CompoundSortKeySpecs and CompoundSortKey of up to 6 sort keys
CompoundSortKeySpec = tuple of SingleSortKeySpec

CompoundSortKey = tuple of the key types from the compound SortKeySpecs

// Explicitly define these types knowing that CompoundSortKeys can be up to 6 keys long
PartialSortKey<CK> =
  if CK is a SingleSortKey, then return CK
  if CK is a tuple of SingleSortKeys, then return the union of all subarrays of CK starting with index 0.  For example, if CK is [K1, K2, K3], then return [] | [K1] | [K1, K2] | [K1, K2, K3]


ManyMapSpec<I, K, SUBIX extends Index<I>> = UniqueMapSpec<I, K> & {
  subindex: SubindexSpec<I, SUBIX>
}

ManySortedSpec<I, K, SUBIX extends Index<I>> = UniqueSortedSpec<I, K> & {
  subindex: SubindexSpec<I, SUBIX>
}

ManyBTreeSpec<I, K, SUBIX extends Index<I>> = UniqueBTreeSpec<I, K> & {
  subindex: SubindexSpec<I, SUBIX>
}

SubindexSpec<I, SUBIX extends Index<I>> = (b: IndexBuilder) => Subindex<I, SUBIX>

```

### Using Indexes

```
I = the underlying data item being added to an index
V = the values returned by the index.  For a Unique index, this is typically the same as I.  For a Many index, this is a nested index/multindex
K = the key type for Map indexes
PK = the partial key type used for SortedIndex sublists.  For compound keys ([K1, K2, K3, ...]), PK would be any array that's a prefix of K ([], [K1], [K1, K2], ...).  For non-compound keys, PK and K are the same

IndexBase<I> extends Iterable<I> {
  count: number
  items: IterableIterator<I>

  // This can only be called on top-level Multindexes, or subindexes.  If called on a top-level Multindex, then the item is wrapped in a reactive Proxy (if reactivity is enabled for the Multindex), added to all the contained indexes, and the reactive Proxy is returned.
  // If called on a subindex, then the item will be modified to have its key match the subindex's key within its parent.  It will also call this recursively up the parent chain.  The item's key is set using key setter methods supplied by the index's config.  If any conditions are not met (setter method not supplied, not a subindex, etc.) then an error is thrown.
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

SortedIndex<I, V, K, PK> extends MapIndex<I, V, K>, SortedView<I, PK> {
}

SortedView<I, PK> extends Iterable<I> {
  // Returns a version of the SortedIndex where iteration and comparisons run in reverse order
  reverse(): SortedView<I, PK>

  // Returns a version of the SortedIndex whose keys are bounded by the given range
  query(q: SortQuery): SortedView<I, PK>
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
```

## Index Filters

Index filters allow an index to specify what items should be included in the index. This can get a little confusing because, as will be explained later, there needs to be a distinction between items that have been **added** to the index, vs. items that are **included** in the index.

- **added** - items that where add() has been called on the index, and remove() has not yet been called
- **included** - items that are added **and** that pass the index's filter (if any)

Each index's public API deals only with included items. For example, count, get, iterators, etc. all only operate over included items. For users of the API, the index will act like only **included** items were ever added to the index.

However, items that are added but not included still need to be managed by the index. That's because an item might later be modified such that its filter now passes, and it can now be included. This requires some extra bookkeeping by the index, namely to maintain and later cleanup the reactive callbacks involved. So the index still needs to manage all **added** items, even if they are not yet **included**.

## Index Implementations

The library offers a variety of index implementions:

- SetIndexImpl - SetIndex backed by a JS Set
- ArraySetIndexImpl - SetIndex backed by an Array, maintains items in the order they were added
- UniqueMapIndexImpl - MapIndex backed by a JS Map
- ManyMapIndexImpl - MapIndex backed by a JS Map, with subindex values
- UniqueSortedIndexImpl - SortedIndex backed by a JS Array
- ManySortedIndexImpl - SortedIndex backed by a JS Array, with subindex values
- UniqueBTreeArrayIndexImpl - SortedIndex backed by a BTree (implementation TBD)
- ManyBTreeArrayIndexImpl - SortedIndex backed by a BTree (implementation TBD), with subindex values
- Multindex - effectively a SetIndexImpl, but with additional indexes

One of the goals of the implementation design is for as much functionality as possible to be concentrated in a common base class, with the subclasses containing the specific structures needed for the individual types of indexes.

This base class will support a combined set of features from all index types, such as filters, keys, and subindexes. Some indexes will not make use of all these features, but they will all be available in the base class.

### AddedItem

Earlier it was mentioned that an index will need to maintain "bookkeeping" information about every added item, even the ones that are not included. This structure describes that information, which makes use of types from the chchchchanges library.

```
AddedItem<I, K> {
  item: I

  keyChangeDetecting: ChangeDetecting<K>|null
  keyChangeCallback: ChangeCallback|null

  filterChangeDetecting: ChangeDetecting<boolean>|null
  filterChangeCallback: ChangeCallback|null

  // Clear out, call remove on any ChangeDetectings
  clear()

  // Return keyChangeDetecting.result, default null
  key: K|null

  // Return filterChangeDetecting.result, default true
  included: boolean
}
```

When an item is added to a keyed index, the index's key function is called on the item to obtain its key. This happens in the context of a chchchchanges detectChanges() call, so that the index can be alerted to any changes that might change the key, and therefore require the item to be re-indexed. The keyChangeDetecting is the result of that call, containing both the computed key, as well as a remove() function to disconnect the reactive callbacks when the item is removed. The filterChangeDetecting is the same, except that it determines if an item should be included, for indexes that supply a filter.

Both detectChanges() calls must supply callbacks to be invoked if any values used by the key or filter change. The callbacks will make the appropriate calls on the index (onItemKeyChange, onItemFilterChange). The way chchchchanges works, each change requires the key/filter function to be re-run which results in re-generating the ChangeDetecting. However, the ChangeCallbacks can be created once when the item is added, and reused.

Every index needs to keep track of creating and removing AddedItem structures for each item added or removed. Every index will therefore maintain a Map<I, AddedItem<I, K>>. This mapping serves to both maintain the reactivity structures, as well as keeping track of added items vs. included items.

It may be that for some cases, this mapping can be optimized out:

- For indexes that have no keys or filters
- For indexes that are not using the chchchchanges library for reactivity

### IndexImplBase

The IndexImplBase is the base class for all index classes. Its goal is to concentrate all common operations into a single base, and allow subclasses to deal solely with the parts that are specific to their particular data structures.

IndexImplBase supports all the different index types and configurations:

- indexes with keys (map, sorted, BTree)
- indexes configured with filters
- indexes with subindexes (many vs. unique)
- indexes being used as subindexes, which need to keep track of their parent index, and the key within that parent that references the subindex
- indexes that are or are not participating in chchchchanges reactivity

As part of this, IndexImplBase needs to make use of several generic type parameters:

- **I** - the type of the item
- **S** - the type of the index's subindexes, null if none. Must implement the SubindexImpl interface described later
- **V** - the type of the values stored by the index. For Many indexes, this is S, for all others this is I
- **K** - the type of the key used by the index, null if the index doesn't use keys
- **P** - for indexes used as subindexes, the type of the parent index, null otherwise. Note that a Multindex is NOT considered a parent of the indexes it contains. But if a Multindex is used as a subindex, then its contained indexes will have their parents set to the Multindex's parent.
- **PK** - for indexes used as subindexes, the type of key used by the parent index

With that in mind, the IndexImplBase looks like this:

```
IndexImplBase<I, S, V, K, P, PK> {
  parent: P
  keyInParent: PK
  // Created on demand
  addedItems: Map<I, AddedItem<I, K>>|null

  // The number of included items.  For many indexes, this is the total of included items in all subindexes.
  count: number

  // Pulled from the configurations of individual indexes
  keyFn: ((item: I) => K)|null
  filterFn: ((item: I) => boolean)|null
  // This should assign the parent and key of the created subindex
  subindexFn: ((key: K) => S)|null

  // Functions implemented by index-specific subclasses
  abstract getValueWithKey(key: K): V|null
  abstract addValueWithKey(value: V, key: K)
  abstract removeValueWithKey(value: V, key: K)
  abstract clearValues() // clear out index-specific structures
  abstract isUnique(): boolean

  // Create an AddedItem with keyChangeCallback and filterChangeCallback filled in.  Both callbacks simply call the appropriate onKeyChange or onFilterChange method.  Then calls computeKey() and computeFilter() for the AddedItem.  The AddedItem is added to the addedItems map
  createAddedItem(item: I): AddedItem<I, K>

  // Returns the AddedItem for an item, null if the item has not yet been added
  getAddedItem(item: I): AddedItem<I, K>|null

  // Remove the AddedItem for the given item, returning it if it was added
  removeAddedItem(item: I): AddedItem<I, K>|null

  // Returns true if there are any added items, regardless of whether those items are included or not
  hasAddedItems(): boolean

  // If this is a many index, this is called to indicate that a subindex's count changed, so that change should be reflected in this parent index.  This should also call recursively up the parent chain
  subindexCountChanged(countChange: number)

  // Runs the index's key function, wrapped in a detectChanges call using the keyChangeCallback, and places the result in keyChangeDetecting.  Default to null if no key
  computeKey(addedItem: AddedItem<I, K>)

  // Runs the index's filter function, wrapped in a detectChanges call using the filterChangeCallback, and places the result in filterChangeDetecting.  Default to true if no filter
  computeFilter(addedItem: AddedItem<I, K>)

  // Returns true if the two keys have equivalent values.
  // - For primitive keys (string, number, boolean, null, undefined): uses === comparison
  // - For Date keys: compares using getTime()
  // - For compound keys (arrays): performs shallow comparison, applying these rules to each element
  // Note: Other object keys are compared by reference (===), not by value
  keysEqual(k1: K, k2: K): boolean

  // Returns the subindex at the given key, creating it if it doesn't yet exist
  getOrCreateSubindex(key: K): S {
    return getValueWithKey() if non-null
    subindex = subindexFn(key)
    addValueWithKey(subindex, key)
    return subindex
  }

  // Adds an item to the index.
  add(item: I): AddResult {
    // Get the associated AddedItem
    if getAddedItem(item) != null return {countChange: 0)
    addedItem = createAddedItem(item)
    return addAddedItem(item, addedItem.key, addedItem.included)
  }

  addAddedItem(item: I, key: K, included: boolean): AddResult {
    if !included return {countChange: 0}
    if isUnique() {
      if getItemWithKey(key) != null, uniqueness violation error
      addValueWithKey(item, key)
      count += 1
      return {countChange: 1}
    }
    // Many index - values are subindexes
    else {
      subindex = getOrCreateSubindex(key)
      addResult = subindex.add(item)
      count += addResult.countChange
      return addResult
    }
  }

  // Removes an item from the index
  remove(item: I): RemoveResult {
    addedItem = removeAddedItem(item)
    if addedItem == null return {countChange: 0}
    return removeAddedItem(item, addedItem.key, addedItem.included)
  }

  removeAddedItem(item: I, key: K, included: boolean): AddResult {
    if isUnique() {
      removeValueWithKey(item, key)
      count -= 1
      return {countChange: -1}
    }
    // Many index - values are subindexes
    else {
      subindex = getValueWithKey(key) // Should never be null
      removeResult = subindex.remove(item)
      checkForEmptySubindexAtKey(subindex, key)
      count += removeResult.countChange
      return removeResult
    }
  }

  onKeyChange(addedItem: AddedItem<I, K>) {
    processChange(addedItem, ()=>this.computeKey(addedItem))
  }

  onFilterChange(addedItem: AddedItem<I, K>) {
    processChange(addedItem, ()=>this.computeFilter(addedItem))
  }

  processChange(addedItem: AddedItem<I, K>, change: ()=>void) {
    item = addedItem.item
    oldKey = addedItem.key
    oldIncluded = addedItem.included
    change()
    newKey = addedItem.key
    newIncluded = addedItem.included

    // Make sure something actually changed
    if !keysEqual(oldKey, newKey) || oldIncluded != newIncluded {
      removeResult = removeAddedItem(item, oldKey, oldIncluded)
      addResult = addAddedItem(item, newKey, newIncluded)

      // Update count in self and parent
      countChange = removeResult.countChange + addResult.countChange
      if countChange != 0 {
        count += countChange
        if parent parent.subindexCountChanged(countChange)
      }
    }
  }

  // Clear out all added items, and index-specific structures, disconnecting everything from reactive callbacks and structures
  clear()

  // Check if the given subindex is empty and can safely be removed in order to save memory.
  checkForEmptySubindexAtKey(subindex: S, key: K) {
    if !subindex.hasAddedItems() {
      subindex.clear()
      removeValueWithKey(key)
    }
  }
}

AddResult {
  // The amount by which the add operation changed the count of the index.
  countChange: number
}

RemoveResult {
  // The amount by which the remove operation changed the count of the index.
  countChange: number
}

SubindexImpl<I> {
  add(item: I): AddResult
  remove(item: I): RemoveResult
  hasAddedItems(): boolean
  clear()
}
```

### Multindex implementation

A Multindex contains a Set of items, implements the SetIndex interface, and also has a remove() function. Unlike other index implementations, it does not have filters, so there is no distinction between added items and included items. In fact, the Multindex doesn't need the AddedItem structures at all. It can just be a thin wrapper around a Set that implement SetIndex AND Subindex (so it can be used as a subindex).

The only real special function of a Multindex is that its add and remove calls also need to be passed to the indexes contained in the Multindex. But aside from adding and removing, the Multindex lets those contained indexes run independently. For example, when adding to the contained indexes, the Multindex can ignore the countChange results, since the Multindex's count only depends on its own internal Set.

### SortedIndex key ordering

For comparing keys in SortedIndex, use the following rules:

**Single key ordering:**

- **strings**: Lexicographic comparison using `<` operator
- **numbers**: Numeric comparison using `<` operator
- **booleans**: `false < true`
- **Dates**: Compare by `getTime()`
- **null**: Sorts first (before all other values)
- **undefined**: Sorts after null, before other values

**Cross-type ordering** (when key types are mixed):

```
null < undefined < boolean < number < string < Date
```

**Compound key ordering:**

- Compare element by element, left to right
- First difference determines the overall ordering
- If one key is a prefix of another, the shorter key comes first

**Direction:**

- `"asc"`: Normal ordering as described above
- `"desc"`: Reversed ordering

### Separate Interface and Implementation trees

The index implementations should all derive from IndexImplBase (or be Multindexes). The public-facing API derives from IndexBase. The easiest thing to do would be to have the index implementations directly implement the API interfaces. However, there may be name collisions between the interfaces and the implementation methods as described above.

If that's an issue, there are a couple options:

- Just rename the implementation functions to get around collisions (e.g., "internalAdd" vs. "add")
- Have the API implementations be thin shells that have pointers to the underlying implementations. It adds a little complication since the Multindex builders need to track both the API interfaces (exposed as properties), and the internal implementations (called be add/remove). However, it's also the case that some kind of "wrapper" is going to be needed anyway to handle SortedIndex.query and SortedIndex.reverse.

### Reactive Index Structures

An important aspect of the system is that it can participate in the chchchchanges reactive functionality. As described earlier, this means that the indexes need to detect changes in the index and filter functions.

But this also goes in the other direction, where an application might use the indexes, and want to know about changes made to the indexes themselves. For example, an application might have a reactive function that retrieves the first item from a sorted index in a Multindex, and it might want to be notified if that value changes.

In theory, this _might_ just work. The chchchchanges library already handles Sets, Maps, and Arrays, which would presumably be the underlying structures used in the index implementations. As long as those implementations don't use those structures in strange or unexpected ways, it might all work out nicely.

### Subtype Indexes

An object model might be built on a type hierarchy.  For example, "Car" and "Bus" might be a subtypes of "Vehicle", which might be a subtype of "Asset".  An application would typically expect the set of all Cars and the set of all Busses to be distinct, but would expect them both to be included in the set of all Vehicles, which would also be included in the set of all Assets.

Multindex supports this by enabling a supertype/subtype relationship between Multindexes.  If an item is added to a subtype's Multindex, it will also be added to the Multindexes for all supertypes.  So adding an item to a "Car" Multindex would automatically add it to both the "Vehicle" and "Asset" Multindexes.  The same would be true for removing an item.

This relationship is specified as part the create function for a Multindex, by calling subtype() to create a new Multindex.  The subtype Multindex will automatically be connected to the enclosing Multindex to enable the above behavior.

Note that this means a Multindex can have some properties that are "additional indexes" and some that are "subtype indexes".  These two groups behave differently:

* additional indexes - items added to/removed from the Multindex are automatically added to/removed from all the additional indexes.
* subtype indexes - effectively acts in reverse.  Items added to a subtype index are automatically added to the supertype (parent) Multindex.

This also means that accessing subtype indexes follows the type hierarchy.  For example, accessing the indexes for Cars might be found at `indexes.Asset.Vehicle.Car.byId`.

Multindexes also support the notion of a "type discriminator" string, which are commonly used when serializing to/deserializing from JSON values.  In Multindex this is called a `subtypeName`.  The subtypeName is the full path from the "root" Multindex (the Mulindex with no supertype index) "down" to the subtype Multindex.  For example, "Asset.Vehicle.Car".  This is exposed on Multindex through the subtypeName property, and the addSubtype/removeSubtype calls.
