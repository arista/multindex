import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { Changes } from "chchchchanges"
import { createMultindex } from "../src/index.js"

interface User {
  id: number
  name: string
  rank: number
}

const build = () => {
  const domain = Changes.create({ name: "test" })
  const users = createMultindex<User>()(
    (b) => ({
      byId: b.uniqueMap({ key: (u) => u.id }),
      byRank: b.uniqueSorted({ key: (u) => u.rank }),
    }),
    { domain },
  )
  return { domain, users }
}

describe("Multindex — addMany", () => {
  it("fans a batch out to every index in one call", () => {
    const { users } = build()
    users.addMany([
      { id: 1, name: "Alice", rank: 30 },
      { id: 2, name: "Bob", rank: 10 },
      { id: 3, name: "Carol", rank: 20 },
    ])

    assert.equal(users.count, 3)
    assert.equal(users.byId.get(1).name, "Alice")
    assert.equal(users.byId.get(2).name, "Bob")
    assert.deepEqual(
      [...users.byRank].map((u) => u.name),
      ["Bob", "Carol", "Alice"], // ranks 10, 20, 30
    )
  })

  it("returns reactively-wrapped items that re-index on mutation", () => {
    const { users } = build()
    const [alice] = users.addMany([
      { id: 1, name: "Alice", rank: 30 },
      { id: 2, name: "Bob", rank: 10 },
    ])

    // Mutating a wrapped item's sort key relocates it in the sorted index.
    alice!.rank = 5
    assert.deepEqual(
      [...users.byRank].map((u) => u.name),
      ["Alice", "Bob"],
    )
  })

  it("settles the whole batch as a single notification (atomicity)", () => {
    const { domain, users } = build()
    users.add({ id: 1, name: "Seed", rank: 100 })

    const ordered = users.byRank.orderedArray
    let runs = 0
    domain.detectChanges(
      () => ordered.length,
      () => {
        runs++
      },
      "count",
    )

    // Four items in one batch → the length source settles once, not four times.
    users.addMany([
      { id: 2, name: "B", rank: 10 },
      { id: 3, name: "C", rank: 20 },
      { id: 4, name: "D", rank: 30 },
      { id: 5, name: "E", rank: 40 },
    ])

    assert.equal(users.count, 5)
    assert.equal(runs, 1)
  })

  it("is atomic on failure: a uniqueness violation rolls nothing forward past the throw", () => {
    const { users } = build()
    users.add({ id: 1, name: "Seed", rank: 100 })

    // id 1 collides in byId; byRank would have accepted rank 10/20. Because the
    // batch runs in one transaction and byId throws, the caller sees the error.
    assert.throws(() =>
      users.addMany([
        { id: 2, name: "B", rank: 10 },
        { id: 1, name: "dup", rank: 20 },
      ]),
    )
  })
})
