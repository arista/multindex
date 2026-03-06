/**
 * SortedViewImpl - Live, chainable view into sorted data
 */

import type { SortedView } from "./interfaces.js"
import type { SortQuery, SortKey } from "./types.js"
import type { SortDirection } from "./specs.js"
import { compareKeyToPartial } from "./sort-compare.js"

/**
 * Interface for the underlying sorted data source.
 * The view delegates to this for actual data access.
 */
export interface SortedDataSource<I> {
  /**
   * Iterate items in the given range, optionally reversed.
   * Uses binary search to find start/end points efficiently.
   */
  iterateRange(query: SortQuery<SortKey>, reversed: boolean): IterableIterator<I>

  /**
   * Count items in the given range.
   * Uses binary search to find start/end points efficiently.
   */
  countInRange(query: SortQuery<SortKey>): number

  /** Get the sort directions */
  getDirections(): SortDirection[]
}

/**
 * Configuration for a sorted view.
 */
interface SortedViewConfig<I> {
  /** The underlying data source */
  source: SortedDataSource<I>
  /** Whether iteration is reversed */
  reversed: boolean
  /** The query bounds */
  query: SortQuery<SortKey>
}

/**
 * Implementation of SortedView - a live, chainable view into sorted data.
 *
 * Views are live (reflect changes to the underlying index) and chainable
 * (query and reverse return new views).
 */
export class SortedViewImpl<I, PK> implements SortedView<I, PK> {
  private readonly source: SortedDataSource<I>
  private readonly isReversed: boolean
  private readonly queryBounds: SortQuery<SortKey>

  constructor(config: SortedViewConfig<I>) {
    this.source = config.source
    this.isReversed = config.reversed
    this.queryBounds = config.query
  }

  /**
   * Create a view with default settings (no reversal, no query bounds).
   */
  static create<I, PK>(source: SortedDataSource<I>): SortedViewImpl<I, PK> {
    return new SortedViewImpl<I, PK>({
      source,
      reversed: false,
      query: {},
    })
  }

  /**
   * Returns a view where iteration runs in reverse order.
   */
  reverse(): SortedView<I, PK> {
    return new SortedViewImpl<I, PK>({
      source: this.source,
      reversed: !this.isReversed,
      query: this.queryBounds,
    })
  }

  /**
   * Returns a view bounded by the given range query.
   * Query bounds are intersected with existing bounds.
   */
  query(q: SortQuery<PK>): SortedView<I, PK> {
    // Merge with existing query bounds
    const merged = this.mergeQuery(q as SortQuery<SortKey>)
    return new SortedViewImpl<I, PK>({
      source: this.source,
      reversed: this.isReversed,
      query: merged,
    })
  }

  /**
   * Merge a new query with existing bounds.
   * Takes the more restrictive bound for each side.
   */
  private mergeQuery(newQuery: SortQuery<SortKey>): SortQuery<SortKey> {
    const directions = this.source.getDirections()
    const merged: SortQuery<SortKey> = { ...this.queryBounds }

    // Merge lower bounds (gt/ge)
    if (newQuery.gt !== undefined) {
      merged.gt = this.maxLowerBound(merged.gt, merged.ge, newQuery.gt, directions)
      merged.ge = undefined
    } else if (newQuery.ge !== undefined) {
      if (merged.gt !== undefined) {
        // Keep gt if it's more restrictive
        const cmp = compareKeyToPartial(merged.gt as SortKey, newQuery.ge, directions)
        if (cmp < 0) {
          merged.gt = undefined
          merged.ge = newQuery.ge
        }
      } else {
        merged.ge = this.maxKey(merged.ge, newQuery.ge, directions)
      }
    }

    // Merge upper bounds (lt/le)
    if (newQuery.lt !== undefined) {
      merged.lt = this.minUpperBound(merged.lt, merged.le, newQuery.lt, directions)
      merged.le = undefined
    } else if (newQuery.le !== undefined) {
      if (merged.lt !== undefined) {
        // Keep lt if it's more restrictive
        const cmp = compareKeyToPartial(merged.lt as SortKey, newQuery.le, directions)
        if (cmp > 0) {
          merged.lt = undefined
          merged.le = newQuery.le
        }
      } else {
        merged.le = this.minKey(merged.le, newQuery.le, directions)
      }
    }

    return merged
  }

  private maxLowerBound(
    gt: SortKey | undefined,
    ge: SortKey | undefined,
    newGt: SortKey,
    directions: SortDirection[],
  ): SortKey {
    let result = newGt
    if (gt !== undefined) {
      const cmp = compareKeyToPartial(gt as SortKey, newGt, directions)
      if (cmp > 0) result = gt
    }
    if (ge !== undefined) {
      const cmp = compareKeyToPartial(ge as SortKey, newGt, directions)
      if (cmp >= 0) result = ge
    }
    return result
  }

  private minUpperBound(
    lt: SortKey | undefined,
    le: SortKey | undefined,
    newLt: SortKey,
    directions: SortDirection[],
  ): SortKey {
    let result = newLt
    if (lt !== undefined) {
      const cmp = compareKeyToPartial(lt as SortKey, newLt, directions)
      if (cmp < 0) result = lt
    }
    if (le !== undefined) {
      const cmp = compareKeyToPartial(le as SortKey, newLt, directions)
      if (cmp <= 0) result = le
    }
    return result
  }

  private maxKey(a: SortKey | undefined, b: SortKey, directions: SortDirection[]): SortKey {
    if (a === undefined) return b
    const cmp = compareKeyToPartial(a as SortKey, b, directions)
    return cmp >= 0 ? a : b
  }

  private minKey(a: SortKey | undefined, b: SortKey, directions: SortDirection[]): SortKey {
    if (a === undefined) return b
    const cmp = compareKeyToPartial(a as SortKey, b, directions)
    return cmp <= 0 ? a : b
  }

  /**
   * Make the view iterable.
   */
  [Symbol.iterator](): Iterator<I> {
    return this.source.iterateRange(this.queryBounds, this.isReversed)
  }

  /**
   * Get the count of items in this view.
   */
  get count(): number {
    return this.source.countInRange(this.queryBounds)
  }
}
