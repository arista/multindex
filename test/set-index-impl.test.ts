import { describe, it } from "node:test"
import assert from "node:assert"
import { SetIndexImpl } from "../src/set-index-impl.js"
import { ArraySetIndexImpl } from "../src/array-set-index-impl.js"

describe("SetIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new SetIndexImpl<number>(null)
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.has(1), false)
    })

    it("should add items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      assert.strictEqual(index.count, 3)
      assert.strictEqual(index.has(1), true)
      assert.strictEqual(index.has(2), true)
      assert.strictEqual(index.has(3), true)
      assert.strictEqual(index.has(4), false)
    })

    it("should not duplicate items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)
      index.add(1)
      index.add(1)

      assert.strictEqual(index.count, 1)
    })

    it("should remove items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      index.remove(2)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.has(1), true)
      assert.strictEqual(index.has(2), false)
      assert.strictEqual(index.has(3), true)
    })

    it("should handle removing non-existent items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)

      const result = index.remove(999)

      assert.strictEqual(result.countChange, 0)
      assert.strictEqual(index.count, 1)
    })

    it("should iterate over items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      const items = Array.from(index)
      assert.strictEqual(items.length, 3)
      assert.ok(items.includes(1))
      assert.ok(items.includes(2))
      assert.ok(items.includes(3))
    })

    it("should clear all items", () => {
      const index = new SetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.has(1), false)
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new SetIndexImpl<number>(null, {
        filter: (n) => n % 2 === 0, // Only even numbers
      })

      index.add(1)
      index.add(2)
      index.add(3)
      index.add(4)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.has(1), false)
      assert.strictEqual(index.has(2), true)
      assert.strictEqual(index.has(3), false)
      assert.strictEqual(index.has(4), true)
    })

    it("should only iterate over included items", () => {
      const index = new SetIndexImpl<number>(null, {
        filter: (n) => n > 2,
      })

      index.add(1)
      index.add(2)
      index.add(3)
      index.add(4)

      const items = Array.from(index)
      assert.deepStrictEqual(items.sort(), [3, 4])
    })
  })

  describe("with objects", () => {
    it("should work with object references", () => {
      interface Item {
        id: number
      }
      const index = new SetIndexImpl<Item>(null)

      const a = { id: 1 }
      const b = { id: 2 }
      const c = { id: 1 } // Same id but different object

      index.add(a)
      index.add(b)

      assert.strictEqual(index.has(a), true)
      assert.strictEqual(index.has(b), true)
      assert.strictEqual(index.has(c), false) // Different reference
    })
  })
})

describe("ArraySetIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new ArraySetIndexImpl<number>(null)
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.has(1), false)
    })

    it("should add items", () => {
      const index = new ArraySetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      assert.strictEqual(index.count, 3)
      assert.strictEqual(index.has(1), true)
      assert.strictEqual(index.has(2), true)
      assert.strictEqual(index.has(3), true)
    })

    it("should maintain insertion order", () => {
      const index = new ArraySetIndexImpl<number>(null)
      index.add(3)
      index.add(1)
      index.add(2)

      const items = Array.from(index)
      assert.deepStrictEqual(items, [3, 1, 2])
    })

    it("should not duplicate items", () => {
      const index = new ArraySetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(1) // Duplicate

      assert.strictEqual(index.count, 2)
      const items = Array.from(index)
      assert.deepStrictEqual(items, [1, 2])
    })

    it("should remove items", () => {
      const index = new ArraySetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      index.remove(2)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.has(1), true)
      assert.strictEqual(index.has(2), false)
      assert.strictEqual(index.has(3), true)
    })

    it("should clear all items", () => {
      const index = new ArraySetIndexImpl<number>(null)
      index.add(1)
      index.add(2)
      index.add(3)

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.has(1), false)
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new ArraySetIndexImpl<number>(null, {
        filter: (n) => n % 2 === 0,
      })

      index.add(1)
      index.add(2)
      index.add(3)
      index.add(4)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.has(2), true)
      assert.strictEqual(index.has(4), true)
    })

    it("should maintain insertion order for included items", () => {
      const index = new ArraySetIndexImpl<number>(null, {
        filter: (n) => n % 2 === 0,
      })

      index.add(1)
      index.add(4)
      index.add(3)
      index.add(2)

      const items = Array.from(index)
      assert.deepStrictEqual(items, [4, 2])
    })
  })
})
