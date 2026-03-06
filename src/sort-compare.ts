/**
 * Comparison utilities for sorted indexes
 *
 * Implements the ordering rules:
 * - null < undefined < boolean < number < string < Date
 * - Within type: lexicographic for strings, numeric for numbers, etc.
 * - Compound keys: element-by-element, left to right
 */

import type { SingleSortKey, SortKey } from "./types.js"
import type { SortDirection, SingleSortKeySpec } from "./specs.js"

/**
 * Get the type order for cross-type comparison.
 * Lower numbers sort first.
 */
function getTypeOrder(value: SingleSortKey): number {
  if (value === null) return 0
  if (value === undefined) return 1
  if (typeof value === "boolean") return 2
  if (typeof value === "number") return 3
  if (typeof value === "string") return 4
  if (value instanceof Date) return 5
  return 6 // Unknown type, sort last
}

/**
 * Compare two single sort keys.
 * Returns negative if a < b, positive if a > b, zero if equal.
 */
export function compareSingleKeys(a: SingleSortKey, b: SingleSortKey): number {
  // Handle same reference or both null/undefined
  if (a === b) return 0

  // Get type orders for cross-type comparison
  const typeA = getTypeOrder(a)
  const typeB = getTypeOrder(b)

  // Different types: compare by type order
  if (typeA !== typeB) {
    return typeA - typeB
  }

  // Same type: compare within type
  if (a === null || a === undefined) {
    // Both are null or both are undefined (same type), already handled by a === b
    return 0
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    // false < true
    return a === b ? 0 : a ? 1 : -1
  }

  if (typeof a === "number" && typeof b === "number") {
    // Handle NaN: NaN sorts after all other numbers
    if (Number.isNaN(a) && Number.isNaN(b)) return 0
    if (Number.isNaN(a)) return 1
    if (Number.isNaN(b)) return -1
    return a - b
  }

  if (typeof a === "string" && typeof b === "string") {
    // Lexicographic comparison
    return a < b ? -1 : a > b ? 1 : 0
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }

  // Fallback (shouldn't reach here with valid SingleSortKey types)
  return 0
}

/**
 * Compare two sort keys (single or compound).
 * Directions array specifies the direction for each element (or single direction for single keys).
 *
 * @param a - First key
 * @param b - Second key
 * @param directions - Array of directions, one per key element
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export function compareKeys(a: SortKey, b: SortKey, directions: SortDirection[]): number {
  const aArray = Array.isArray(a) ? a : [a]
  const bArray = Array.isArray(b) ? b : [b]

  // Compare element by element
  const minLen = Math.min(aArray.length, bArray.length)
  for (let i = 0; i < minLen; i++) {
    const cmp = compareSingleKeys(aArray[i] as SingleSortKey, bArray[i] as SingleSortKey)
    if (cmp !== 0) {
      const dir = directions[i] ?? "asc"
      return dir === "desc" ? -cmp : cmp
    }
  }

  // All compared elements are equal
  // Shorter key comes first (prefix ordering)
  return aArray.length - bArray.length
}

/**
 * Compare a key against a partial key (for range queries).
 * Returns how the full key compares to the partial key prefix.
 *
 * @param fullKey - The full key to compare
 * @param partialKey - The partial key (prefix) to compare against
 * @param directions - Array of directions
 * @returns Negative if fullKey < partialKey, positive if fullKey > partialKey, zero if fullKey starts with partialKey
 */
export function compareKeyToPartial(
  fullKey: SortKey,
  partialKey: SortKey,
  directions: SortDirection[],
): number {
  const fullArray = Array.isArray(fullKey) ? fullKey : [fullKey]
  const partialArray = Array.isArray(partialKey) ? partialKey : [partialKey]

  // Compare only up to the length of the partial key
  for (let i = 0; i < partialArray.length; i++) {
    if (i >= fullArray.length) {
      // Full key is shorter than partial key
      // The full key is a prefix, so it comes before
      return -1
    }
    const cmp = compareSingleKeys(fullArray[i] as SingleSortKey, partialArray[i] as SingleSortKey)
    if (cmp !== 0) {
      const dir = directions[i] ?? "asc"
      return dir === "desc" ? -cmp : cmp
    }
  }

  // Full key starts with partial key (or partial key is empty)
  return 0
}

/**
 * Extract the direction from a SingleSortKeySpec.
 * Defaults to "asc" if not specified.
 */
export function getSortDirection<I, K extends SingleSortKey>(
  spec: SingleSortKeySpec<I, K>,
): SortDirection {
  if (typeof spec === "function") {
    return "asc"
  }
  return spec.direction
}

/**
 * Extract the getter function from a SingleSortKeySpec.
 */
export function getSortKeyGetter<I, K extends SingleSortKey>(
  spec: SingleSortKeySpec<I, K>,
): (item: I) => K {
  if (typeof spec === "function") {
    return spec
  }
  return spec.get
}

/**
 * Extract the optional setter function from a SingleSortKeySpec.
 */
export function getSortKeySetter<I, K extends SingleSortKey>(
  spec: SingleSortKeySpec<I, K>,
): ((item: I, value: K) => void) | null {
  if (typeof spec === "function") {
    return null
  }
  return spec.set ?? null
}

/**
 * Check if a spec is a compound sort key spec (array of specs).
 */
export function isCompoundSortKeySpec<I>(
  spec: SingleSortKeySpec<I, SingleSortKey> | readonly SingleSortKeySpec<I, SingleSortKey>[],
): spec is readonly SingleSortKeySpec<I, SingleSortKey>[] {
  return Array.isArray(spec)
}

/**
 * Parsed sort key configuration for efficient comparison.
 */
export interface ParsedSortKey<I> {
  /** Function to extract the full key from an item */
  getKey: (item: I) => SortKey
  /** Array of directions, one per key element */
  directions: SortDirection[]
  /** Optional setter for the key (only for single keys) */
  setKey: ((item: I, value: SortKey) => void) | null
}

/**
 * Parse a sort key spec into a configuration object.
 */
export function parseSortKeySpec<I, K extends SingleSortKey>(
  spec: SingleSortKeySpec<I, K> | readonly SingleSortKeySpec<I, SingleSortKey>[],
): ParsedSortKey<I> {
  if (Array.isArray(spec)) {
    // Compound key
    const compoundSpec = spec as readonly SingleSortKeySpec<I, SingleSortKey>[]
    const getters = compoundSpec.map((s) => getSortKeyGetter(s))
    const directions = compoundSpec.map((s) => getSortDirection(s))

    return {
      getKey: (item: I) => getters.map((g) => g(item)) as SortKey,
      directions,
      setKey: null, // Compound keys don't support setters
    }
  } else {
    // Single key
    const singleSpec = spec as SingleSortKeySpec<I, K>
    const getter = getSortKeyGetter(singleSpec)
    const direction = getSortDirection(singleSpec)
    const setter = getSortKeySetter(singleSpec)

    return {
      getKey: (item: I) => getter(item),
      directions: [direction],
      setKey: setter ? (item: I, value: SortKey) => setter(item, value as K) : null,
    }
  }
}

/**
 * Create a comparator function for items based on a parsed sort key.
 */
export function createItemComparator<I>(parsed: ParsedSortKey<I>): (a: I, b: I) => number {
  return (a: I, b: I) => {
    const keyA = parsed.getKey(a)
    const keyB = parsed.getKey(b)
    return compareKeys(keyA, keyB, parsed.directions)
  }
}
