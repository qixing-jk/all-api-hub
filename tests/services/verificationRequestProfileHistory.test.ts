import { describe, expect, it } from "vitest"

import { buildProbeState } from "~/features/Verification/api/probeState"
import {
  API_TYPES,
  API_VERIFICATION_REQUEST_PROFILES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification/types"
import { coerceHistorySummary } from "~/services/verification/verificationResultHistory/codec"
import {
  createProfileVerificationHistoryTarget,
  createVerificationHistorySummary,
  toPersistedProbeSummary,
} from "~/services/verification/verificationResultHistory/utils"

describe("request profile history contracts", () => {
  it.each([false, true])(
    "restores the enhanced flag only for enhanced history (%s)",
    (enhanced) => {
      const summary = createVerificationHistorySummary({
        target: createProfileVerificationHistoryTarget("profile-history")!,
        apiType: API_TYPES.OPENAI,
        results: [
          {
            ...probe,
            requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
            ...(enhanced ? { requestProfileEnhanced: true } : {}),
          },
        ],
      })!
      const result = buildProbeState(API_TYPES.OPENAI, summary).find(
        (item) => item.definition.id === "text-generation",
      )!.result!
      expect(result.requestProfile).toBe(
        API_VERIFICATION_REQUEST_PROFILES.Codex,
      )
      expect(result.requestProfileEnhanced).toBe(enhanced || undefined)
    },
  )

  const probe: ApiVerificationProbeResult = {
    id: "text-generation",
    status: "pass",
    latencyMs: 1,
    summary: "OK",
  }

  it.each([
    { metadata: {}, expected: {} },
    { metadata: { requestProfileEnhanced: true }, expected: {} },
    {
      metadata: { requestProfile: "unknown", requestProfileEnhanced: true },
      expected: {},
    },
    {
      metadata: { requestProfile: null, requestProfileEnhanced: true },
      expected: {},
    },
    {
      metadata: {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Default,
        requestProfileEnhanced: true,
      },
      expected: { requestProfile: "default" },
    },
    {
      metadata: {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
        requestProfileEnhanced: true,
      },
      expected: { requestProfile: "codex", requestProfileEnhanced: true },
    },
    {
      metadata: {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
        requestProfileEnhanced: false,
      },
      expected: { requestProfile: "claude" },
    },
    {
      metadata: {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
        requestProfileEnhanced: "true",
      },
      expected: { requestProfile: "gemini" },
    },
  ])(
    "normalizes identity on both writes and untrusted reads: $metadata",
    ({ metadata, expected }) => {
      const summary = createVerificationHistorySummary({
        target: createProfileVerificationHistoryTarget("profile-history")!,
        apiType: API_TYPES.OPENAI,
        results: [probe],
      })!
      const rawProbe = { ...probe, ...metadata }
      const read = coerceHistorySummary({ ...summary, probes: [rawProbe] })!
        .probes[0]!
      // Intentionally feed malformed runtime values to the write boundary as well.
      const written = toPersistedProbeSummary(
        rawProbe as ApiVerificationProbeResult,
      )
      for (const normalized of [read, written]) {
        const identity = Object.fromEntries(
          Object.entries(normalized).filter(
            ([key]) =>
              key === "requestProfile" || key === "requestProfileEnhanced",
          ),
        )
        expect(identity).toEqual(expected)
      }
    },
  )
})
