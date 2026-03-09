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
 * Interface for subtype multindexes that can be connected to their supertype.
 */
export interface SubtypeMultindex<I> extends Multindex<I> {
  /**
   * Connect this subtype to its supertype Multindex.
   * Called by the parent Multindex after creation.
   */
  setSupertype(supertype: Multindex<unknown>, propertyName: string): void

  /**
   * Marker for type narrowing.
   */
  readonly isSubtypeMultindex: true
}

/**
 * Check if an index is a SubtypeMultindex.
 */
export function isSubtypeMultindex<I>(index: unknown): index is SubtypeMultindex<I> {
  return (
    index !== null &&
    typeof index === "object" &&
    "isSubtypeMultindex" in index &&
    (index as { isSubtypeMultindex: unknown }).isSubtypeMultindex === true
  )
}

/**
 * Unified Multindex implementation.
 *
 * Supports both root multindexes (created via createMultindex) and
 * subtype multindexes (created via IndexBuilder.subtype).
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
  private readonly subtypeMap = new Map<string, SubtypeMultindex<I>>()

  // Subtype-specific fields (null for root multindexes)
  private supertypeIndex: Multindex<unknown> | null = null
  private propertyName: string | null = null

  // Marker for SubtypeMultindex type narrowing (only true when created as subtype)
  readonly isSubtypeMultindex: boolean

  private constructor(
    indexes: IXS,
    domain: ChangeDomain | null,
    isSubtype: boolean,
  ) {
    this.indexes = indexes
    this.indexList = Object.values(indexes)
    this.domain = domain
    this.isSubtypeMultindex = isSubtype as true | false

    // Track subtype indexes
    for (const [key, value] of Object.entries(indexes)) {
      if (isSubtypeMultindex(value)) {
        this.subtypeMap.set(key, value as SubtypeMultindex<I>)
      }
    }
  }

  /**
   * Create a new root Multindex with the given indexes.
   *
   * @param builderFn - Function that receives an IndexBuilder and returns named indexes
   * @param config - Optional configuration
   * @returns A Multindex with the indexes as properties
   */
  static create<I, IXS extends Record<string, IndexBase<I>>>(
    builderFn: IndexBuilderFn<I, IXS>,
    config?: MultindexConfig,
  ): Multindex<I> & IXS {
    const domain = config?.domain ?? null
    const reactive = config?.reactive ?? true
    const effectiveDomain = reactive ? domain : null
    const builder = new IndexBuilderImpl<I>(effectiveDomain)
    const indexes = builderFn(builder as IndexBuilder<I>)

    const multindex = new MultindexImpl<I, IXS>(indexes, effectiveDomain, false)

    // Copy index properties onto the multindex instance and connect subtypes
    for (const [key, value] of Object.entries(indexes)) {
      ;(multindex as unknown as Record<string, unknown>)[key] = value
      // Connect subtype indexes to this Multindex
      if (isSubtypeMultindex(value)) {
        value.setSupertype(multindex as unknown as Multindex<unknown>, key)
      }
    }

    return multindex as unknown as Multindex<I> & IXS
  }

  /**
   * Create a subtype Multindex from pre-built indexes.
   * Used by IndexBuilder.subtype().
   */
  static createSubtype<I, IXS extends Record<string, IndexBase<I>>>(
    indexes: IXS,
    domain: ChangeDomain | null,
  ): SubtypeMultindex<I> & IXS {
    const multindex = new MultindexImpl<I, IXS>(indexes, domain, true)

    // Copy index properties onto the multindex instance
    for (const [key, value] of Object.entries(indexes)) {
      ;(multindex as unknown as Record<string, unknown>)[key] = value
    }

    return multindex as unknown as SubtypeMultindex<I> & IXS
  }

  /**
   * Connect this subtype to its supertype Multindex.
   */
  setSupertype(supertype: Multindex<unknown>, propertyName: string): void {
    this.supertypeIndex = supertype
    this.propertyName = propertyName

    // Connect any nested subtypes
    for (const [key, subtype] of this.subtypeMap) {
      subtype.setSupertype(this as unknown as Multindex<unknown>, key)
    }
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
   * The full path from root to this Multindex (e.g., "Vehicle.Car").
   * Returns null for root multindexes.
   */
  get subtypeName(): string | null {
    if (!this.propertyName) return null
    const parentName = this.supertypeIndex?.subtypeName
    return parentName ? `${parentName}.${this.propertyName}` : this.propertyName
  }

  /**
   * Add an item to a subtype Multindex identified by subtypeName.
   */
  addSubtype(item: I, subtypeName: string | null): I {
    if (subtypeName === null) {
      return this.add(item)
    }

    const dotIndex = subtypeName.indexOf(".")
    const firstSegment = dotIndex >= 0 ? subtypeName.slice(0, dotIndex) : subtypeName
    const remainder = dotIndex >= 0 ? subtypeName.slice(dotIndex + 1) : null

    const subtype = this.subtypeMap.get(firstSegment)
    if (!subtype) {
      throw new Error(`Unknown subtype: ${firstSegment}`)
    }

    // Wrap in reactive proxy before passing to subtype (only at root level)
    let trackedItem = item
    if (!this.supertypeIndex && this.domain && typeof item === "object" && item !== null) {
      trackedItem = this.domain.enableChanges(item)
    }

    return subtype.addSubtype(trackedItem, remainder) as I
  }

  /**
   * Remove an item from a subtype Multindex identified by subtypeName.
   */
  removeSubtype(item: I, subtypeName: string | null): void {
    if (subtypeName === null) {
      this.remove(item)
      return
    }

    const dotIndex = subtypeName.indexOf(".")
    const firstSegment = dotIndex >= 0 ? subtypeName.slice(0, dotIndex) : subtypeName
    const remainder = dotIndex >= 0 ? subtypeName.slice(dotIndex + 1) : null

    const subtype = this.subtypeMap.get(firstSegment)
    if (!subtype) {
      throw new Error(`Unknown subtype: ${firstSegment}`)
    }

    subtype.removeSubtype(item, remainder)
  }

  /**
   * Add an item to the Multindex and all contained indexes.
   * When reactive mode is enabled, the item is wrapped in a reactive proxy
   * and changes to its properties will automatically trigger re-indexing.
   * Returns the (possibly wrapped) item.
   */
  add(item: I): I {
    // Wrap in reactive proxy if domain is set and not already wrapped
    let trackedItem = item
    if (this.domain && typeof item === "object" && item !== null) {
      trackedItem = this.domain.enableChanges(item)
    }

    // Add to main set
    this.itemSet.add(trackedItem)

    // Add to all contained indexes (but skip subtype indexes - they get items via their own add)
    for (const index of this.indexList) {
      if (!isSubtypeMultindex(index)) {
        index.add(trackedItem)
      }
    }

    // Propagate up to supertype if this is a subtype
    if (this.supertypeIndex) {
      this.supertypeIndex.add(trackedItem as unknown)
    }

    return trackedItem
  }

  /**
   * Remove an item from the Multindex and all contained indexes.
   */
  remove(item: I): void {
    // Remove from main set
    this.itemSet.delete(item)

    // Remove from all contained indexes (but skip subtype indexes - they handle their own removes)
    for (const index of this.indexList) {
      if (!isSubtypeMultindex(index)) {
        const removable = index as RemovableIndex<I>
        if (removable.remove) {
          removable.remove(item)
        }
      }
    }

    // Propagate up to supertype if this is a subtype
    if (this.supertypeIndex) {
      this.supertypeIndex.remove(item as unknown)
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
    config?: MultindexConfig,
  ): Multindex<I> & IXS {
    return MultindexImpl.create(builderFn, config)
  }
}

/**
 * Create a subtype Multindex for use by IndexBuilder.subtype().
 * This is an internal factory function.
 */
export function createSubtypeMultindex<I, IXS extends Record<string, IndexBase<I>>>(
  indexes: IXS,
  domain: ChangeDomain | null,
): SubtypeMultindex<I> & IXS {
  return MultindexImpl.createSubtype(indexes, domain)
}
