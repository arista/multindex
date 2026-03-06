/**
 * IndexImplBase - Base class for all index implementations
 *
 * Concentrates common operations for all index types, including:
 * - Managing added items and their reactive state
 * - Key and filter computation with change detection
 * - Subindex management for Many indexes
 */

import type { ChangeDomain } from "chchchchanges"
import { AddedItem } from "./added-item.js"
import type { AddResult, RemoveResult } from "./types.js"
import type { FilterSpec, MapKeySpec } from "./specs.js"
import { UniquenessViolationError } from "./errors.js"

/**
 * Internal interface for subindexes in Many indexes
 */
export interface SubindexImpl<I> {
  add(item: I): AddResult
  remove(item: I): RemoveResult
  hasAddedItems(): boolean
  clear(): void
}

/**
 * Configuration for creating an IndexImplBase
 */
export interface IndexImplConfig<I, K> {
  /** The change domain for reactivity (null if non-reactive) */
  domain: ChangeDomain | null

  /** Function to extract a key from an item (null if no key) */
  keyFn: ((item: I) => K) | null

  /** Optional setter function for the key */
  keySetFn: ((item: I, value: K) => void) | null

  /** Function to determine if an item should be included (null if no filter) */
  filterFn: ((item: I) => boolean) | null

  /** Function to create a subindex for a key (null if unique index) */
  subindexFn: ((key: K) => SubindexImpl<I>) | null
}

/**
 * Base class for all index implementations.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (use `null` if the index doesn't use keys)
 */
export abstract class IndexImplBase<I, K> {
  /**
   * The parent index if this is a subindex, null otherwise.
   * Note: A Multindex is NOT considered a parent of its contained indexes.
   */
  parent: IndexImplBase<I, unknown> | null = null

  /**
   * The key within the parent that references this subindex
   */
  keyInParent: unknown = null

  /**
   * Map of items to their AddedItem bookkeeping structures.
   * Created on demand to save memory for simple cases.
   */
  protected addedItems: Map<I, AddedItem<I, K>> | null = null

  /**
   * The number of included items.
   * For Many indexes, this is the total across all subindexes.
   */
  protected _count: number = 0

  /**
   * The change domain for reactivity, or null if non-reactive
   */
  protected readonly domain: ChangeDomain | null

  /**
   * Function to extract a key from an item
   */
  protected readonly keyFn: ((item: I) => K) | null

  /**
   * Function to set a key on an item
   */
  protected readonly keySetFn: ((item: I, value: K) => void) | null

  /**
   * Function to determine if an item should be included
   */
  protected readonly filterFn: ((item: I) => boolean) | null

  /**
   * Function to create a subindex for a key
   */
  protected readonly subindexFn: ((key: K) => SubindexImpl<I>) | null

  constructor(config: IndexImplConfig<I, K>) {
    this.domain = config.domain
    this.keyFn = config.keyFn
    this.keySetFn = config.keySetFn
    this.filterFn = config.filterFn
    this.subindexFn = config.subindexFn
  }

  // ===========================================================================
  // Abstract methods - implemented by specific index types
  // ===========================================================================

  /**
   * Get the value stored at a key.
   * For unique indexes, this is the item. For many indexes, this is a subindex.
   */
  protected abstract getValueWithKey(key: K): I | SubindexImpl<I> | null

  /**
   * Store a value at a key.
   * For unique indexes, the value is the item. For many indexes, it's a subindex.
   */
  protected abstract addValueWithKey(value: I | SubindexImpl<I>, key: K): void

  /**
   * Remove the value at a key.
   */
  protected abstract removeValueWithKey(key: K): void

  /**
   * Clear all stored values (index-specific structures only, not addedItems)
   */
  protected abstract clearValues(): void

  /**
   * Returns true if this is a unique index (one item per key),
   * false if it's a many index (subindex per key)
   */
  protected abstract isUnique(): boolean

  // ===========================================================================
  // Public accessors
  // ===========================================================================

  /**
   * The number of included items
   */
  get count(): number {
    return this._count
  }

  // ===========================================================================
  // AddedItem management
  // ===========================================================================

  /**
   * Create an AddedItem for an item, setting up change detection callbacks.
   * The AddedItem is added to the addedItems map.
   */
  protected createAddedItem(item: I): AddedItem<I, K> {
    const addedItem = new AddedItem<I, K>(item)

    // Set up key change callback
    if (this.keyFn) {
      addedItem.keyChangeCallback = () => this.onKeyChange(addedItem)
    }

    // Set up filter change callback
    if (this.filterFn) {
      addedItem.filterChangeCallback = () => this.onFilterChange(addedItem)
    }

    // Compute initial key and filter
    this.computeKey(addedItem)
    this.computeFilter(addedItem)

    // Add to the map
    if (!this.addedItems) {
      this.addedItems = new Map()
    }
    this.addedItems.set(item, addedItem)

    return addedItem
  }

  /**
   * Get the AddedItem for an item, or null if not added
   */
  protected getAddedItem(item: I): AddedItem<I, K> | null {
    return this.addedItems?.get(item) ?? null
  }

  /**
   * Remove and return the AddedItem for an item, clearing its reactive state
   */
  protected removeAddedItem(item: I): AddedItem<I, K> | null {
    const addedItem = this.addedItems?.get(item)
    if (addedItem) {
      addedItem.clear()
      this.addedItems!.delete(item)
      if (this.addedItems!.size === 0) {
        this.addedItems = null
      }
    }
    return addedItem ?? null
  }

  /**
   * Returns true if there are any added items
   */
  hasAddedItems(): boolean {
    return this.addedItems !== null && this.addedItems.size > 0
  }

  // ===========================================================================
  // Key and filter computation
  // ===========================================================================

  /**
   * Compute the key for an item, setting up change detection if reactive
   */
  protected computeKey(addedItem: AddedItem<I, K>): void {
    if (!this.keyFn) {
      return
    }

    // Remove previous detection if any
    if (addedItem.keyChangeDetecting) {
      addedItem.keyChangeDetecting.remove()
    }

    if (this.domain && addedItem.keyChangeCallback) {
      // Reactive: wrap in detectChanges
      addedItem.keyChangeDetecting = this.domain.detectChanges(
        () => this.keyFn!(addedItem.item),
        addedItem.keyChangeCallback,
        "keyComputation",
      )
    } else {
      // Non-reactive: just compute the key
      const key = this.keyFn(addedItem.item)
      addedItem.keyChangeDetecting = {
        result: key,
        remove: () => {},
      }
    }
  }

  /**
   * Compute the filter for an item, setting up change detection if reactive
   */
  protected computeFilter(addedItem: AddedItem<I, K>): void {
    if (!this.filterFn) {
      return
    }

    // Remove previous detection if any
    if (addedItem.filterChangeDetecting) {
      addedItem.filterChangeDetecting.remove()
    }

    if (this.domain && addedItem.filterChangeCallback) {
      // Reactive: wrap in detectChanges
      addedItem.filterChangeDetecting = this.domain.detectChanges(
        () => this.filterFn!(addedItem.item),
        addedItem.filterChangeCallback,
        "filterComputation",
      )
    } else {
      // Non-reactive: just compute the filter
      const included = this.filterFn(addedItem.item)
      addedItem.filterChangeDetecting = {
        result: included,
        remove: () => {},
      }
    }
  }

  // ===========================================================================
  // Key comparison
  // ===========================================================================

  /**
   * Compare two keys for equality.
   * - For primitives: uses ===
   * - For Dates: compares using getTime()
   * - For arrays (compound keys): shallow comparison of elements
   * - For other objects: reference equality (===)
   */
  protected keysEqual(k1: K | null, k2: K | null): boolean {
    if (k1 === k2) {
      return true
    }
    if (k1 === null || k2 === null) {
      return false
    }

    // Handle Date comparison
    if (k1 instanceof Date && k2 instanceof Date) {
      return k1.getTime() === k2.getTime()
    }

    // Handle compound keys (arrays)
    if (Array.isArray(k1) && Array.isArray(k2)) {
      if (k1.length !== k2.length) {
        return false
      }
      for (let i = 0; i < k1.length; i++) {
        const e1 = k1[i]
        const e2 = k2[i]
        if (e1 instanceof Date && e2 instanceof Date) {
          if (e1.getTime() !== e2.getTime()) {
            return false
          }
        } else if (e1 !== e2) {
          return false
        }
      }
      return true
    }

    return false
  }

  // ===========================================================================
  // Subindex management (for Many indexes)
  // ===========================================================================

  /**
   * Get or create a subindex at the given key
   */
  protected getOrCreateSubindex(key: K): SubindexImpl<I> {
    const existing = this.getValueWithKey(key) as SubindexImpl<I> | null
    if (existing) {
      return existing
    }

    const subindex = this.subindexFn!(key)
    // Set parent reference if the subindex supports it
    if (subindex instanceof IndexImplBase) {
      subindex.parent = this as unknown as IndexImplBase<I, unknown>
      subindex.keyInParent = key
    }
    this.addValueWithKey(subindex, key)
    return subindex
  }

  /**
   * Check if a subindex is empty and can be removed
   */
  protected checkForEmptySubindexAtKey(subindex: SubindexImpl<I>, key: K): void {
    if (!subindex.hasAddedItems()) {
      subindex.clear()
      this.removeValueWithKey(key)
    }
  }

  /**
   * Called by subindexes to notify that their count changed
   */
  subindexCountChanged(countChange: number): void {
    this._count += countChange
    if (this.parent) {
      this.parent.subindexCountChanged(countChange)
    }
  }

  // ===========================================================================
  // Add/Remove operations
  // ===========================================================================

  /**
   * Add an item to the index (returns AddResult for internal/subindex use)
   */
  addInternal(item: I): AddResult {
    // Check if already added
    if (this.getAddedItem(item) !== null) {
      return { countChange: 0 }
    }

    const addedItem = this.createAddedItem(item)
    return this.addIncludedItem(item, addedItem.key, addedItem.included)
  }

  /**
   * Internal: add an item that passes its filter
   */
  protected addIncludedItem(item: I, key: K | null, included: boolean): AddResult {
    if (!included) {
      return { countChange: 0 }
    }

    if (this.isUnique()) {
      // Unique index - check for uniqueness violation
      if (key !== null && this.getValueWithKey(key) !== null) {
        throw new UniquenessViolationError(key)
      }
      this.addValueWithKey(item, key as K)
      this._count += 1
      return { countChange: 1 }
    } else {
      // Many index - delegate to subindex
      const subindex = this.getOrCreateSubindex(key as K)
      const result = subindex.add(item)
      this._count += result.countChange
      return result
    }
  }

  /**
   * Remove an item from the index
   */
  remove(item: I): RemoveResult {
    const addedItem = this.removeAddedItem(item)
    if (!addedItem) {
      return { countChange: 0 }
    }
    return this.removeIncludedItem(item, addedItem.key, addedItem.included)
  }

  /**
   * Internal: remove an item that was included
   */
  protected removeIncludedItem(item: I, key: K | null, included: boolean): RemoveResult {
    if (!included) {
      return { countChange: 0 }
    }

    if (this.isUnique()) {
      this.removeValueWithKey(key as K)
      this._count -= 1
      return { countChange: -1 }
    } else {
      // Many index - delegate to subindex
      const subindex = this.getValueWithKey(key as K) as SubindexImpl<I> | null
      if (!subindex) {
        return { countChange: 0 }
      }
      const result = subindex.remove(item)
      this.checkForEmptySubindexAtKey(subindex, key as K)
      this._count += result.countChange
      return result
    }
  }

  // ===========================================================================
  // Change handlers
  // ===========================================================================

  /**
   * Called when an item's key might have changed
   */
  protected onKeyChange(addedItem: AddedItem<I, K>): void {
    this.processChange(addedItem, () => this.computeKey(addedItem))
  }

  /**
   * Called when an item's filter result might have changed
   */
  protected onFilterChange(addedItem: AddedItem<I, K>): void {
    this.processChange(addedItem, () => this.computeFilter(addedItem))
  }

  /**
   * Process a change to an item's key or filter
   */
  protected processChange(addedItem: AddedItem<I, K>, change: () => void): void {
    const item = addedItem.item
    const oldKey = addedItem.key
    const oldIncluded = addedItem.included

    change()

    const newKey = addedItem.key
    const newIncluded = addedItem.included

    // Check if anything actually changed
    if (this.keysEqual(oldKey, newKey) && oldIncluded === newIncluded) {
      return
    }

    // Re-index the item
    const removeResult = this.removeIncludedItem(item, oldKey, oldIncluded)
    const addResult = this.addIncludedItem(item, newKey, newIncluded)

    // Update count (already done in remove/add, but need to notify parent)
    const countChange = removeResult.countChange + addResult.countChange
    if (countChange !== 0 && this.parent) {
      this.parent.subindexCountChanged(countChange)
    }
  }

  /**
   * Clear all items and reactive state
   */
  clear(): void {
    if (this.addedItems) {
      for (const addedItem of this.addedItems.values()) {
        addedItem.clear()
      }
      this.addedItems = null
    }
    this.clearValues()
    this._count = 0
  }
}

// ===========================================================================
// Helper functions for extracting key/filter functions from specs
// ===========================================================================

/**
 * Extract a key getter function from a MapKeySpec
 */
export function getKeyFn<I, K>(spec: MapKeySpec<I, K>): (item: I) => K {
  if (typeof spec === "function") {
    return spec
  }
  return spec.get
}

/**
 * Extract an optional key setter function from a MapKeySpec
 */
export function getKeySetFn<I, K>(spec: MapKeySpec<I, K>): ((item: I, value: K) => void) | null {
  if (typeof spec === "function") {
    return null
  }
  return spec.set ?? null
}

/**
 * Extract a filter function from a FilterSpec
 */
export function getFilterFn<I>(spec: FilterSpec<I> | undefined): ((item: I) => boolean) | null {
  if (!spec) {
    return null
  }
  if (typeof spec === "function") {
    return spec
  }
  return spec.get
}
