# Design

Technical design for Multindex

## Public API


### Building Multindexes

```
Multindex<I> {
  static create<I>(f: IndexBuilderFn, config?: MultindexConfig): MIXS
  
  // FIXME
  add(item: I): I
  remove(item: I)
}

IndexBuilderFn = (b: IndexBuilder) => IXS

where IXS is a mapping from name to index type, and MIXS is a Multindex that implements that mapping


MultindexConfig {
  // FIXME
  domain?: ChangeDomain // From chchchchanges
}

IndexBuilder<I> {
  set(spec?: SetSpec<I>) => SetIndex
  arraySet(spec?: ArraySetSpec<I>) => SetIndex

  uniqueMap<K>(keySpec: MapKeySpec<I, K>) =>  UniqueMapIndex<I, K>
    OR uniqueMap<K>(spec: UniqueMapSpec<I, K>) =>  UniqueMapIndex<I, K>
  uniqueSorted<K>(keySpec: SortedKeySpec<I, K>) =>  UniqueSortedIndex<I, K>
    OR uniqueSorted<K>(spec: UniqueSortedSpec<I, K>) =>  UniqueSortedIndex<I, K>
  uniqueBTree<K>(keySpec: SortedKeySpec<I, K>) =>  UniqueBTreeIndex<I, K>
    OR uniqueBTree<K>(spec: UniqueBTreeSpec<I, K>) =>  UniqueBTreeIndex<I, K>

  manyMap<K>(keySpec: MapKeySpec<I, K>, subindexSpec: SubindexSpec<I>) => ManyMapIndex
    OR manyMap<K>(spec: ManyMapSpec<I, K>) =>  ManyMapIndex<I, K>
  manySorted<K>(keySpec: SortedKeySpec<I, K>, subindexSpec: SubindexSpec<I>) => ManySortedIndex
    OR manySorted<K>(spec: ManySortedSpec<I, K>) =>  ManySortedIndex<I, K>
  manyBTree<K>(keySpec: BTreeKeySpec<I, K>, subindexSpec: SubindexSpec<I>) => ManyBTreeIndex
    OR manyBTree<K>(spec: ManyBTreeSpec<I, K>) =>  ManyBTreeIndex<I, K>
  
  // helper functions
  key<K>(get: (item: I) => K, set?: (item: I, value: K) => void) => MapKeySpec<I, K>
  asc<K extends SingleSortKey>(get: (item: I) => K, set?: (item: I, value: K) => void) => SortedKeySpec<I, K>
  desc<K extends SingleSortKey>(get: (item: I) => K, set?: (item: I, value: K) => void) => SortedKeySpec<I, K>
  filter: (get: (item: I) => boolean, set?: (item: I, shouldInclude: boolean) => void)
}

FilterSpec<I> = GetterFilterSpec<I> | FullFilterSpec<I>

GetterFilterSpec<I> = (item: I) => boolean

FullFilterSpec<I> = {
  get: (item: I) => boolean
  set?: (item: I, shouldInclude: boolean) => void
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

SingleSortKeySpec<I, K extends SingleSortKey> =
  GetterSingleSortKeySpec<I, K>
  | FullSingleSortKeySpec<I, K>
  
GetterSingleSortKeySpec<I, K extends SingleSortKey> = (item: I) => K

FullSingleSortKeySpec<I, K extends SingleSortKey> = {
  direction: "asc" | "desc"
  get: (item: I) => K
  set?: (item: I, value: K) => void
}

SortKey = SingleSortKey | CompoundSortKey

SingleSortKey = null | undefined | boolean | string | number

// Does it make sense to explicitly list out tuple types of up to N elements?  Or is there a TS way to express tuple types such that partial key types (below) can be derived from them?
CompoundSortKeySpec = tuple of SingleSortKeySpec

CompoundSortKey = tuple of the key types from the compound SortKeySpecs

PartialSortKey<CK> =
  if CK is a SingleSortKey, then return CK
  if CK is a tuple of SingleSortKeys, then return the union of all subarrays of CK starting with index 0.  For example, if CK is [K1, K2, K3], then return [] | [K1] | [K1, K2] | [K1, K2, K3]



ManyMapSpec<I, K, SUBIX extends Index<I>> = UniqueMapSpec<I, K> {
  subindex: SubindexSpec<I, SUBIX>
}

ManySortedSpec<I, K, SUBIX extends Index<I>> = UniqueSortedSpec<I, K> {
  subindex: SubindexSpec<I, SUBIX>
}

ManyBTreeSpec<I, K, SUBIX extends Index<I>> = UniqueBTreeSpec<I, K> {
  subindex: SubindexSpec<I, SUBIX>
}

SubindexSpec<I, SUBIX extends Index<I>> = (b: IndexBuilder) => Index or Multindex

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
