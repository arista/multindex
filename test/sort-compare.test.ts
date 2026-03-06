import { describe, it } from "node:test"
import assert from "node:assert"
import { compareSingleKeys, compareKeys, compareKeyToPartial } from "../src/sort-compare.js"

describe("compareSingleKeys", () => {
  describe("null and undefined", () => {
    it("should sort null first", () => {
      assert.ok(compareSingleKeys(null, undefined) < 0)
      assert.ok(compareSingleKeys(null, false) < 0)
      assert.ok(compareSingleKeys(null, 0) < 0)
      assert.ok(compareSingleKeys(null, "") < 0)
      assert.ok(compareSingleKeys(null, new Date()) < 0)
    })

    it("should sort undefined after null", () => {
      assert.ok(compareSingleKeys(undefined, null) > 0)
      assert.ok(compareSingleKeys(undefined, false) < 0)
      assert.ok(compareSingleKeys(undefined, 0) < 0)
    })

    it("should equal itself", () => {
      assert.strictEqual(compareSingleKeys(null, null), 0)
      assert.strictEqual(compareSingleKeys(undefined, undefined), 0)
    })
  })

  describe("booleans", () => {
    it("should sort false before true", () => {
      assert.ok(compareSingleKeys(false, true) < 0)
      assert.ok(compareSingleKeys(true, false) > 0)
    })

    it("should equal itself", () => {
      assert.strictEqual(compareSingleKeys(false, false), 0)
      assert.strictEqual(compareSingleKeys(true, true), 0)
    })

    it("should sort after undefined", () => {
      assert.ok(compareSingleKeys(false, undefined) > 0)
    })

    it("should sort before numbers", () => {
      assert.ok(compareSingleKeys(true, 0) < 0)
    })
  })

  describe("numbers", () => {
    it("should sort numerically", () => {
      assert.ok(compareSingleKeys(1, 2) < 0)
      assert.ok(compareSingleKeys(10, 2) > 0)
      assert.ok(compareSingleKeys(-5, 5) < 0)
    })

    it("should handle negative numbers", () => {
      assert.ok(compareSingleKeys(-10, -5) < 0)
    })

    it("should handle decimals", () => {
      assert.ok(compareSingleKeys(1.5, 1.6) < 0)
    })

    it("should equal itself", () => {
      assert.strictEqual(compareSingleKeys(42, 42), 0)
    })

    it("should sort after booleans", () => {
      assert.ok(compareSingleKeys(0, true) > 0)
    })

    it("should sort before strings", () => {
      assert.ok(compareSingleKeys(999, "a") < 0)
    })
  })

  describe("strings", () => {
    it("should sort lexicographically", () => {
      assert.ok(compareSingleKeys("a", "b") < 0)
      assert.ok(compareSingleKeys("apple", "banana") < 0)
      assert.ok(compareSingleKeys("z", "a") > 0)
    })

    it("should handle case sensitivity", () => {
      assert.ok(compareSingleKeys("A", "a") < 0) // uppercase before lowercase in ASCII
    })

    it("should handle prefix strings", () => {
      assert.ok(compareSingleKeys("app", "apple") < 0)
    })

    it("should equal itself", () => {
      assert.strictEqual(compareSingleKeys("hello", "hello"), 0)
    })

    it("should sort after numbers", () => {
      assert.ok(compareSingleKeys("0", 0) > 0)
    })

    it("should sort before Dates", () => {
      assert.ok(compareSingleKeys("z", new Date()) < 0)
    })
  })

  describe("Dates", () => {
    it("should sort by timestamp", () => {
      const earlier = new Date("2020-01-01")
      const later = new Date("2021-01-01")
      assert.ok(compareSingleKeys(earlier, later) < 0)
      assert.ok(compareSingleKeys(later, earlier) > 0)
    })

    it("should equal same timestamp", () => {
      const d1 = new Date("2020-01-01")
      const d2 = new Date("2020-01-01")
      assert.strictEqual(compareSingleKeys(d1, d2), 0)
    })

    it("should sort after strings", () => {
      assert.ok(compareSingleKeys(new Date(), "z") > 0)
    })
  })
})

describe("compareKeys", () => {
  it("should compare single keys", () => {
    assert.ok(compareKeys(1, 2, ["asc"]) < 0)
    assert.ok(compareKeys(2, 1, ["asc"]) > 0)
    assert.strictEqual(compareKeys(1, 1, ["asc"]), 0)
  })

  it("should respect descending direction", () => {
    assert.ok(compareKeys(1, 2, ["desc"]) > 0)
    assert.ok(compareKeys(2, 1, ["desc"]) < 0)
  })

  it("should compare compound keys element by element", () => {
    assert.ok(compareKeys([1, "a"], [1, "b"], ["asc", "asc"]) < 0)
    assert.ok(compareKeys([1, "b"], [1, "a"], ["asc", "asc"]) > 0)
    assert.ok(compareKeys([1, "a"], [2, "a"], ["asc", "asc"]) < 0)
  })

  it("should respect direction per element", () => {
    // First element desc, second asc
    assert.ok(compareKeys([1, "a"], [2, "a"], ["desc", "asc"]) > 0)
    assert.ok(compareKeys([1, "a"], [1, "b"], ["desc", "asc"]) < 0)
  })

  it("should handle prefix ordering", () => {
    // Shorter key (prefix) comes first
    assert.ok(compareKeys([1], [1, 2], ["asc", "asc"]) < 0)
    assert.ok(compareKeys([1, 2], [1], ["asc", "asc"]) > 0)
  })
})

describe("compareKeyToPartial", () => {
  it("should return 0 when full key starts with partial key", () => {
    assert.strictEqual(compareKeyToPartial([1, 2, 3], [1, 2], ["asc", "asc", "asc"]), 0)
    assert.strictEqual(compareKeyToPartial([1, 2, 3], [1], ["asc", "asc", "asc"]), 0)
  })

  it("should compare when keys differ", () => {
    assert.ok(compareKeyToPartial([1, 2, 3], [1, 3], ["asc", "asc", "asc"]) < 0)
    assert.ok(compareKeyToPartial([1, 3, 3], [1, 2], ["asc", "asc", "asc"]) > 0)
  })

  it("should handle single keys as partial", () => {
    assert.strictEqual(compareKeyToPartial(5, 5, ["asc"]), 0)
    assert.ok(compareKeyToPartial(3, 5, ["asc"]) < 0)
  })
})
