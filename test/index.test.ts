import { describe, it } from "node:test"
import assert from "node:assert"

describe("multindex", () => {
  it("should be importable", async () => {
    const module = await import("../src/index.js")
    assert.ok(module !== undefined)
  })
})
