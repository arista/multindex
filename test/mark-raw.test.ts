import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ChangeDomain, getProxyState } from "chchchchanges"
import { createMultindex } from "../src/multindex.js"

type Item = { id: number }

describe("multindexes and indexes are raw", () => {
  const make = (domain: ChangeDomain) =>
    createMultindex<Item>()(
      (b) => ({
        byId: b.uniqueMap({ key: (i) => i.id }),
        order: b.uniqueSorted({ key: (i) => i.id }),
      }),
      { domain },
    )

  it("a multindex nested in change-enabled state is not proxied", () => {
    const domain = new ChangeDomain()
    const mi = make(domain)
    const model = domain.enableChanges({ mi })
    assert.equal(model.mi, mi)
    assert.equal(getProxyState(model.mi), undefined)
  })

  it("a bare index nested in change-enabled state is not proxied and still works", () => {
    const domain = new ChangeDomain()
    const mi = make(domain)
    mi.add({ id: 5 })
    const model = domain.enableChanges({ index: mi.order })
    assert.equal(model.index, mi.order)
    assert.equal(getProxyState(model.index), undefined)

    const mapped = model.index.createMappedArray((i) => i.id)
    mi.add({ id: 1 })
    assert.deepEqual([...mapped], [1, 5])
  })
})
