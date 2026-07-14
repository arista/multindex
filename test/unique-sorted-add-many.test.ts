import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ChangeDomain, type Change } from "chchchchanges"
import { UniqueSortedIndexImpl } from "../src/unique-sorted-index-impl.js"
import { UniquenessViolationError } from "../src/errors.js"

type Item = { seqId: number; label: string }

const makeIndex = (domain: ChangeDomain | null) =>
  new UniqueSortedIndexImpl<Item, number>(domain, { key: (i) => i.seqId })

/** Replay a stream of ArraySplice deltas onto a starting array. */
function replay<T>(start: T[], deltas: Change[]): T[] {
  const arr = start.slice()
  for (const d of deltas) {
    assert.equal(d.type, "ArraySplice")
    if (d.type === "ArraySplice") {
      arr.splice(d.start, d.deleteCount, ...((d.items as T[] | undefined) ?? []))
    }
  }
  return arr
}

describe("UniqueSortedIndexImpl — addMany", () => {
  it("bulk-inserts into an empty index in sorted order", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const returned = index.addMany([
      { seqId: 3, label: "three" },
      { seqId: 1, label: "one" },
      { seqId: 2, label: "two" },
    ])
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one", "two", "three"],
    )
    assert.equal(index.count, 3)
    // returns items in input order
    assert.deepEqual(
      returned.map((i) => i.label),
      ["three", "one", "two"],
    )
  })

  it("merges a batch into existing items, interleaved and sorted", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 10, label: "10" })
    index.add({ seqId: 30, label: "30" })
    index.add({ seqId: 50, label: "50" })

    index.addMany([
      { seqId: 20, label: "20" },
      { seqId: 40, label: "40" },
      { seqId: 5, label: "5" },
      { seqId: 60, label: "60" },
    ])

    assert.deepEqual(
      [...index].map((i) => i.label),
      ["5", "10", "20", "30", "40", "50", "60"],
    )
    assert.equal(index.count, 7)
  })

  it("emits ascending ArraySplices that reconstruct the merged array", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 10, label: "10" })
    index.add({ seqId: 30, label: "30" })
    index.add({ seqId: 50, label: "50" })

    // Subscribe to the raw ordered view so the ArraySplice `items` are the
    // actual inserted items — lets us replay and verify reconstruction.
    const ordered = index.orderedArray
    const before = ordered.map((i) => i.label)
    const deltas: Change[] = []
    domain.subscribe(ordered, (c) => deltas.push(c))

    index.addMany([
      { seqId: 20, label: "20" },
      { seqId: 5, label: "5" },
      { seqId: 60, label: "60" },
      { seqId: 40, label: "40" },
    ])

    // one splice per genuinely-new item
    assert.equal(deltas.length, 4)
    for (const d of deltas) {
      assert.equal(d.type, "ArraySplice")
      if (d.type === "ArraySplice") assert.equal(d.deleteCount, 0)
    }
    // indices are non-decreasing (ascending final-index emission)
    const starts = deltas.map((d) => (d.type === "ArraySplice" ? d.start : -1))
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! >= starts[i - 1]!)

    // replaying the deltas onto the pre-batch snapshot yields the final order —
    // proving ascending emission reconstructs the merged array
    const reconstructed = replay(
      before,
      deltas.map((d) =>
        d.type === "ArraySplice" ? { ...d, items: (d.items as Item[]).map((i) => i.label) } : d,
      ) as Change[],
    )
    assert.deepEqual(reconstructed, ["5", "10", "20", "30", "40", "50", "60"])
    // and the live ordered view agrees
    assert.deepEqual(
      ordered.map((i) => i.label),
      ["5", "10", "20", "30", "40", "50", "60"],
    )
  })

  it("rejects a duplicate key within the batch and leaves the index untouched", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 1, label: "one" })

    assert.throws(
      () =>
        index.addMany([
          { seqId: 2, label: "two" },
          { seqId: 2, label: "two-again" },
        ]),
      UniquenessViolationError,
    )
    // nothing committed — still just the pre-existing item
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one"],
    )
    assert.equal(index.count, 1)
  })

  it("rejects a key that collides with an existing item and stays untouched", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 5, label: "five" })

    assert.throws(
      () =>
        index.addMany([
          { seqId: 7, label: "seven" },
          { seqId: 5, label: "five-again" },
        ]),
      UniquenessViolationError,
    )
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["five"],
    )
    assert.equal(index.count, 1)
  })

  it("dedupes a repeated item object within the batch", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const dup = { seqId: 2, label: "two" }
    index.addMany([dup, { seqId: 1, label: "one" }, dup])
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one", "two"],
    )
    assert.equal(index.count, 2)
  })

  it("treats already-present items in the batch as no-ops", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const one = index.add({ seqId: 1, label: "one" })
    index.addMany([one, { seqId: 2, label: "two" }])
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one", "two"],
    )
    assert.equal(index.count, 2)
  })

  it("keeps mapped values stable per item (built once on insert)", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 2, label: "two" })
    const mapped = index.createMappedArray((i) => ({ label: i.label }))
    const twoMapped = mapped[0]
    index.addMany([
      { seqId: 1, label: "one" },
      { seqId: 3, label: "three" },
    ])
    // 'two' moved from index 0 to index 1 but its mapped object is the same one
    assert.equal(mapped[1], twoMapped)
    assert.deepEqual(
      mapped.map((m) => m.label),
      ["one", "two", "three"],
    )
  })

  it("respects a filter: excluded items are not placed but included ones are", () => {
    const domain = new ChangeDomain()
    const index = new UniqueSortedIndexImpl<Item, number>(domain, {
      key: (i) => i.seqId,
      filter: (i) => i.seqId % 2 === 1, // odd only
    })
    index.addMany([
      { seqId: 1, label: "one" },
      { seqId: 2, label: "two" },
      { seqId: 3, label: "three" },
      { seqId: 4, label: "four" },
    ])
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one", "three"],
    )
    assert.equal(index.count, 2)
  })

  it("works without a reactive domain (no ordered view to notify)", () => {
    const index = makeIndex(null)
    index.addMany([
      { seqId: 3, label: "three" },
      { seqId: 1, label: "one" },
      { seqId: 2, label: "two" },
    ])
    assert.deepEqual(
      [...index].map((i) => i.label),
      ["one", "two", "three"],
    )
  })
})
