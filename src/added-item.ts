/**
 * AddedItem - Bookkeeping structure for tracking items in an index
 *
 * Maintains reactive state for items added to an index, including
 * change detection for keys and filters.
 */

import type { ChangeDetecting, ChangeCallback } from "chchchchanges"

/**
 * Tracks an item that has been added to an index, along with its
 * reactive change detection state.
 *
 * @typeParam I - The item type
 * @typeParam K - The key type (null if the index doesn't use keys)
 */
export class AddedItem<I, K> {
  readonly item: I

  /**
   * Change detection state for the key computation.
   * Contains the computed key and a remove() function to disconnect callbacks.
   */
  keyChangeDetecting: ChangeDetecting<K> | null = null

  /**
   * Callback to invoke when the key might have changed.
   * Created once when the item is added and reused.
   */
  keyChangeCallback: ChangeCallback | null = null

  /**
   * Change detection state for the filter computation.
   * Contains the computed filter result and a remove() function to disconnect callbacks.
   */
  filterChangeDetecting: ChangeDetecting<boolean> | null = null

  /**
   * Callback to invoke when the filter result might have changed.
   * Created once when the item is added and reused.
   */
  filterChangeCallback: ChangeCallback | null = null

  constructor(item: I) {
    this.item = item
  }

  /**
   * Get the computed key for this item.
   * Returns null if no key has been computed.
   */
  get key(): K | null {
    return this.keyChangeDetecting?.result ?? null
  }

  /**
   * Check if this item is included (passes the filter).
   * Returns true if no filter has been computed (default to included).
   */
  get included(): boolean {
    return this.filterChangeDetecting?.result ?? true
  }

  /**
   * Clear out all reactive state, disconnecting from change detection.
   * Call this when removing an item from an index.
   */
  clear(): void {
    if (this.keyChangeDetecting) {
      this.keyChangeDetecting.remove()
      this.keyChangeDetecting = null
    }
    if (this.filterChangeDetecting) {
      this.filterChangeDetecting.remove()
      this.filterChangeDetecting = null
    }
    this.keyChangeCallback = null
    this.filterChangeCallback = null
  }
}
