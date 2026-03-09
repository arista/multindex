import { describe, it } from "node:test"
import assert from "node:assert"
import { ManyMapIndexImpl } from "../src/many-map-index-impl.js"
import { SetIndexImpl } from "../src/set-index-impl.js"

interface User {
  id: number
  name: string
  department: string
  age: number
}

describe("ManyMapIndexImpl", () => {
  describe("basic operations", () => {
    it("should start empty", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )
      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey("Engineering"), false)
    })

    it("should add items and create subindexes on demand", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.count, 3)
      assert.strictEqual(index.hasKey("Engineering"), true)
      assert.strictEqual(index.hasKey("Sales"), true)
      assert.strictEqual(index.hasKey("Marketing"), false)
    })

    it("should get subindexes by key", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const engineering = index.get("Engineering")
      assert.strictEqual(engineering.count, 2)
      assert.strictEqual(engineering.has(alice), true)
      assert.strictEqual(engineering.has(bob), true)
      assert.strictEqual(engineering.has(carol), false)

      const sales = index.get("Sales")
      assert.strictEqual(sales.count, 1)
      assert.strictEqual(sales.has(carol), true)
    })

    it("should tryGet subindexes by key", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      index.add(alice)

      assert.ok(index.tryGet("Engineering") !== null)
      assert.strictEqual(index.tryGet("Marketing"), null)
    })

    it("should create empty subindex when getting non-existent key", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      // Getting a non-existent key should create an empty subindex
      const subindex = index.get("NonExistent")
      assert.strictEqual(subindex.count, 0)

      // The key should now exist
      assert.ok(index.hasKey("NonExistent"))
    })

    it("should not add duplicate items (same reference)", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }

      index.add(alice)
      index.add(alice) // Same reference, should be no-op

      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.get("Engineering").count, 1)
    })

    it("should remove items", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      index.add(alice)
      index.add(bob)

      const result = index.remove(alice)

      assert.strictEqual(result.countChange, -1)
      assert.strictEqual(index.count, 1)
      assert.strictEqual(index.get("Engineering").count, 1)
      assert.strictEqual(index.get("Engineering").has(alice), false)
      assert.strictEqual(index.get("Engineering").has(bob), true)
    })

    it("should remove empty subindexes when last item is removed", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }

      index.add(alice)
      assert.strictEqual(index.hasKey("Engineering"), true)

      index.remove(alice)
      assert.strictEqual(index.hasKey("Engineering"), false)
      assert.strictEqual(index.count, 0)
    })

    it("should handle removing non-existent items", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      index.add(alice)

      const result = index.remove(bob) // Never added

      assert.strictEqual(result.countChange, 0)
      assert.strictEqual(index.count, 1)
    })

    it("should check if item is in index with has()", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      index.add(alice)

      assert.strictEqual(index.has(alice), true)
      assert.strictEqual(index.has(bob), false)
    })

    it("should clear all items and subindexes", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Sales", age: 25 }

      index.add(alice)
      index.add(bob)

      index.clear()

      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey("Engineering"), false)
      assert.strictEqual(index.hasKey("Sales"), false)
    })
  })

  describe("iteration", () => {
    it("should iterate over all items across subindexes", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      const items = Array.from(index)
      assert.strictEqual(items.length, 3)
      assert.ok(items.includes(alice))
      assert.ok(items.includes(bob))
      assert.ok(items.includes(carol))
    })

    it("should iterate over keys", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      index.add(alice)
      index.add(carol)

      const keys = Array.from(index.keys)
      assert.strictEqual(keys.length, 2)
      assert.ok(keys.includes("Engineering"))
      assert.ok(keys.includes("Sales"))
    })

    it("should iterate over items via items property", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Sales", age: 25 }

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
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        {
          key: (u) => u.department,
          filter: (u) => u.age >= 30,
        },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.count, 2)
      // Bob is excluded by the filter, so Engineering only has Alice
      assert.strictEqual(index.get("Engineering").count, 1)
      assert.strictEqual(index.get("Sales").count, 1)
    })

    it("should not create subindex for filtered-out items", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        {
          key: (u) => u.department,
          filter: (u) => u.age >= 30,
        },
        () => new SetIndexImpl<User>(null),
      )

      const bob = { id: 2, name: "Bob", department: "Marketing", age: 25 }

      index.add(bob) // Filtered out

      assert.strictEqual(index.count, 0)
      assert.strictEqual(index.hasKey("Marketing"), false)
    })
  })

  describe("count propagation", () => {
    it("should correctly track count across multiple subindexes", () => {
      const index = new ManyMapIndexImpl<User, string, SetIndexImpl<User>>(
        null,
        { key: (u) => u.department },
        () => new SetIndexImpl<User>(null),
      )

      const users = [
        { id: 1, name: "Alice", department: "Engineering", age: 30 },
        { id: 2, name: "Bob", department: "Engineering", age: 25 },
        { id: 3, name: "Carol", department: "Sales", age: 35 },
        { id: 4, name: "Dave", department: "Sales", age: 28 },
        { id: 5, name: "Eve", department: "Marketing", age: 32 },
      ]

      for (const user of users) {
        index.add(user)
      }

      assert.strictEqual(index.count, 5)
      assert.strictEqual(index.get("Engineering").count, 2)
      assert.strictEqual(index.get("Sales").count, 2)
      assert.strictEqual(index.get("Marketing").count, 1)

      // Remove some items
      index.remove(users[0]!) // Alice from Engineering
      assert.strictEqual(index.count, 4)
      assert.strictEqual(index.get("Engineering").count, 1)

      index.remove(users[2]!) // Carol from Sales
      index.remove(users[3]!) // Dave from Sales
      assert.strictEqual(index.count, 2)
      assert.strictEqual(index.hasKey("Sales"), false) // Empty, should be removed
    })
  })

  describe("with different key types", () => {
    it("should work with number keys", () => {
      const index = new ManyMapIndexImpl<User, number, SetIndexImpl<User>>(
        null,
        { key: (u) => u.age },
        () => new SetIndexImpl<User>(null),
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 30 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 25 }

      index.add(alice)
      index.add(bob)
      index.add(carol)

      assert.strictEqual(index.get(30).count, 2)
      assert.strictEqual(index.get(25).count, 1)
    })
  })
})
