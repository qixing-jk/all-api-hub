import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  applyVerifiedManagedSiteChannelKey,
  toManagedSiteAssessmentChannel,
  toManagedSiteVerifiedKeyAssessment,
} from "~/services/managedSites/verifiedChannelKeyAssessment"
import {
  buildManagedResourceMatchCandidate,
  matchingResourceRef,
} from "~~/tests/test-utils/managedResourceMatching"

const candidate = {
  ref: matchingResourceRef(12),
  name: "Managed Channel 12",
}

const buildAssessment = () => ({
  searchBaseUrl: "https://api.example.com",
  searchCompleted: true,
  url: {
    matched: true,
    candidateCount: 1,
    channel: candidate,
  },
  key: {
    comparable: false,
    matched: false,
    reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
    channel: undefined,
  },
  models: {
    comparable: true,
    matched: true,
    reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    channel: candidate,
    similarityScore: 1,
  },
})

describe("applyVerifiedManagedSiteChannelKey", () => {
  it.each([
    { scopeKey: "https://other.example" },
    { siteType: SITE_TYPES.DONE_HUB },
  ])(
    "does not combine model and key evidence for the same id with a different %o",
    (overrides) => {
      const otherCandidate = {
        ...candidate,
        ref: matchingResourceRef(12, overrides),
      }
      const result = applyVerifiedManagedSiteChannelKey({
        assessment: buildAssessment(),
        candidate: otherCandidate,
        sourceKey: "sk-source-key",
        verifiedChannelKey: "sk-source-key",
        siteType: SITE_TYPES.NEW_API,
      })

      expect(result.assessment.key.channel).toEqual(otherCandidate)
      expect(result.assessment.models.channel?.ref).toEqual(candidate.ref)
      expect(result.exactMatch).toBe(false)
    },
  )

  it("marks an exact match when the verified channel key matches the source key", () => {
    const result = applyVerifiedManagedSiteChannelKey({
      assessment: buildAssessment(),
      candidate,
      sourceKey: "sk-source-key",
      verifiedChannelKey: "sk-source-key",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result.exactMatch).toBe(true)
    expect(result.hasAnyMatch).toBe(true)
    expect(result.assessment.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: candidate,
    })
  })

  it("uses managed-site key comparison semantics when applying the verified key", () => {
    const result = applyVerifiedManagedSiteChannelKey({
      assessment: buildAssessment(),
      candidate,
      sourceKey: "source-key",
      verifiedChannelKey: "sk-source-key",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result.exactMatch).toBe(true)
    expect(result.assessment.key.reason).toBe(
      MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
    )
  })

  it("matches one source key against a verified multi-key channel payload", () => {
    const result = applyVerifiedManagedSiteChannelKey({
      assessment: buildAssessment(),
      candidate,
      sourceKey: "sk-second-key",
      verifiedChannelKey: "sk-first-key\nsk-second-key",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(result.exactMatch).toBe(true)
    expect(result.assessment.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: candidate,
    })
  })
})

describe("toManagedSiteVerifiedKeyAssessment", () => {
  it("retains the native route identity without exposing the provider payload or key", () => {
    const channel = {
      ...buildManagedResourceMatchCandidate({ name: "Example channel" }),
      ref: matchingResourceRef("native/42+="),
      key: "example-secret",
    }

    expect(toManagedSiteAssessmentChannel(channel)).toEqual({
      ref: matchingResourceRef("native/42+="),
      name: "Example channel",
    })
  })

  it("maps match inspection channels to lightweight channel summaries", () => {
    const assessment = toManagedSiteVerifiedKeyAssessment({
      searchBaseUrl: "https://api.example.invalid",
      searchCompleted: true,
      url: {
        matched: true,
        candidateCount: 1,
        channel: buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(12),
          name: "Managed Channel 12",
          key: "hidden-key",
          base_url: "https://api.example.invalid",
          models: "gpt-4o",
        }),
      },
      key: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
        channel: null,
      },
      models: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
        channel: buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(13),
          name: "Managed Channel 13",
          key: "other-hidden-key",
          base_url: "https://api.example.invalid",
          models: "gpt-4o",
        }),
        similarityScore: 1,
      },
    })

    expect(assessment).toEqual({
      searchBaseUrl: "https://api.example.invalid",
      searchCompleted: true,
      url: {
        matched: true,
        candidateCount: 1,
        channel: {
          ref: matchingResourceRef(12),
          name: "Managed Channel 12",
        },
      },
      key: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
        channel: undefined,
      },
      models: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
        channel: {
          ref: matchingResourceRef(13),
          name: "Managed Channel 13",
        },
        similarityScore: 1,
      },
    })
  })
})
