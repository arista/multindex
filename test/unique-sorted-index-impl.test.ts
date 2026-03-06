import { describe, it } from "node:test"
import assert from "node:assert"
import { UniqueSortedIndexImpl } from "../src/unique-sorted-index-impl.js"
import { UniquenessViolationError, KeyNotFoundError } from "../src/errors.js"

interface User {
  id: number
  name: string
  age: number
  createdAt: Date
}

describe("UniqueSortedIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey(1), false)
    })

    it("should add items in sorted order", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 3, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 1, name: "Bob", age: 25, createdAt: new Date() }
      const carol = { id: 2, name: "Carol", age: 35, createdAt: new Date() }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const items = Array.from(index)
      assert.strictEqual(items.length, 3)
      assert.strictEqual(items[0], bob) // id: 1
      assert.strictEqual(items[1], carol) // id: 2
      assert.strictEqual(items[2], alice) // id: 3
    })

    it("should get items by key", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date() }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.get(1), alice)
      assert.strictEqual(index.get(2), bob)
    })

    it("should throw UniquenessViolationError on duplicate key", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 1, name: "Bob", age: 25, createdAt: new Date() }

      index.add(alice)

      assert.throws(
        () => index.add(bob),
        (err: Error) => err instanceof UniquenessViolationError,
      )
    })

    it("should throw KeyNotFoundError when getting non-existent key", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      assert.throws(
        () => index.get(999),
        (err: Error) => err instanceof KeyNotFoundError,
      )
    })

    it("should remove items", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date() }
      const carol = { id: 3, name: "Carol", age: 35, createdAt: new Date() }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      index.remove(bob)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.hasKey(2), false)

      const items = Array.from(index)
      assert.deepStrictEqual(items, [alice, carol])
    })

    it("should clear all items", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.deepStrictEqual(Array.from(index), [])
    })
  })

  describe("descending order", () => {
    it("should sort in descending order", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: { direction: "desc", get: (u) => u.id },
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date() }
      const carol = { id: 3, name: "Carol", age: 35, createdAt: new Date() }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const items = Array.from(index)
      assert.strictEqual(items[0], carol) // id: 3
      assert.strictEqual(items[1], bob) // id: 2
      assert.strictEqual(items[2], alice) // id: 1
    })
  })

  describe("string keys", () => {
    it("should sort strings lexicographically", () => {
      const index = new UniqueSortedIndexImpl<User, string>(null, {
        key: (u) => u.name,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date() }
      const carol = { id: 3, name: "Carol", age: 35, createdAt: new Date() }

      index.add(carol)
      index.add(alice)
      index.add(bob)

      const names = Array.from(index).map((u) => u.name)
      assert.deepStrictEqual(names, ["Alice", "Bob", "Carol"])
    })
  })

  describe("Date keys", () => {
    it("should sort Dates by timestamp", () => {
      const index = new UniqueSortedIndexImpl<User, Date>(null, {
        key: (u) => u.createdAt,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date("2020-01-01") }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date("2019-01-01") }
      const carol = { id: 3, name: "Carol", age: 35, createdAt: new Date("2021-01-01") }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const names = Array.from(index).map((u) => u.name)
      assert.deepStrictEqual(names, ["Bob", "Alice", "Carol"])
    })
  })

  describe("iteration", () => {
    it("should iterate keys in sorted order", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 3, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 1, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 2, name: "Carol", age: 35, createdAt: new Date() })

      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, [1, 2, 3])
    })
  })

  describe("SortedView", () => {
    it("should reverse iteration", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, createdAt: new Date() }
      const bob = { id: 2, name: "Bob", age: 25, createdAt: new Date() }
      const carol = { id: 3, name: "Carol", age: 35, createdAt: new Date() }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const reversed = Array.from(index.reverse())
      assert.deepStrictEqual(reversed, [carol, bob, alice])
    })

    it("should query with gt (greater than)", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })
      index.add({ id: 4, name: "Dave", age: 28, createdAt: new Date() })

      const result = Array.from(index.query({ gt: 2 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [3, 4])
    })

    it("should query with ge (greater than or equal)", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })

      const result = Array.from(index.query({ ge: 2 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [2, 3])
    })

    it("should query with lt (less than)", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })

      const result = Array.from(index.query({ lt: 3 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [1, 2])
    })

    it("should query with le (less than or equal)", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })

      const result = Array.from(index.query({ le: 2 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [1, 2])
    })

    it("should query with range (ge and le)", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })
      index.add({ id: 4, name: "Dave", age: 28, createdAt: new Date() })
      index.add({ id: 5, name: "Eve", age: 32, createdAt: new Date() })

      const result = Array.from(index.query({ ge: 2, le: 4 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [2, 3, 4])
    })

    it("should chain queries", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })
      index.add({ id: 4, name: "Dave", age: 28, createdAt: new Date() })
      index.add({ id: 5, name: "Eve", age: 32, createdAt: new Date() })

      const result = Array.from(index.query({ ge: 2 }).query({ le: 4 }))
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [2, 3, 4])
    })

    it("should chain reverse and query", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })
      index.add({ id: 4, name: "Dave", age: 28, createdAt: new Date() })

      const result = Array.from(index.query({ ge: 2, le: 3 }).reverse())
      const ids = result.map((u) => u.id)
      assert.deepStrictEqual(ids, [3, 2])
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new UniqueSortedIndexImpl<User, number>(null, {
        key: (u) => u.id,
        filter: (u) => u.age >= 30,
      })

      index.add({ id: 1, name: "Alice", age: 30, createdAt: new Date() })
      index.add({ id: 2, name: "Bob", age: 25, createdAt: new Date() })
      index.add({ id: 3, name: "Carol", age: 35, createdAt: new Date() })

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.hasKey(1), true)
      assert.strictEqual(index.hasKey(2), false)
      assert.strictEqual(index.hasKey(3), true)
    })
  })
})
