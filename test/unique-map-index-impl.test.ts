import { describe, it } from "node:test"
import assert from "node:assert"
import { UniqueMapIndexImpl } from "../src/unique-map-index-impl.js"
import { UniquenessViolationError, KeyNotFoundError } from "../src/errors.js"

interface User {
  id: number
  name: string
  age: number
}

describe("UniqueMapIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey(1), false)
    })

    it("should add items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.hasKey(1), true)
      assert.strictEqual(index.hasKey(2), true)
      assert.strictEqual(index.hasKey(3), false)
    })

    it("should get items by key", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.get(1), alice)
      assert.strictEqual(index.get(2), bob)
    })

    it("should tryGet items by key", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      index.add(alice)

      assert.strictEqual(index.tryGet(1), alice)
      assert.strictEqual(index.tryGet(999), null)
    })

    it("should throw KeyNotFoundError when getting non-existent key", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      assert.throws(
        () => index.get(999),
        (err: Error) => err instanceof KeyNotFoundError && err.key === 999,
      )
    })

    it("should throw UniquenessViolationError on duplicate key", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 1, name: "Bob", age: 25 } // Same id!

      index.add(alice)

      assert.throws(
        () => index.add(bob),
        (err: Error) => err instanceof UniquenessViolationError && err.key === 1,
      )
    })

    it("should not add duplicate items (same reference)", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }

      index.add(alice)
      index.add(alice) // Same reference, should be no-op

      assert.strictEqual(index.count, 1)
    })

    it("should remove items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      const result = index.remove(alice)

      assert.strictEqual(result.countChange, -1)
      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.hasKey(1), false)
      assert.strictEqual(index.hasKey(2), true)
    })

    it("should handle removing non-existent items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)

      const result = index.remove(bob) // Never added

      assert.strictEqual(result.countChange, 0)
      assert.strictEqual(index.count, 1)
    })

    it("should check if item is in index with has()", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)

      assert.strictEqual(index.has(alice), true)
      assert.strictEqual(index.has(bob), false)
    })

    it("should clear all items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey(1), false)
      assert.strictEqual(index.hasKey(2), false)
    })
  })

  describe("iteration", () => {
    it("should iterate over items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      const items = Array.from(index)
      assert.strictEqual(items.length, 2)
      assert.ok(items.includes(alice))
      assert.ok(items.includes(bob))
    })

    it("should iterate over keys", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      const keys = Array.from(index.keys)
      assert.strictEqual(keys.length, 2)
      assert.ok(keys.includes(1))
      assert.ok(keys.includes(2))
    })

    it("should iterate over items via items property", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      const items = Array.from(index.items)
      assert.strictEqual(items.length, 2)
      assert.ok(items.includes(alice))
      assert.ok(items.includes(bob))
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
        filter: (u) => u.age >= 30,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }
      const carol = { id: 3, name: "Carol", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.hasKey(1), true)
      assert.strictEqual(index.hasKey(2), false)
      assert.strictEqual(index.hasKey(3), true)
    })

    it("should iterate only over included items", () => {
      const index = new UniqueMapIndexImpl<User, number>(null, {
        key: (u) => u.id,
        filter: (u) => u.age >= 30,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }
      const carol = { id: 3, name: "Carol", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const items = Array.from(index)
      assert.strictEqual(items.length, 2)
      assert.ok(items.includes(alice))
      assert.ok(items.includes(carol))
      assert.ok(!items.includes(bob))
    })
  })

  describe("with different key types", () => {
    it("should work with string keys", () => {
      const index = new UniqueMapIndexImpl<User, string>(null, {
        key: (u) => u.name,
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.get("Alice"), alice)
      assert.strictEqual(index.get("Bob"), bob)
      assert.strictEqual(index.hasKey("Alice"), true)
      assert.strictEqual(index.hasKey("Carol"), false)
    })

    it("should work with compound keys (using object key spec)", () => {
      const index = new UniqueMapIndexImpl<User, string>(null, {
        key: {
          get: (u) => `${u.name}-${u.age}`,
        },
      })

      const alice = { id: 1, name: "Alice", age: 30 }
      const bob = { id: 2, name: "Bob", age: 25 }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.get("Alice-30"), alice)
      assert.strictEqual(index.get("Bob-25"), bob)
    })
  })
})
