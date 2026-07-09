import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ChangeDomain, type Change } from "chchchchanges"
import { UniqueSortedIndexImpl } from "../src/unique-sorted-index-impl.js"

type Item = { seqId: number; label: string }

const makeIndex = (domain: ChangeDomain | null) =>
  new UniqueSortedIndexImpl<Item, number>(domain, { key: (i) => i.seqId })

describe("UniqueSortedIndexImpl — mapped arrays", () => {
  it("tracks adds at sorted positions", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const mapped = index.createMappedArray((i) => i.label)
    assert.deepEqual([...mapped], [])

    index.add({ seqId: 2, label: "two" })
    index.add({ seqId: 1, label: "one" })
    index.add({ seqId: 3, label: "three" })

    assert.deepEqual([...mapped], ["one", "two", "three"])
  })

  it("seeds from current items and tracks removes", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const one = { seqId: 1, label: "one" }
    const two = { seqId: 2, label: "two" }
    const three = { seqId: 3, label: "three" }
    index.add(one)
    index.add(two)
    index.add(three)

    const mapped = index.createMappedArray((i) => i.label)
    assert.deepEqual([...mapped], ["one", "two", "three"])

    index.remove(two)
    assert.deepEqual([...mapped], ["one", "three"])

    index.remove(one)
    assert.deepEqual([...mapped], ["three"])
  })

  it("orderedArray has stable identity and reflects sort order", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    index.add({ seqId: 2, label: "two" })

    const arr = index.orderedArray
    assert.equal(index.orderedArray, arr) // same instance each access

    index.add({ seqId: 1, label: "one" })
    assert.deepEqual(
      index.orderedArray.map((i) => i.label),
      ["one", "two"],
    )
  })

  it("emits fine-grained deltas a subscriber can consume", () => {
    const domain = new ChangeDomain()
    const index = makeIndex(domain)
    const mapped = index.createMappedArray((i) => i.label)

    const deltas: Change[] = []
    domain.subscribe(mapped, (c) => deltas.push(c))

    index.add({ seqId: 5, label: "five" }) // append
    index.add({ seqId: 1, label: "one" }) // insert at front

    assert.equal(deltas.length, 2)
    assert.equal(deltas[0]!.type, "ArraySplice")
    assert.equal(deltas[1]!.type, "ArraySplice")
    if (deltas[1]!.type === "ArraySplice") {
      assert.equal(deltas[1]!.start, 0) // inserted before "five"
    }
    assert.deepEqual([...mapped], ["one", "five"])
  })

  it("throws without a reactive domain", () => {
    const index = makeIndex(null)
    assert.throws(() => index.createMappedArray((i) => i.label), /reactive/)
    assert.throws(() => index.orderedArray, /reactive/)
  })

  describe("re-key emits a single move", () => {
    it("relocates a re-keyed item with one ArrayMove (no duplicate)", () => {
      const domain = new ChangeDomain()
      const index = makeIndex(domain)
      const a = index.add(domain.enableChanges({ seqId: 1, label: "a" }))
      index.add(domain.enableChanges({ seqId: 2, label: "b" }))
      index.add(domain.enableChanges({ seqId: 3, label: "c" }))

      const mapped = index.createMappedArray((i) => i.label)
      const deltas: Change[] = []
      domain.subscribe(mapped, (c) => deltas.push(c))

      a.seqId = 10 // moves 'a' to the end
      assert.deepEqual([...mapped], ["b", "c", "a"])
      assert.equal(deltas.length, 1)
      assert.equal(deltas[0]!.type, "ArrayMove")
      if (deltas[0]!.type === "ArrayMove") {
        assert.equal(deltas[0]!.from, 0)
        assert.equal(deltas[0]!.to, 2)
      }
    })

    it("moves back to the front", () => {
      const domain = new ChangeDomain()
      const index = makeIndex(domain)
      index.add(domain.enableChanges({ seqId: 1, label: "a" }))
      index.add(domain.enableChanges({ seqId: 2, label: "b" }))
      const c = index.add(domain.enableChanges({ seqId: 3, label: "c" }))

      const mapped = index.createMappedArray((i) => i.label)
      c.seqId = 0
      assert.deepEqual([...mapped], ["c", "a", "b"])
    })

    it("emits nothing when the position does not change", () => {
      const domain = new ChangeDomain()
      const index = makeIndex(domain)
      const a = index.add(domain.enableChanges({ seqId: 1, label: "a" }))
      index.add(domain.enableChanges({ seqId: 5, label: "b" }))

      const mapped = index.createMappedArray((i) => i.label)
      const deltas: Change[] = []
      domain.subscribe(mapped, (c) => deltas.push(c))

      a.seqId = 3 // still sorts before 'b' — same position
      assert.deepEqual([...mapped], ["a", "b"])
      assert.equal(deltas.length, 0)
    })
  })
})
