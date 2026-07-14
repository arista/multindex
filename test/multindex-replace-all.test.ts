import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { Changes, type Change } from "chchchchanges"
import { createMultindex } from "../src/index.js"

interface Row {
  id: number
  name: string
  rank: number
}

const build = () => {
  const domain = Changes.create({ name: "test" })
  const rows = createMultindex<Row>()(
    (b) => ({
      byId: b.uniqueMap({ key: (r) => r.id }),
      byRank: b.uniqueSorted({ key: (r) => r.rank }),
    }),
    { domain },
  )
  return { domain, rows }
}

describe("Multindex — replaceAll", () => {
  it("swaps the whole dataset for a new one", () => {
    const { rows } = build()
    rows.addMany([
      { id: 1, name: "old-a", rank: 10 },
      { id: 2, name: "old-b", rank: 20 },
      { id: 3, name: "old-c", rank: 30 },
    ])

    rows.replaceAll([
      { id: 7, name: "new-x", rank: 5 },
      { id: 8, name: "new-y", rank: 15 },
    ])

    assert.equal(rows.count, 2)
    assert.equal(rows.byId.tryGet(1), null) // old ids gone
    assert.equal(rows.byId.tryGet(2), null)
    assert.equal(rows.byId.get(7).name, "new-x")
    assert.deepEqual(
      [...rows.byRank].map((r) => r.name),
      ["new-x", "new-y"],
    )
  })

  it("empties the collection when given an empty set", () => {
    const { rows } = build()
    rows.addMany([{ id: 1, name: "a", rank: 1 }])
    rows.replaceAll([])
    assert.equal(rows.count, 0)
    assert.deepEqual([...rows.byRank], [])
  })

  it("settles as one notification and never exposes the empty intermediate", () => {
    const { domain, rows } = build()
    rows.addMany([
      { id: 1, name: "a", rank: 10 },
      { id: 2, name: "b", rank: 20 },
    ])

    const ordered = rows.byRank.orderedArray
    const observed: number[] = []
    domain.detectChanges(
      () => ordered.length,
      () => {
        observed.push(ordered.length)
      },
      "len",
    )

    rows.replaceAll([
      { id: 3, name: "c", rank: 5 },
      { id: 4, name: "d", rank: 15 },
      { id: 5, name: "e", rank: 25 },
    ])

    // one settled notification, and it reads the final length — never 0
    assert.deepEqual(observed, [3])
    assert.equal(rows.count, 3)
  })

  it("returns reactively-wrapped items that re-index on mutation", () => {
    const { rows } = build()
    rows.addMany([{ id: 1, name: "old", rank: 10 }])
    const [x] = rows.replaceAll([
      { id: 2, name: "x", rank: 20 },
      { id: 3, name: "y", rank: 30 },
    ])
    x!.rank = 99
    assert.deepEqual(
      [...rows.byRank].map((r) => r.name),
      ["y", "x"],
    )
  })

  it("disposes old items' watches — a mutated stale item does not resurrect", () => {
    const { rows } = build()
    const [stale] = rows.addMany([{ id: 1, name: "stale", rank: 10 }])
    rows.replaceAll([{ id: 2, name: "fresh", rank: 20 }])

    // Mutating the removed item must not touch the index or throw.
    stale!.rank = 5
    assert.equal(rows.count, 1)
    assert.deepEqual(
      [...rows.byRank].map((r) => r.name),
      ["fresh"],
    )
    assert.equal(rows.byId.tryGet(1), null)
  })

  it("emits a bulk-remove then the inserts, all in one delta stream", () => {
    const { domain, rows } = build()
    rows.addMany([
      { id: 1, name: "a", rank: 10 },
      { id: 2, name: "b", rank: 20 },
    ])

    const ordered = rows.byRank.orderedArray
    const deltas: Change[] = []
    domain.subscribe(ordered, (c) => deltas.push(c))

    rows.replaceAll([
      { id: 3, name: "c", rank: 5 },
      { id: 4, name: "d", rank: 15 },
    ])

    // first delta clears the two old rows; the rest insert the new ones
    assert.equal(deltas[0]!.type, "ArraySplice")
    if (deltas[0]!.type === "ArraySplice") {
      assert.equal(deltas[0]!.start, 0)
      assert.equal(deltas[0]!.deleteCount, 2)
    }
    const inserts = deltas.filter((d) => d.type === "ArraySplice" && d.deleteCount === 0)
    assert.equal(inserts.length, 2)
    assert.deepEqual(
      ordered.map((r) => r.name),
      ["c", "d"],
    )
  })

  it("throws on invalid new data and (clear-first) leaves the collection empty", () => {
    const { rows } = build()
    rows.addMany([{ id: 1, name: "keep?", rank: 10 }])

    assert.throws(() =>
      rows.replaceAll([
        { id: 2, name: "x", rank: 5 },
        { id: 2, name: "dup", rank: 6 }, // duplicate id
      ]),
    )
    // documented semantics: clear ran before the throw → empty
    assert.equal(rows.count, 0)
  })
})
