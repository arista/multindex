import { describe, it } from "node:test"
import assert from "node:assert"
import { UniqueBTreeIndexImpl } from "../src/unique-btree-index-impl.js"
import { ManyBTreeIndexImpl } from "../src/many-btree-index-impl.js"
import { SetIndexImpl } from "../src/set-index-impl.js"

interface User {
  id: number
  name: string
  age: number
  department: string
}

describe("UniqueBTreeIndexImpl", () => {
  describe("basic operations", () => {
    it("should add and retrieve items", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      const bob = { id: 2, name: "Bob", age: 25, department: "Sales" }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.get(1), alice)
      assert.strictEqual(index.get(2), bob)
    })

    it("should maintain sorted order", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      // Add in non-sorted order
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })

      const items = Array.from(index)
      assert.strictEqual(items[0]!.id, 1)
      assert.strictEqual(items[1]!.id, 2)
      assert.strictEqual(items[2]!.id, 3)
    })

    it("should support descending order", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: { direction: "desc", get: (u) => u.age },
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })

      const items = Array.from(index)
      assert.strictEqual(items[0]!.age, 35) // Carol
      assert.strictEqual(items[1]!.age, 30) // Alice
      assert.strictEqual(items[2]!.age, 25) // Bob
    })

    it("should remove items", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      const bob = { id: 2, name: "Bob", age: 25, department: "Sales" }

      index.add(alice)
      index.add(bob)
      index.remove(alice)

      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.hasKey(1), false)
      assert.strictEqual(index.hasKey(2), true)
    })

    it("should support has and hasKey", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      const bob = { id: 2, name: "Bob", age: 25, department: "Sales" }

      index.add(alice)

      assert.strictEqual(index.has(alice), true)
      assert.strictEqual(index.has(bob), false)
      assert.strictEqual(index.hasKey(1), true)
      assert.strictEqual(index.hasKey(2), false)
    })

    it("should support tryGet", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      index.add(alice)

      assert.strictEqual(index.tryGet(1), alice)
      assert.strictEqual(index.tryGet(999), null)
    })
  })

  describe("SortedView", () => {
    it("should support reverse iteration", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })

      const reversed = Array.from(index.reverse())
      assert.strictEqual(reversed[0]!.id, 3)
      assert.strictEqual(reversed[1]!.id, 2)
      assert.strictEqual(reversed[2]!.id, 1)
    })

    it("should support range queries", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 4, name: "Dave", age: 28, department: "Engineering" })
      index.add({ id: 5, name: "Eve", age: 32, department: "Sales" })

      // ge: 2, le: 4 should return ids 2, 3, 4
      const range = Array.from(index.query({ ge: 2, le: 4 }))
      assert.strictEqual(range.length, 3)
      assert.strictEqual(range[0]!.id, 2)
      assert.strictEqual(range[1]!.id, 3)
      assert.strictEqual(range[2]!.id, 4)
    })

    it("should support gt/lt queries (exclusive bounds)", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 4, name: "Dave", age: 28, department: "Engineering" })

      // gt: 1, lt: 4 should return ids 2, 3 (exclusive)
      const range = Array.from(index.query({ gt: 1, lt: 4 }))
      assert.strictEqual(range.length, 2)
      assert.strictEqual(range[0]!.id, 2)
      assert.strictEqual(range[1]!.id, 3)
    })

    it("should chain reverse and query", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 4, name: "Dave", age: 28, department: "Engineering" })

      const range = Array.from(index.query({ ge: 2, le: 4 }).reverse())
      assert.strictEqual(range.length, 3)
      assert.strictEqual(range[0]!.id, 4)
      assert.strictEqual(range[1]!.id, 3)
      assert.strictEqual(range[2]!.id, 2)
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new UniqueBTreeIndexImpl<User, number>(null, {
        key: (u) => u.id,
        filter: (u) => u.age >= 30,
      })

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })

      assert.strictEqual(index.count, 2) // Alice and Carol
      assert.strictEqual(index.hasKey(1), true)
      assert.strictEqual(index.hasKey(2), false) // Bob filtered out
      assert.strictEqual(index.hasKey(3), true)
    })
  })
})

describe("ManyBTreeIndexImpl", () => {
  describe("basic operations", () => {
    it("should add items to subindexes", () => {
      const index = new ManyBTreeIndexImpl<User, string, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null, {}),
      )

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      const bob = { id: 2, name: "Bob", age: 25, department: "Engineering" }
      const carol = { id: 3, name: "Carol", age: 35, department: "Sales" }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.count, 3)
      assert.strictEqual(index.get("Engineering").count, 2)
      assert.strictEqual(index.get("Sales").count, 1)
    })

    it("should maintain sorted key order", () => {
      const index = new ManyBTreeIndexImpl<User, number, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null, {}),
      )

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 4, name: "Dave", age: 30, department: "Engineering" })

      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, [25, 30, 35])
    })

    it("should remove items from subindexes", () => {
      const index = new ManyBTreeIndexImpl<User, string, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null, {}),
      )

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      const bob = { id: 2, name: "Bob", age: 25, department: "Engineering" }

      index.add(alice)
      index.add(bob)
      index.remove(alice)

      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.get("Engineering").count, 1)
    })

    it("should support hasKey and tryGet", () => {
      const index = new ManyBTreeIndexImpl<User, string, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null, {}),
      )

      const alice = { id: 1, name: "Alice", age: 30, department: "Engineering" }
      index.add(alice)

      assert.strictEqual(index.hasKey("Engineering"), true)
      assert.strictEqual(index.hasKey("Sales"), false)
      assert.notStrictEqual(index.tryGet("Engineering"), null)
      assert.strictEqual(index.tryGet("Sales"), null)
    })
  })

  describe("SortedView", () => {
    it("should support reverse iteration", () => {
      const index = new ManyBTreeIndexImpl<User, number, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null, {}),
      )

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })

      const reversed = Array.from(index.reverse())
      assert.strictEqual(reversed[0]!.age, 35)
      assert.strictEqual(reversed[1]!.age, 30)
      assert.strictEqual(reversed[2]!.age, 25)
    })

    it("should support range queries", () => {
      const index = new ManyBTreeIndexImpl<User, number, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null, {}),
      )

      index.add({ id: 1, name: "Alice", age: 25, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 30, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })
      index.add({ id: 4, name: "Dave", age: 40, department: "Engineering" })

      // ge: 30, le: 35 should return ages 30 and 35
      const range = Array.from(index.query({ ge: 30, le: 35 }))
      assert.strictEqual(range.length, 2)
      assert.strictEqual(range[0]!.age, 30)
      assert.strictEqual(range[1]!.age, 35)
    })
  })

  describe("descending order", () => {
    it("should support descending key order", () => {
      const index = new ManyBTreeIndexImpl<User, number, ReturnType<typeof SetIndexImpl<User>>>(
        null,
        { key: { direction: "desc", get: (u) => u.age } },
        () => new SetIndexImpl<User>(null, {}),
      )

      index.add({ id: 1, name: "Alice", age: 30, department: "Engineering" })
      index.add({ id: 2, name: "Bob", age: 25, department: "Sales" })
      index.add({ id: 3, name: "Carol", age: 35, department: "HR" })

      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, [35, 30, 25])
    })
  })
})
