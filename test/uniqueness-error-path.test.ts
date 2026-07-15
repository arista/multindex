import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { Changes } from "chchchchanges"
import { createMultindex } from "../src/index.js"
import { UniqueMapIndexImpl } from "../src/unique-map-index-impl.js"
import { UniquenessViolationError } from "../src/errors.js"

interface Item {
  id: number
  group: number
  name: string
  ord: number
}

// Mirrors the shape that motivated this: root -> subtype -> subtype ->
// many-index -> nested multindex -> unique indexes.
const build = () =>
  createMultindex<Item>()(
    (b) => ({
      byId: b.uniqueMap({ key: (i) => i.id }),
      byOrd: b.uniqueSorted({ key: (i) => i.ord }),
      modelItem: b.subtype<Item>()((b) => ({
        moduleItem: b.subtype<Item>()((b) => ({
          byModuleId: b.manyMap({
            key: (i) => i.group,
            subindex: (b) =>
              b.mult((b) => ({
                byName: b.uniqueMap({ key: (i) => i.name }),
                byPos: b.uniqueSorted({ key: (i) => i.ord }),
              })),
          }),
        })),
      })),
    }),
    { domain: Changes.create({ name: "test" }) },
  )

describe("UniquenessViolationError — index path", () => {
  it("includes the full nested path: subtypes + many-index key + nested index", () => {
    const mx = build()
    mx.modelItem.moduleItem.add({ id: 1, group: 14, name: "foo", ord: 1 })

    assert.throws(
      () => mx.modelItem.moduleItem.add({ id: 2, group: 14, name: "foo", ord: 2 }),
      (e: unknown) =>
        e instanceof UniquenessViolationError &&
        e.message ===
          'Uniqueness violation: key "foo" already exists at modelItem.moduleItem.byModuleId[14].byName',
    )
  })

  it("names a top-level index", () => {
    const mx = build()
    mx.add({ id: 1, group: 1, name: "a", ord: 1 })

    assert.throws(
      () => mx.add({ id: 1, group: 2, name: "b", ord: 2 }),
      (e: unknown) =>
        e instanceof UniquenessViolationError && e.message.endsWith("already exists at byId"),
    )
  })

  it("reports the path from a uniqueSorted's bulk-insert validation (addMany)", () => {
    const mx = build()
    // Two items share ord 5 -> collide in the top-level uniqueSorted `byOrd`,
    // which validates the batch up front and throws from its addMany path.
    assert.throws(
      () =>
        mx.addMany([
          { id: 1, group: 1, name: "a", ord: 5 },
          { id: 2, group: 2, name: "b", ord: 5 },
        ]),
      (e: unknown) =>
        e instanceof UniquenessViolationError && e.message.endsWith("already exists at byOrd"),
    )
  })

  it("uses a bracketed JSON-natural key for the many-index segment (string key)", () => {
    const domain = Changes.create({ name: "test" })
    const mx = createMultindex<{ g: string; n: string }>()(
      (b) => ({
        byGroup: b.manyMap({
          key: (i) => i.g,
          subindex: (b) => b.mult((b) => ({ byName: b.uniqueMap({ key: (i) => i.n }) })),
        }),
      }),
      { domain },
    )
    mx.add({ g: "grp", n: "x" })
    assert.throws(
      () => mx.add({ g: "grp", n: "x" }),
      (e: unknown) =>
        e instanceof UniquenessViolationError && e.message.endsWith('at byGroup["grp"].byName'),
    )
  })

  it("falls back to the generic message for a standalone index (no container)", () => {
    const domain = Changes.create({ name: "test" })
    const index = new UniqueMapIndexImpl<{ k: number }, number>(domain, { key: (i) => i.k })
    index.add({ k: 1 })

    assert.throws(
      () => index.add({ k: 1 }),
      (e: unknown) =>
        e instanceof UniquenessViolationError &&
        e.message === 'Uniqueness violation: key "1" already exists in index',
    )
  })
})
