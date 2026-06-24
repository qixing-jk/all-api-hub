import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { resolveLocateManagedSiteChannelToastMessage } from "~/features/AccountManagement/components/AccountActionButtons/locateManagedSiteChannelToast"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import type { ManagedSiteChannel } from "~/types/managedSite"

const channel = (id: number): ManagedSiteChannel =>
  ({
    id,
    name: `Channel ${id}`,
    base_url: "https://api.example.com",
    models: "gpt-4",
    key: "",
  }) as ManagedSiteChannel

const buildInspection = (
  overrides: Partial<ManagedSiteChannelMatchInspection>,
): ManagedSiteChannelMatchInspection => ({
  searchBaseUrl: "https://api.example.com",
  searchCompleted: true,
  url: {
    matched: false,
    channel: null,
    candidateCount: 0,
  },
  key: {
    comparable: true,
    matched: false,
    reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
    channel: null,
  },
  models: {
    comparable: true,
    matched: false,
    reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    channel: null,
  },
  ...overrides,
})

const translate = ((key: string) => key) as TFunction

describe("resolveLocateManagedSiteChannelToastMessage", () => {
  it.each([
    [
      "same channel key and model drift",
      buildInspection({
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: channel(1),
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR,
          channel: channel(1),
        },
      }),
      "account:actions.channelLocateKeyMatchedModelsDrifted",
    ],
    [
      "conflicting key and model signals",
      buildInspection({
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: channel(1),
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: channel(2),
        },
      }),
      "account:actions.channelLocateSignalsConflict",
    ],
    [
      "key-only match",
      buildInspection({
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: channel(1),
        },
      }),
      "account:actions.channelLocateKeyMatchOnly",
    ],
    [
      "secondary exact model match",
      buildInspection({
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: channel(1),
        },
      }),
      "account:actions.channelLocateSecondaryExactModels",
    ],
    [
      "secondary contained model match",
      buildInspection({
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED,
          channel: channel(1),
        },
      }),
      "account:actions.channelLocateSecondaryModelsContained",
    ],
    [
      "secondary similar model match",
      buildInspection({
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR,
          channel: channel(1),
        },
      }),
      "account:actions.channelLocateSecondaryModelsSimilar",
    ],
    [
      "URL-only fallback",
      buildInspection({
        url: {
          matched: true,
          channel: channel(1),
          candidateCount: 1,
        },
      }),
      "account:actions.channelLocateFuzzyUrlOnly",
    ],
    [
      "unresolved match",
      buildInspection({}),
      "account:actions.channelLocateUnresolved",
    ],
  ])("returns the %s toast key", (_label, inspection, expectedKey) => {
    expect(
      resolveLocateManagedSiteChannelToastMessage(translate, inspection),
    ).toBe(expectedKey)
  })
})
