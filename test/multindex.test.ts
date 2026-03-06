import { describe, it } from "node:test"
import assert from "node:assert"
import { Changes } from "chchchchanges"
import { createMultindex } from "../src/index.js"

interface User {
  id: number
  name: string
  department: string
  age: number
}

describe("createMultindex", () => {
  describe("basic operations", () => {
    it("should create an empty multindex", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
      }))

      assert.strictEqual(users.count, 0)
    })

    it("should add items to the multindex and all indexes", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
        byDepartment: b.manyMap({
          key: (u) => u.department,
          subindex: (b) => b.set(),
        }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      users.add(alice)
      users.add(bob)
      users.add(carol)

      assert.strictEqual(users.count, 3)
      assert.strictEqual(users.byId.get(1), alice)
      assert.strictEqual(users.byId.get(2), bob)
      assert.strictEqual(users.byId.get(3), carol)
      assert.strictEqual(users.byDepartment.get("Engineering").count, 2)
      assert.strictEqual(users.byDepartment.get("Sales").count, 1)
    })

    it("should check if an item is in the multindex", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      users.add(alice)

      assert.strictEqual(users.has(alice), true)
      assert.strictEqual(users.has(bob), false)
    })

    it("should remove items from the multindex and all indexes", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
        byDepartment: b.manyMap({
          key: (u) => u.department,
          subindex: (b) => b.set(),
        }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      users.add(alice)
      users.add(bob)

      users.remove(alice)

      assert.strictEqual(users.count, 1)
      assert.strictEqual(users.has(alice), false)
      assert.strictEqual(users.byId.hasKey(1), false)
      assert.strictEqual(users.byId.hasKey(2), true)
      assert.strictEqual(users.byDepartment.get("Engineering").count, 1)
    })

    it("should iterate over all items", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      users.add(alice)
      users.add(bob)

      const items = Array.from(users)
      assert.strictEqual(items.length, 2)
      assert.ok(items.includes(alice))
      assert.ok(items.includes(bob))
    })
  })

  describe("index types", () => {
    it("should work with set indexes", () => {
      const users = createMultindex<User>()((b) => ({
        all: b.set(),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      users.add(alice)

      assert.strictEqual(users.all.count, 1)
      assert.strictEqual(users.all.has(alice), true)
    })

    it("should work with arraySet indexes", () => {
      const users = createMultindex<User>()((b) => ({
        all: b.arraySet(),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      users.add(alice)
      users.add(bob)

      // ArraySet maintains insertion order
      const items = Array.from(users.all)
      assert.strictEqual(items[0], alice)
      assert.strictEqual(items[1], bob)
    })

    it("should work with uniqueSorted indexes", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueSorted({ key: (u) => u.id }),
      }))

      const alice = { id: 3, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 1, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 2, name: "Carol", department: "Sales", age: 35 }

      users.add(alice)
      users.add(bob)
      users.add(carol)

      // Items should be in sorted order by id
      const items = Array.from(users.byId)
      assert.strictEqual(items[0], bob) // id: 1
      assert.strictEqual(items[1], carol) // id: 2
      assert.strictEqual(items[2], alice) // id: 3
    })

    it("should work with manySorted indexes", () => {
      const users = createMultindex<User>()((b) => ({
        byAge: b.manySorted({
          key: (u) => u.age,
          subindex: (b) => b.set(),
        }),
      }))

      users.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      users.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })
      users.add({ id: 3, name: "Carol", department: "Sales", age: 30 })

      // Keys should be in sorted order
      const ages = Array.from(users.byAge.keys)
      assert.deepStrictEqual(ages, [25, 30])

      assert.strictEqual(users.byAge.get(30).count, 2)
      assert.strictEqual(users.byAge.get(25).count, 1)
    })
  })

  describe("builder helpers", () => {
    it("should use key helper for map key specs", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: b.key((u) => u.id) }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      users.add(alice)

      assert.strictEqual(users.byId.get(1), alice)
    })

    it("should use asc helper for ascending sort keys", () => {
      const users = createMultindex<User>()((b) => ({
        byAge: b.uniqueSorted({ key: b.asc((u) => u.age) }),
      }))

      users.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      users.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })

      const items = Array.from(users.byAge)
      assert.strictEqual(items[0]!.age, 25) // ascending
      assert.strictEqual(items[1]!.age, 30)
    })

    it("should use desc helper for descending sort keys", () => {
      const users = createMultindex<User>()((b) => ({
        byAge: b.uniqueSorted({ key: b.desc((u) => u.age) }),
      }))

      users.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      users.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })

      const items = Array.from(users.byAge)
      assert.strictEqual(items[0]!.age, 30) // descending
      assert.strictEqual(items[1]!.age, 25)
    })

    it("should use filter helper", () => {
      const users = createMultindex<User>()((b) => ({
        seniors: b.set({ filter: b.filter((u) => u.age >= 30) }),
      }))

      users.add({ id: 1, name: "Alice", department: "Engineering", age: 30 })
      users.add({ id: 2, name: "Bob", department: "Engineering", age: 25 })
      users.add({ id: 3, name: "Carol", department: "Sales", age: 35 })

      assert.strictEqual(users.seniors.count, 2)
    })
  })

  describe("nested multindex", () => {
    it("should create nested multindexes with mult", () => {
      const users = createMultindex<User>()((b) => ({
        byDepartment: b.manyMap({
          key: (u) => u.department,
          subindex: (b) =>
            b.mult((b) => ({
              byAge: b.uniqueSorted({ key: (u) => u.age }),
            })),
        }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      users.add(alice)
      users.add(bob)

      const engineering = users.byDepartment.get("Engineering")
      assert.strictEqual(engineering.count, 2)

      // Access the nested byAge index
      const byAge = engineering.byAge
      assert.strictEqual(byAge.count, 2)

      // Items should be sorted by age
      const items = Array.from(byAge)
      assert.strictEqual(items[0], bob) // age: 25
      assert.strictEqual(items[1], alice) // age: 30
    })
  })

  describe("complex scenarios", () => {
    it("should support multiple indexes of different types", () => {
      const users = createMultindex<User>()((b) => ({
        byId: b.uniqueMap({ key: (u) => u.id }),
        byName: b.uniqueMap({ key: (u) => u.name }),
        byDepartment: b.manyMap({
          key: (u) => u.department,
          subindex: (b) => b.set(),
        }),
        byAge: b.uniqueSorted({ key: (u) => u.age }),
        seniors: b.set({ filter: (u) => u.age >= 30 }),
      }))

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }
      const carol = { id: 3, name: "Carol", department: "Sales", age: 35 }

      users.add(alice)
      users.add(bob)
      users.add(carol)

      // All indexes should work
      assert.strictEqual(users.byId.get(1), alice)
      assert.strictEqual(users.byName.get("Bob"), bob)
      assert.strictEqual(users.byDepartment.get("Engineering").count, 2)
      assert.strictEqual(users.seniors.count, 2)

      // byAge should be sorted
      const byAgeItems = Array.from(users.byAge)
      assert.strictEqual(byAgeItems[0], bob) // 25
      assert.strictEqual(byAgeItems[1], alice) // 30
      assert.strictEqual(byAgeItems[2], carol) // 35

      // Remove should work across all indexes
      users.remove(alice)
      assert.strictEqual(users.count, 2)
      assert.strictEqual(users.byId.hasKey(1), false)
      assert.strictEqual(users.byName.hasKey("Alice"), false)
      assert.strictEqual(users.byDepartment.get("Engineering").count, 1)
      assert.strictEqual(users.seniors.count, 1) // only Carol now
    })
  })

  describe("reactivity", () => {
    it("should return a reactive proxy from add() when domain is provided", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          byId: b.uniqueMap({ key: (u) => u.id }),
        }),
        { domain },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const trackedAlice = users.add(alice)

      // The returned item should be a proxy (different reference)
      assert.notStrictEqual(trackedAlice, alice)
      // But should have the same values
      assert.strictEqual(trackedAlice.id, 1)
      assert.strictEqual(trackedAlice.name, "Alice")
    })

    it("should automatically re-index when a map key changes", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          byDepartment: b.manyMap({
            key: (u) => u.department,
            subindex: (b) => b.set(),
          }),
        }),
        { domain },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const trackedAlice = users.add(alice)

      assert.strictEqual(users.byDepartment.get("Engineering").count, 1)
      assert.strictEqual(users.byDepartment.hasKey("Sales"), false)

      // Change the department - should trigger re-indexing
      trackedAlice.department = "Sales"

      assert.strictEqual(users.byDepartment.get("Sales").count, 1)
      assert.strictEqual(users.byDepartment.hasKey("Engineering"), false)
    })

    it("should automatically re-index when a sorted key changes", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          byAge: b.uniqueSorted({ key: (u) => u.age }),
        }),
        { domain },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const bob = { id: 2, name: "Bob", department: "Engineering", age: 25 }

      const trackedAlice = users.add(alice)
      users.add(bob)

      // Initially: bob (25), alice (30)
      let items = Array.from(users.byAge)
      assert.strictEqual(items[0]!.name, "Bob")
      assert.strictEqual(items[1]!.name, "Alice")

      // Change Alice's age to be younger than Bob
      trackedAlice.age = 20

      // Now: alice (20), bob (25)
      items = Array.from(users.byAge)
      assert.strictEqual(items[0]!.name, "Alice")
      assert.strictEqual(items[1]!.name, "Bob")
    })

    it("should automatically re-index when a filter condition changes", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          seniors: b.set({ filter: (u) => u.age >= 30 }),
        }),
        { domain },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 25 }
      const trackedAlice = users.add(alice)

      // Alice is not a senior (age 25)
      assert.strictEqual(users.seniors.count, 0)

      // Change Alice's age to make her a senior
      trackedAlice.age = 30

      // Now Alice should be in seniors
      assert.strictEqual(users.seniors.count, 1)
      assert.strictEqual(users.seniors.has(trackedAlice), true)
    })

    it("should not re-index when reactive is false", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          byDepartment: b.manyMap({
            key: (u) => u.department,
            subindex: (b) => b.set(),
          }),
        }),
        { domain, reactive: false },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const returnedAlice = users.add(alice)

      // With reactive: false, the original item is returned (not wrapped)
      assert.strictEqual(returnedAlice, alice)

      assert.strictEqual(users.byDepartment.get("Engineering").count, 1)

      // Change the department - should NOT trigger re-indexing
      alice.department = "Sales"

      // Still in Engineering (no automatic re-indexing)
      assert.strictEqual(users.byDepartment.get("Engineering").count, 1)
      assert.strictEqual(users.byDepartment.hasKey("Sales"), false)
    })

    it("should work with has() and remove() using the tracked item", () => {
      const domain = Changes.create()
      const users = createMultindex<User>()(
        (b) => ({
          byId: b.uniqueMap({ key: (u) => u.id }),
        }),
        { domain },
      )

      const alice = { id: 1, name: "Alice", department: "Engineering", age: 30 }
      const trackedAlice = users.add(alice)

      assert.strictEqual(users.has(trackedAlice), true)
      assert.strictEqual(users.count, 1)

      users.remove(trackedAlice)

      assert.strictEqual(users.has(trackedAlice), false)
      assert.strictEqual(users.count, 0)
      assert.strictEqual(users.byId.hasKey(1), false)
    })
  })
})
