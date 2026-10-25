import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"
import {
  loadProbePromptOverrides,
  normalizeProbePromptDraft,
  saveProbePromptOverrides,
} from "~/services/verification/promptOverrides"

const mockGetPreferences = vi.fn()
const mockSetVerificationProbePrompts = vi.fn()

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
    setVerificationProbePrompts: (...args: unknown[]) =>
      mockSetVerificationProbePrompts(...args),
  },
}))

describe("normalizeProbePromptDraft", () => {
  it("drops the classic drawing default while preserving a custom drawing prompt", () => {
    expect(
      normalizeProbePromptDraft({
        pelican: " Generate an SVG of a pelican riding a bicycle ",
      }),
    ).toEqual({})
    expect(
      normalizeProbePromptDraft({ pelican: " Draw a blue bicycle " }),
    ).toEqual({ pelican: "Draw a blue bicycle" })
  })

  it("keeps only prompts that differ from the built-in default", () => {
    expect(
      normalizeProbePromptDraft({
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Reply with exactly: OK",
        [API_VERIFICATION_PROBE_IDS.StructuredOutput]: "Return JSON.",
      }),
    ).toEqual({ [API_VERIFICATION_PROBE_IDS.StructuredOutput]: "Return JSON." })
  })

  it("trims values and drops blanks so a probe keeps its default", () => {
    expect(
      normalizeProbePromptDraft({
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "   ",
        [API_VERIFICATION_PROBE_IDS.Embedding]: "  ping  ",
      }),
    ).toEqual({})
  })

  it("ignores probes that never send a prompt", () => {
    expect(
      normalizeProbePromptDraft({
        [API_VERIFICATION_PROBE_IDS.Models]: "list models",
      }),
    ).toEqual({})
  })
})

describe("prompt override persistence", () => {
  beforeEach(() => {
    mockGetPreferences.mockReset()
    mockSetVerificationProbePrompts.mockReset()
  })

  it("reads stored overrides and normalizes them", async () => {
    mockGetPreferences.mockResolvedValue({
      verificationProbePrompts: {
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "  Say YES  ",
        [API_VERIFICATION_PROBE_IDS.Embedding]: "   ",
      },
    })

    await expect(loadProbePromptOverrides()).resolves.toEqual({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
  })

  it("falls back to defaults when preferences cannot be read", async () => {
    mockGetPreferences.mockRejectedValue(new Error("unreadable"))

    await expect(loadProbePromptOverrides()).resolves.toEqual({})
  })

  it("replaces the stored overrides with the normalized draft", async () => {
    mockSetVerificationProbePrompts.mockResolvedValue({ ok: true })

    await saveProbePromptOverrides({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "  Say YES  ",
      [API_VERIFICATION_PROBE_IDS.StructuredOutput]: "",
    })

    expect(mockSetVerificationProbePrompts).toHaveBeenCalledWith({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })
  })

  it("propagates a rejected write", async () => {
    mockSetVerificationProbePrompts.mockRejectedValue(
      new Error("storage locked"),
    )

    await expect(saveProbePromptOverrides({})).rejects.toThrow("storage locked")
  })

  it("throws the typed write failure instead of dropping it", async () => {
    const writeError = new Error("storage locked")
    mockSetVerificationProbePrompts.mockResolvedValue({
      ok: false,
      reason: { type: "storage-error", error: writeError },
    })

    await expect(saveProbePromptOverrides({})).rejects.toThrow("storage locked")
  })
})
