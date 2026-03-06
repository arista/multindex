/**
 * IndexBuilder - Builder for creating indexes within a Multindex
 */

import type { ChangeDomain } from "chchchchanges"
import type {
  IndexBase,
  SetIndex,
  UniqueMapIndex,
  UniqueSortedIndex,
  ManyMapIndex,
  ManySortedIndex,
} from "./interfaces.js"
import type {
  IndexBuilder,
  SetSpec,
  ArraySetSpec,
  UniqueMapSpec,
  UniqueSortedSpec,
  UniqueBTreeSpec,
  ManyMapSpec,
  ManySortedSpec,
  ManyBTreeSpec,
  IndexBuilderFn,
  FullMapKeySpec,
  FullSingleSortKeySpec,
  FullFilterSpec,
} from "./specs.js"
import type { SingleSortKey } from "./types.js"
import { SetIndexImpl } from "./set-index-impl.js"
import { ArraySetIndexImpl } from "./array-set-index-impl.js"
import { UniqueMapIndexImpl } from "./unique-map-index-impl.js"
import { UniqueSortedIndexImpl } from "./unique-sorted-index-impl.js"
import { ManyMapIndexImpl } from "./many-map-index-impl.js"
import { ManySortedIndexImpl } from "./many-sorted-index-impl.js"

/**
 * Implementation of IndexBuilder.
 *
 * Provides methods to create various index types with different configurations.
 */
export class IndexBuilderImpl<I> implements IndexBuilder<I> {
  private readonly domain: ChangeDomain | null

  constructor(domain: ChangeDomain | null) {
    this.domain = domain
  }

  // ===========================================================================
  // Set Indexes
  // ===========================================================================

  /**
   * Create a Set index backed by a JavaScript Set.
   */
  set(spec?: SetSpec<I>): SetIndex<I> {
    return new SetIndexImpl<I>(this.domain, spec ?? {})
  }

  /**
   * Create an Array-backed Set index that maintains insertion order.
   */
  arraySet(spec?: ArraySetSpec<I>): SetIndex<I> {
    return new ArraySetIndexImpl<I>(this.domain, spec ?? {})
  }

  // ===========================================================================
  // Unique Map Indexes
  // ===========================================================================

  /**
   * Create a unique map index where each key maps to exactly one item.
   */
  uniqueMap<K>(spec: UniqueMapSpec<I, K>): UniqueMapIndex<I, K> {
    return new UniqueMapIndexImpl<I, K>(this.domain, spec)
  }

  // ===========================================================================
  // Unique Sorted Indexes
  // ===========================================================================

  /**
   * Create a unique sorted index backed by a sorted array.
   */
  uniqueSorted<K extends SingleSortKey>(spec: UniqueSortedSpec<I, K>): UniqueSortedIndex<I, K> {
    return new UniqueSortedIndexImpl<I, K>(this.domain, spec)
  }

  /**
   * Create a unique sorted index backed by a BTree.
   * Currently uses sorted array implementation as placeholder.
   */
  uniqueBTree<K extends SingleSortKey>(spec: UniqueBTreeSpec<I, K>): UniqueSortedIndex<I, K> {
    // TODO: Implement BTree-backed version in Step 10
    return new UniqueSortedIndexImpl<I, K>(this.domain, spec)
  }

  // ===========================================================================
  // Many Map Indexes
  // ===========================================================================

  /**
   * Create a many map index where each key maps to a subindex.
   */
  manyMap<K, SUBIX extends IndexBase<I>>(
    spec: ManyMapSpec<I, K, SUBIX>,
  ): ManyMapIndex<I, SUBIX, K> {
    const createSubindex = () => spec.subindex(this as IndexBuilder<I>)
    return new ManyMapIndexImpl<I, K, SUBIX>(this.domain, spec, createSubindex)
  }

  // ===========================================================================
  // Many Sorted Indexes
  // ===========================================================================

  /**
   * Create a many sorted index backed by a sorted array.
   */
  manySorted<K extends SingleSortKey, SUBIX extends IndexBase<I>>(
    spec: ManySortedSpec<I, K, SUBIX>,
  ): ManySortedIndex<I, SUBIX, K> {
    const createSubindex = () => spec.subindex(this as IndexBuilder<I>)
    return new ManySortedIndexImpl<I, K, SUBIX>(this.domain, spec, createSubindex)
  }

  /**
   * Create a many sorted index backed by a BTree.
   * Currently uses sorted array implementation as placeholder.
   */
  manyBTree<K extends SingleSortKey, SUBIX extends IndexBase<I>>(
    spec: ManyBTreeSpec<I, K, SUBIX>,
  ): ManySortedIndex<I, SUBIX, K> {
    // TODO: Implement BTree-backed version in Step 10
    const createSubindex = () => spec.subindex(this as IndexBuilder<I>)
    return new ManySortedIndexImpl<I, K, SUBIX>(this.domain, spec, createSubindex)
  }

  // ===========================================================================
  // Nested Multindex
  // ===========================================================================

  /**
   * Create a nested multindex as a subindex.
   * This creates a SetIndex with additional named indexes.
   */
  mult<IXS extends Record<string, IndexBase<I>>>(f: IndexBuilderFn<I, IXS>): SetIndex<I> & IXS {
    // Create the indexes using this builder
    const indexes = f(this as IndexBuilder<I>)

    // Create a composite that is both a SetIndex and has the named indexes
    return new NestedMultindexImpl<I, IXS>(this.domain, indexes) as unknown as SetIndex<I> & IXS
  }

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  /**
   * Create a map key spec with getter and optional setter.
   */
  key<K>(get: (item: I) => K, set?: (item: I, value: K) => void): FullMapKeySpec<I, K> {
    return { get, set }
  }

  /**
   * Create an ascending sort key spec.
   */
  asc<K extends SingleSortKey>(
    get: (item: I) => K,
    set?: (item: I, value: K) => void,
  ): FullSingleSortKeySpec<I, K> {
    return { direction: "asc", get, set }
  }

  /**
   * Create a descending sort key spec.
   */
  desc<K extends SingleSortKey>(
    get: (item: I) => K,
    set?: (item: I, value: K) => void,
  ): FullSingleSortKeySpec<I, K> {
    return { direction: "desc", get, set }
  }

  /**
   * Create a filter spec.
   */
  filter(get: (item: I) => boolean): FullFilterSpec<I> {
    return { get }
  }
}

/**
 * Nested Multindex implementation for use as a subindex.
 *
 * This is a SetIndex that also contains additional named indexes.
 * Unlike the top-level Multindex, it participates in the index hierarchy.
 */
class NestedMultindexImpl<I, IXS extends Record<string, IndexBase<I>>> implements SetIndex<I> {
  private readonly setIndex: SetIndexImpl<I>
  private readonly indexes: IXS
  private readonly indexList: IndexBase<I>[]

  constructor(domain: ChangeDomain | null, indexes: IXS) {
    this.setIndex = new SetIndexImpl<I>(domain, {})
    this.indexes = indexes
    this.indexList = Object.values(indexes)

    // Copy index properties onto this instance
    for (const [key, value] of Object.entries(indexes)) {
      ;(this as Record<string, unknown>)[key] = value
    }
  }

  get count(): number {
    return this.setIndex.count
  }

  get items(): IterableIterator<I> {
    return this.setIndex.items
  }

  [Symbol.iterator](): Iterator<I> {
    return this.setIndex[Symbol.iterator]()
  }

  has(item: I): boolean {
    return this.setIndex.has(item)
  }

  add(item: I): I {
    this.setIndex.add(item)
    for (const index of this.indexList) {
      index.add(item)
    }
    return item
  }

  remove(item: I): void {
    this.setIndex.remove(item)
    for (const index of this.indexList) {
      const removable = index as IndexBase<I> & { remove?(item: I): void }
      if (removable.remove) {
        removable.remove(item)
      }
    }
  }

  clear(): void {
    this.setIndex.clear()
    for (const index of this.indexList) {
      const clearable = index as IndexBase<I> & { clear?(): void }
      if (clearable.clear) {
        clearable.clear()
      }
    }
  }
}
