import { describe, expect, it } from "vitest"

import { buildSub2ApiToken } from "~~/tests/test-utils/factories"

describe("test factories", () => {
  it("buildSub2ApiToken uses a non-secret-like default key", () => {
    expect(buildSub2ApiToken().key).toBe("sub2api-test-key")
    expect(buildSub2ApiToken().key.startsWith("sk-")).toBe(false)
  })
})
