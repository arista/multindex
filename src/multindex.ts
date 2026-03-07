/**
 * Multindex - A collection with multiple indexes
 */

import type { ChangeDomain } from "chchchchanges"
import type { Multindex, SetIndex, IndexBase } from "./interfaces.js"
import type { IndexBuilder, IndexBuilderFn } from "./specs.js"
import type { MultindexConfig } from "./types.js"
import { IndexBuilderImpl } from "./index-builder.js"

/**
 * Internal interface for indexes that support item removal
 */
interface RemovableIndex<I> extends IndexBase<I> {
  remove?(item: I): void
}

/**
 * Multindex implementation.
 *
 * A Multindex is a SetIndex that contains additional named indexes.
 * Items added to the Multindex are automatically added to all contained indexes.
 *
 * @typeParam I - The item type
 * @typeParam IXS - The type of the indexes object
 */
class MultindexImpl<I, IXS extends Record<string, IndexBase<I>>>
  implements Multindex<I>, SetIndex<I>
{
  private readonly itemSet = new Set<I>()
  private readonly indexes: IXS
  private readonly indexList: IndexBase<I>[]
  private readonly domain: ChangeDomain | null
  private readonly reactive: boolean
  private readonly superindex: Multindex<unknown> | null

  private constructor(
    indexes: IXS,
    domain: ChangeDomain | null,
    reactive: boolean,
    superindex: Multindex<unknown> | null,
  ) {
    this.indexes = indexes
    this.indexList = Object.values(indexes)
    this.domain = domain
    this.reactive = reactive
    this.superindex = superindex
  }

  /**
   * Create a new Multindex with the given indexes.
   *
   * @param builderFn - Function that receives an IndexBuilder and returns named indexes
   * @param config - Optional configuration
   * @returns A Multindex with the indexes as properties
   */
  static create<I, IXS extends Record<string, IndexBase<I>>>(
    builderFn: IndexBuilderFn<I, IXS>,
    config?: MultindexConfig<unknown>,
  ): Multindex<I> & IXS {
    const domain = config?.domain ?? null
    const reactive = config?.reactive ?? true
    const superindex = config?.superindex ?? null
    const builder = new IndexBuilderImpl<I>(reactive ? domain : null)
    const indexes = builderFn(builder as IndexBuilder<I>)

    const multindex = new MultindexImpl<I, IXS>(indexes, domain, reactive, superindex)

    // Copy index properties onto the multindex instance
    for (const [key, value] of Object.entries(indexes)) {
      ;(multindex as unknown as Record<string, unknown>)[key] = value
    }

    return multindex as unknown as Multindex<I> & IXS
  }

  /**
   * The number of items in the Multindex
   */
  get count(): number {
    return this.itemSet.size
  }

  /**
   * Iterator over all items
   */
  get items(): IterableIterator<I> {
    return this.itemSet.values()
  }

  /**
   * Make the Multindex iterable
   */
  [Symbol.iterator](): Iterator<I> {
    return this.itemSet.values()
  }

  /**
   * Check if an item is in the Multindex
   */
  has(item: I): boolean {
    return this.itemSet.has(item)
  }

  /**
   * Add an item to the Multindex and all contained indexes.
   * When reactive mode is enabled, the item is wrapped in a reactive proxy
   * and changes to its properties will automatically trigger re-indexing.
   * If a superindex is configured, the item is also added to the superindex.
   * Returns the (possibly wrapped) item.
   */
  add(item: I): I {
    // Wrap in reactive proxy if reactive mode is enabled
    let trackedItem = item
    if (this.reactive && this.domain && typeof item === "object" && item !== null) {
      trackedItem = this.domain.enableChanges(item)
    }

    // Add to main set
    this.itemSet.add(trackedItem)

    // Add to all contained indexes
    for (const index of this.indexList) {
      index.add(trackedItem)
    }

    // Propagate to superindex (which may recursively propagate further)
    if (this.superindex) {
      this.superindex.add(trackedItem)
    }

    return trackedItem
  }

  /**
   * Remove an item from the Multindex and all contained indexes.
   * If a superindex is configured, the item is also removed from the superindex.
   */
  remove(item: I): void {
    // Remove from main set
    this.itemSet.delete(item)

    // Remove from all contained indexes
    for (const index of this.indexList) {
      const removable = index as RemovableIndex<I>
      if (removable.remove) {
        removable.remove(item)
      }
    }

    // Propagate to superindex (which may recursively propagate further)
    if (this.superindex) {
      this.superindex.remove(item)
    }
  }

  /**
   * Clear all items from the Multindex and all contained indexes.
   */
  clear(): void {
    this.itemSet.clear()

    for (const index of this.indexList) {
      const clearable = index as IndexBase<I> & { clear?(): void }
      if (clearable.clear) {
        clearable.clear()
      }
    }
  }
}

/**
 * Create a new Multindex.
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number
 *   name: string
 *   department: string
 * }
 *
 * const users = createMultindex<User>()((b) => ({
 *   byId: b.uniqueMap({ key: (u) => u.id }),
 *   byDepartment: b.manyMap({
 *     key: (u) => u.department,
 *     subindex: (b) => b.set(),
 *   }),
 * }))
 *
 * users.add({ id: 1, name: "Alice", department: "Engineering" })
 * users.byId.get(1) // { id: 1, name: "Alice", department: "Engineering" }
 * users.byDepartment.get("Engineering").count // 1
 * ```
 */
export function createMultindex<I>() {
  return function <IXS extends Record<string, IndexBase<I>>>(
    builderFn: IndexBuilderFn<I, IXS>,
    config?: MultindexConfig<unknown>,
  ): Multindex<I> & IXS {
    return MultindexImpl.create(builderFn, config)
  }
}
