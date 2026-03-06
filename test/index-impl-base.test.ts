import { describe, it } from "node:test"
import assert from "node:assert"
import {
  IndexImplBase,
  SubindexImpl,
  IndexImplConfig,
  getKeyFn,
  getKeySetFn,
  getFilterFn,
} from "../src/index-impl-base.js"

// Concrete implementation for testing
class TestIndex<I, K> extends IndexImplBase<I, K> {
  readonly storage = new Map<K, I>()

  constructor(config: Partial<IndexImplConfig<I, K>> = {}) {
    super({
      domain: null,
      keyFn: null,
      keySetFn: null,
      filterFn: null,
      subindexFn: null,
      ...config,
    })
  }

  protected getValueWithKey(key: K): I | SubindexImpl<I> | null {
    return this.storage.get(key) ?? null
  }

  protected addValueWithKey(value: I | SubindexImpl<I>, key: K): void {
    this.storage.set(key, value as I)
  }

  protected removeValueWithKey(key: K): void {
    this.storage.delete(key)
  }

  protected clearValues(): void {
    this.storage.clear()
  }

  protected isUnique(): boolean {
    return true
  }

  // Expose protected method for testing
  testKeysEqual(k1: K | null, k2: K | null): boolean {
    return this.keysEqual(k1, k2)
  }
}

describe("IndexImplBase", () => {
  describe("keysEqual", () => {
    it("should return true for identical primitives", () => {
      const index = new TestIndex<object, string>()
      assert.strictEqual(index.testKeysEqual("a", "a"), true)
      assert.strictEqual(index.testKeysEqual("", ""), true)
    })

    it("should return false for different primitives", () => {
      const index = new TestIndex<object, string>()
      assert.strictEqual(index.testKeysEqual("a", "b"), false)
    })

    it("should return true for null === null", () => {
      const index = new TestIndex<object, string>()
      assert.strictEqual(index.testKeysEqual(null, null), true)
    })

    it("should return false when one is null", () => {
      const index = new TestIndex<object, string>()
      assert.strictEqual(index.testKeysEqual("a", null), false)
      assert.strictEqual(index.testKeysEqual(null, "a"), false)
    })

    it("should compare Dates by value", () => {
      const index = new TestIndex<object, Date>()
      const d1 = new Date("2024-01-01")
      const d2 = new Date("2024-01-01")
      const d3 = new Date("2024-01-02")

      assert.strictEqual(index.testKeysEqual(d1, d2), true)
      assert.strictEqual(index.testKeysEqual(d1, d3), false)
    })

    it("should compare arrays (compound keys) by elements", () => {
      const index = new TestIndex<object, [string, number]>()

      assert.strictEqual(index.testKeysEqual(["a", 1], ["a", 1]), true)
      assert.strictEqual(index.testKeysEqual(["a", 1], ["a", 2]), false)
      assert.strictEqual(index.testKeysEqual(["a", 1], ["b", 1]), false)
    })

    it("should handle arrays of different lengths", () => {
      const index = new TestIndex<object, unknown[]>()

      assert.strictEqual(index.testKeysEqual(["a"], ["a", "b"]), false)
      assert.strictEqual(index.testKeysEqual(["a", "b"], ["a"]), false)
    })

    it("should compare Dates within compound keys", () => {
      const index = new TestIndex<object, [string, Date]>()
      const d1 = new Date("2024-01-01")
      const d2 = new Date("2024-01-01")
      const d3 = new Date("2024-01-02")

      assert.strictEqual(index.testKeysEqual(["a", d1], ["a", d2]), true)
      assert.strictEqual(index.testKeysEqual(["a", d1], ["a", d3]), false)
    })
  })
})

describe("getKeyFn", () => {
  it("should return the function if spec is a function", () => {
    const fn = (item: { id: number }) => item.id
    const result = getKeyFn(fn)
    assert.strictEqual(result, fn)
  })

  it("should return spec.get if spec is an object", () => {
    const fn = (item: { id: number }) => item.id
    const spec = { get: fn }
    const result = getKeyFn(spec)
    assert.strictEqual(result, fn)
  })
})

describe("getKeySetFn", () => {
  it("should return null if spec is a function", () => {
    const fn = (item: { id: number }) => item.id
    const result = getKeySetFn(fn)
    assert.strictEqual(result, null)
  })

  it("should return null if spec.set is undefined", () => {
    const fn = (item: { id: number }) => item.id
    const spec = { get: fn }
    const result = getKeySetFn(spec)
    assert.strictEqual(result, null)
  })

  it("should return spec.set if defined", () => {
    interface Item {
      id: number
    }
    const getFn = (item: Item) => item.id
    const setFn = (item: Item, value: number) => {
      item.id = value
    }
    const spec = { get: getFn, set: setFn }
    const result = getKeySetFn(spec)
    assert.strictEqual(result, setFn)
  })
})

describe("getFilterFn", () => {
  it("should return null if spec is undefined", () => {
    const result = getFilterFn(undefined)
    assert.strictEqual(result, null)
  })

  it("should return the function if spec is a function", () => {
    const fn = (item: { active: boolean }) => item.active
    const result = getFilterFn(fn)
    assert.strictEqual(result, fn)
  })

  it("should return spec.get if spec is an object", () => {
    const fn = (item: { active: boolean }) => item.active
    const spec = { get: fn }
    const result = getFilterFn(spec)
    assert.strictEqual(result, fn)
  })
})
