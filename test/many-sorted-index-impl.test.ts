import { describe, it } from "node:test"
import assert from "node:assert"
import { ManySortedIndexImpl } from "../src/many-sorted-index-impl.js"
import { SetIndexImpl } from "../src/set-index-impl.js"
import { KeyNotFoundError } from "../src/errors.js"

interface User {
  id: number
  name: string
  department: string
  age: number
}

describe("ManySortedIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey("Engineering"), false)
    })

    it("should add items and create subindexes in sorted key order", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Sales", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Marketing", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.count, 3)

      // Keys should be in sorted order
      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, ["Engineering", "Marketing", "Sales"])
    })

    it("should add multiple items to the same subindex", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      index.add(alice)
      index.add(bob)

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.get("Engineering").count, 2)
    })

    it("should get subindexes by key", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      index.add(alice)

      const engineering = index.get("Engineering")
      assert.strictEqual(engineering.count, 1)
      assert.strictEqual(engineering.has(alice), true)
    })

    it("should throw KeyNotFoundError when getting non-existent key", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      assert.throws(
        () => index.get("NonExistent"),
        (err: Error) => err instanceof KeyNotFoundError,
      )
    })

    it("should remove items", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      index.add(alice)
      index.add(bob)

      index.remove(alice)

      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.get("Engineering").count, 1)
    })

    it("should remove empty subindexes", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }

      index.add(alice)
      assert.strictEqual(index.hasKey("Engineering"), true)

      index.remove(alice)
      assert.strictEqual(index.hasKey("Engineering"), false)
    })

    it("should clear all items and subindexes", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      index.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      index.add({ id: 2, name: "Bob", department: "Sales", age: 25 })

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.deepStrictEqual(Array.from(index.keys), [])
    })
  })

  describe("numeric keys", () => {
    it("should sort numeric keys correctly", () => {
      const index = new ManySortedIndexImpl<User, number, SetIndexImpl<User>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null),
      )

      index.add({ id: 1, name: "Alice", department: "Eng", age: 30 })
      index.add({ id: 2, name: "Bob", department: "Eng", age: 25 })
      index.add({ id: 3, name: "Carol", department: "Eng", age: 35 })

      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, [25, 30, 35])
    })
  })

  describe("descending order", () => {
    it("should sort in descending order", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: { direction: "desc", get: (u) => u.department } },
        () => new SetIndexImpl<User>(null),
      )

      index.add({ id: 1, name: "Alice", department: "Sales", age: 30 })
      index.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })
      index.add({ id: 3, name: "Carol", department: "Marketing", age: 35 })

      const keys = Array.from(index.keys)
      assert.deepStrictEqual(keys, ["Sales", "Marketing", "Engineering"])
    })
  })

  describe("iteration", () => {
    it("should iterate over all items in sorted key order", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Sales", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Marketing", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const items = Array.from(index)
      assert.strictEqual(items.length, 3)

      // Items should be grouped by department in sorted order
      // Engineering comes first
      assert.strictEqual(items[0], bob)
    })
  })

  describe("SortedView", () => {
    it("should reverse iteration", () => {
      const index = new ManySortedIndexImpl<User, number, SetIndexImpl<User>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Eng", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Eng", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Eng", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const reversed = Array.from(index.reverse())
      assert.strictEqual(reversed[0], carol) // age: 35
      assert.strictEqual(reversed[1], alice) // age: 30
      assert.strictEqual(reversed[2], bob) // age: 25
    })

    it("should query with range", () => {
      const index = new ManySortedIndexImpl<User, number, SetIndexImpl<User>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null),
      )

      index.add({ id: 1, name: "Alice", department: "Eng", age: 20 })
      index.add({ id: 2, name: "Bob", department: "Eng", age: 25 })
      index.add({ id: 3, name: "Carol", department: "Eng", age: 30 })
      index.add({ id: 4, name: "Dave", department: "Eng", age: 35 })
      index.add({ id: 5, name: "Eve", department: "Eng", age: 40 })

      const result = Array.from(index.query({ ge: 25, le: 35 }))
      const ages = result.map((u) => u.age)
      assert.deepStrictEqual(ages, [25, 30, 35])
    })
  })

  describe("with filter", () => {
    it("should only include items that pass the filter", () => {
      const index = new ManySortedIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        {
          key: (u) => u.department,
          filter: (u) => u.age >= 30,
        },
        () => new SetIndexImpl<User>(null),
      )

      index.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      index.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })
      index.add({ id: 3, name: "Carol", department: "Sales", age: 35 })

      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.get("Engineering").count, 1)
      assert.strictEqual(index.get("Sales").count, 1)
    })
  })
})
