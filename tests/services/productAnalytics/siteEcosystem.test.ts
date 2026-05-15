import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildSiteEcosystemAnalyticsEvents,
  shouldSendSiteEcosystemSnapshot,
  SITE_ECOSYSTEM_SNAPSHOT_INTERVAL_MS,
} from "~/services/productAnalytics/siteEcosystem"
import type { SiteAccount } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

function buildRawSiteTypeAccount(
  rawSiteType: unknown,
  overrides: Partial<SiteAccount> = {},
): SiteAccount {
  // Verifies defensive normalization of persisted/untrusted account metadata
  // that may contain fixed managed-site values outside AccountSiteType.
  return buildSiteAccount({
    ...overrides,
    site_type: rawSiteType as SiteAccount["site_type"],
  })
}

describe("siteEcosystem analytics", () => {
  it("builds coarse aggregate and per-site-type events without exporting private account data", () => {
    const events = buildSiteEcosystemAnalyticsEvents([
      buildSiteAccount({
        id: "private-account-1",
        site_name: "private-user main",
        site_url: "https://new-api.example/private/path-a?token=secret-token",
        site_type: SITE_TYPES.NEW_API,
        notes: "private notes",
        account_info: {
          id: 1,
          access_token: "secret-token",
          username: "private-user",
          quota: 12345,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "private-account-2",
        site_name: "private-user secondary",
        site_url: "https://new-api.example/other/path-b",
        site_type: SITE_TYPES.NEW_API,
        notes: "private notes",
        account_info: {
          id: 2,
          access_token: "secret-token",
          username: "private-user",
          quota: 67890,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "private-account-3",
        site_name: "private-user unknown",
        site_url: "https://private.example/unknown",
        site_type: SITE_TYPES.UNKNOWN,
        notes: "private notes",
      }),
      buildRawSiteTypeAccount(SITE_TYPES.AXON_HUB, {
        id: "private-account-4",
        site_name: "private-user axonhub",
        site_url: "not a url with private.example and secret-token",
        notes: "private notes",
      }),
    ])

    expect(events).toEqual([
      {
        eventName: "site_ecosystem_snapshot",
        properties: {
          total_account_count_bucket: "4_10",
          distinct_site_count_bucket: "2_3",
          known_site_type_count_bucket: "2_3",
          unknown_site_count_bucket: "1",
          managed_site_count_bucket: "2_3",
        },
      },
      {
        eventName: "site_type_present",
        properties: {
          site_type: SITE_TYPES.NEW_API,
          account_count_bucket: "2_3",
        },
      },
      {
        eventName: "site_type_present",
        properties: {
          site_type: SITE_TYPES.AXON_HUB,
          account_count_bucket: "1",
        },
      },
      {
        eventName: "site_type_present",
        properties: {
          site_type: SITE_TYPES.UNKNOWN,
          account_count_bucket: "1",
        },
      },
    ])

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain("private.example")
    expect(serialized).not.toContain("new-api.example")
    expect(serialized).not.toContain("secret-token")
    expect(serialized).not.toContain("private-user")
    expect(serialized).not.toContain("quota")
    expect(serialized).not.toContain("private notes")
  })

  it("decides whether the three-day site ecosystem snapshot interval has elapsed", () => {
    const now = Date.parse("2026-05-12T00:00:00.000Z")

    expect(shouldSendSiteEcosystemSnapshot(undefined, now)).toBe(true)
    expect(shouldSendSiteEcosystemSnapshot(now, now)).toBe(false)
    expect(
      shouldSendSiteEcosystemSnapshot(
        now - SITE_ECOSYSTEM_SNAPSHOT_INTERVAL_MS + 1,
        now,
      ),
    ).toBe(false)
    expect(
      shouldSendSiteEcosystemSnapshot(
        now - SITE_ECOSYSTEM_SNAPSHOT_INTERVAL_MS,
        now,
      ),
    ).toBe(true)
    expect(
      shouldSendSiteEcosystemSnapshot(now - 3 * 24 * 60 * 60 * 1000, now),
    ).toBe(true)
  })
})
