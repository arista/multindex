# Design

Technical design for Multindex

## Public API


### Building Multindexes

```
// A Multindex is a SetIndex that contains additional indexes defined by the application.  Items added to the Multindex are added to all of those additional indexes.  Multindex also has a remove function that removes an item from the Multindex and all its additional indexes.

Multindex<I> extends SetIndex<I> {
  static create<I, IXS>(f: IndexBuilderFn<IXS>, config?: MultindexConfig): Multindex<I> & IXS

  // Remove an item from the Multindex and all its contained indexes
  remove(item: I): I
}

// The IndexBuilderFn should return a mapping from name to index implementation (supplied by the IndexBuilder).  Those mappings will become properties of a Multindex
IndexBuilderFn<IXS> = (b: IndexBuilder) => IXS


MultindexConfig {
  domain?: ChangeDomain // From chchchchanges
  // FIXME - other config?
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

// Does it make sense to explicitly list out tuple types of up to N elements?  Or is there a TS way to express tuple types such that partial key types (below) can be derived from them?
CompoundSortKeySpec = tuple of SingleSortKeySpec

CompoundSortKey = tuple of the key types from the compound SortKeySpecs

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

SubindexSpec<I, SUBIX extends Index<I>> = (b: IndexBuilder) => Index

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
```

## Index Filters

Index filters allow an index to specify what items should be included in the index.  This can get a little confusing because, as will be explained later, there needs to be a distinction between items that have been **added** to the index, vs. items that are **included** in the index.

* **added** - items that where add() has been called on the index, and remove() has not yet been called
* **included** - items that are added **and** that pass the index's filter (if any)

Each index's public API deals only with included items.  For example, count, get, iterators, etc. all only operate over included items.  From the API, the index will act like only **included** items were ever added to the index.

However, items that are added but not included still need to be managed by the index.  That's because an item might later be modified such that its filter now passes, and it can now be included.  This requires some extra bookkeeping by the index, namely to maintain and later cleanup the reactive callbacks involved.  So the index still needs to manage all **added** items, even if they are not yet **included**.






## Index Implementations

These are the index implementations currently offered:

* SetIndexImpl - SetIndex backed by a JS Set
* ArraySetIndexImpl - SetIndex backed by an Array, maintains items in the order they were added
* UniqueMapIndexImpl - MapIndex backed by a JS Map
* ManyMapIndexImpl - MapIndex backed by a JS Map, with subindex values
* UniqueSortedIndexImpl - SortedIndex backed by a JS Array
* ManySortedIndexImpl - SortedIndex backed by a JS Array, with subindex values
* UniqueBTreeArrayIndexImpl - SortedIndex backed by a BTree (implementation TBD)
* ManyBTreeArrayIndexImpl - SortedIndex backed by a BTree (implementation TBD), with subindex values
* Multindex - effectively a SetIndexImpl, but with additional indexes

Each of the implementations must implement these internal operations:

```
IndexImpl<I> {
  // Adds the item to the internal structure, if not already there.  Updates the count appropriately.  If this is a keyed index, then the key is computed using a function wrapped for reactivity.  The callback function for the reactivity calls onChange.  If a filter is configured for the index, then the filter function is called, again with the same reactivity rules, and the item is only added if the result is true.  However, even if a filter does not add the item, the item still needs to be tracked in case its filter result changes, or if the item is removed.  Assumes that item is already change-enabled.  Returns the amount that the index's count changes.
  internalAdd(item: I): number
  
  // Removes an item from the internal structure, if it's there.  Updates the count appropriately.  Returns the amount that the index's count changed
  internalRemove(item: I): number
  
  // Set as the callback for changes detected when computing an item's key and filter value
  onChange(item: I): ()=>void|null

  // Disconnect all items in preparation for the index being removed (typically called for subindexes about to be removed)
  internalClear()

  // Add, remove, or get a value (item or subindex depending on the index type) with the given key from the internal structures representing the index (Set, Map, Array, BTree, etc.).  Different index implementations will override these methods to fit their internal structures
  abstract internalAddItemWithKey(value: V, key: K)
  abstract internalRemoveItemWithKey(value: V, key: K)
  abstract internalGetItemWithKey(key: K): V | null
}
```

Each Index will likely use an internal structure to maintain information about each item, associating each item with this structure:

```
InternalIndexItem<I, K> {
  item: I
  onChangeCallback: ()=>(()=>void|null)
  keyChangeDetecting: ChangeDetecting<K>|null
  filterChangeDetecting: ChangeDetecting<boolean>|null
}
```

This structure enables the IndexImpl functions:

* it helps onChange by preserving the original key/filter across a change in the item, which helps onChange find the original item in the index's internal structure before figuring out where it should be moved to with its new key.
* it helps internalAdd by knowing if an item has already been added
* it helps internalRemove by preserving the key/filter so that the index knows where to find it to remove it.  It also helps the remove function remove() any ChangeDetecting structures.


Note that an index needs to keep track of all items added to it, even those items whose filter returns false.  For those items, the public API will make it appear that the item is not in the index - it's not included in the count, it won't be returned by get(), etc.  However, the index still needs to track if the filter result changes, and it needs to remove() the ChangeDetectings associated with the item.  So the index still needs to have a handle on the item (and its InternalIndexItem), and be able to iterate over those items.

This gets more complicated for many indexes, which don't actually store items but instead store references to subindexes that store the actual items.  In these cases, the filter attribute still applies at the parent index - if the filter returns false, then the item is not added to the subindexes.  So this means that even though the parent index doesn't actually store the item for use by the public API, it still needs to somehow track the internal state for those items so they can be disconnected from change detection.

Given all that, this means that indexes that declare a filter will need to keep a separate Map from item to InternalIndexItem.  Indexes without a filter can just keep a WeakMap, since they can use their own internal structures to iterate over items.

Implementation notes:

```
internalAdd(item) {
  get the mapping from item to InternalIndexItem - either the WeakMap (for indexes without filters) or Map (for indexes with filters)
  if InternalIndexItem exists then the item has already been added - return 0
  
  call the filter function (if any) with detectChanges, with a before callback set to call onChange and return onChange's return value
  if the item is exluded by filter, return 0

  call the key function (if any) with detectChanges, with a before callback set to call onChange and return onChange's return value

  create the associated InternalIndexItem, add to the WeakMap or Map

  if a unique index {
    internalAddItemWithKey
    add the InternalIndexItem to the index's internal structures (set, array, BTree, etc.), according to the item's key (if any)
    increment internal count
    return 1
  }
  else (many index) {
    check the index's internal structures to see if a subindex exists at the key.  Create and add a subindex if not
    recursively call internalAdd on the subindex, return its result
  }
}

internalRemove(item) {
  get the mapping from item to InternalIndexItem - either the WeakMap (for indexes without filters) or Map (for indexes with filters)
  if InternalIndexItem does not exist then the item wasn't added - return 0
  
  cleanup the InternalIndexItem's callbacks, making the appropriate remove() calls

  get the existing filter value from the InternalIndexItem
  if filtered out, then return 0

  get the existing key from the InternalIndexItem (if any)

  if a unique index {
    remove the InternalIndexItem from the index's internal structures (set, array, BTree, etc.), according to the item's key (if any)
    decrement internal count
    return -1
  }
  else (many index) {
    check the index's internal structures to see if a subindex exists at the key.  If not, create and add a subindex
    recursively call internalAdd on the subindex, get its result
    add the result to the internal count
    return the result
  }
}

onChange(item) {
  // This part is called before the modification is made to the item
  get the mapping from item to InternalIndexItem - either the WeakMap (for indexes without filters) or Map (for indexes with filters)
  if InternalIndexItem does not exist then the item wasn't added - return null
  
  remember the old key and filter

  result = 0

  // This part gets called after the modification is made to item
  return () => {
    clear out the InternalIndexItem (calling remove() as appropriate)
    compute the new key and filter with detectChanges, updating the InternalIndexItem
    if either the new key or filter have changed {
      if the old filter didn't exclude the item {
        if a unique index {
          remove the InternalIndexItem from the index's internal structures (set, array, BTree, etc.), according to the old key (if any)
          decrement internal count
          result -= 1
        }
        else (many index) {
          find the appropriate subindex
          result = internalRemove() called on the subindex, update internal count by the result
          if that leaves the subindex empty (count == 0) {
            internalClear() on the subindex
            remove the subindex from the internal structures
          }
        }
      }
      if the new filter doesn't exclude the item {
        if a unique index {
          add the InternalIndexItem to the index's internal structures (set, array, BTree, etc.), according to the new key (if any)
          increment internal count
          result += 1
        }
        else (many index) {
          find or create the appropriate subindex
          addResult = call internalAdd() on the subindex
          add addResult to internalCount
          result += addResult
        }
      }
    }

    if addResult != 0 notify parent of possible change to count
  }
}

```
