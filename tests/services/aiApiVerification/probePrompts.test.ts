import { describe, expect, it } from "vitest"

import {
  getDefaultProbePrompt,
  resolveProbePrompts,
} from "~/services/verification/aiApiVerification/probes/probePrompts"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"

describe("getDefaultProbePrompt", () => {
  it("returns the built-in prompt for every probe that sends one", () => {
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.TextGeneration),
    ).toBe("Reply with exactly: OK")
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.StructuredOutput),
    ).toContain("JSON")
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.ToolCalling),
    ).toContain("verify_tool")
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.WebSearch),
    ).toContain("search")
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.ImageGeneration),
    ).toBeTruthy()
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.VideoGeneration),
    ).toBeTruthy()
    expect(getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.Embedding)).toBe(
      "ping",
    )
  })

  it("returns null for probes that never send a prompt", () => {
    expect(getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.Models)).toBeNull()
    expect(getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.Rerank)).toBeNull()
    expect(
      getDefaultProbePrompt(API_VERIFICATION_PROBE_IDS.Decision),
    ).toBeNull()
  })
})

describe("resolveProbePrompts", () => {
  it("uses defaults when no override is stored", () => {
    const resolved = resolveProbePrompts(undefined)

    expect(resolved[API_VERIFICATION_PROBE_IDS.TextGeneration]).toBe(
      "Reply with exactly: OK",
    )
    expect(resolved[API_VERIFICATION_PROBE_IDS.Models]).toBeUndefined()
  })

  it("applies a trimmed override", () => {
    const resolved = resolveProbePrompts({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]:
        "  Reply with exactly: YES  ",
    })

    expect(resolved[API_VERIFICATION_PROBE_IDS.TextGeneration]).toBe(
      "Reply with exactly: YES",
    )
  })

  it("ignores blank and non-string overrides so a probe always sends a prompt", () => {
    const resolved = resolveProbePrompts({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "   ",
      [API_VERIFICATION_PROBE_IDS.StructuredOutput]: 42 as unknown as string,
    })

    expect(resolved[API_VERIFICATION_PROBE_IDS.TextGeneration]).toBe(
      "Reply with exactly: OK",
    )
    expect(resolved[API_VERIFICATION_PROBE_IDS.StructuredOutput]).toContain(
      "JSON",
    )
  })

  it("ignores unknown probe ids", () => {
    const resolved = resolveProbePrompts({
      "not-a-probe": "x",
    } as unknown as Record<string, string>)

    expect(resolved["not-a-probe" as keyof typeof resolved]).toBeUndefined()
  })
})
