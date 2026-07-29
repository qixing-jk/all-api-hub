import { readFileSync } from "node:fs"
import { describe, expect, expectTypeOf, it } from "vitest"

import type {
  AccountAutoDetectDetectedResponse,
  AccountAutoDetectResponse,
} from "~/types/serviceResponse"

describe("generic account service responses", () => {
  it("keeps auto-detect limited to the detected response contract", () => {
    expectTypeOf<AccountAutoDetectResponse>().toEqualTypeOf<AccountAutoDetectDetectedResponse>()
  })

  it("does not own OpenRouter provisioning lifecycle dependencies", () => {
    const source = readFileSync(
      new URL("../../src/types/serviceResponse.ts", import.meta.url),
      "utf8",
    )

    expect(source).not.toContain("openRouterBootstrap")
    expect(source).not.toContain("apiAdapters/openrouter")
    expect(source).not.toContain("bootstrap_completed")
    expect(source).not.toContain("bootstrap_recovery")
    expect(source).not.toContain("bootstrap_failure")
  })
})
