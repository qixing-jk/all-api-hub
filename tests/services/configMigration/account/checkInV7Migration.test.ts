import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  CURRENT_CONFIG_VERSION,
  migrateAccountConfig,
} from "~/services/accounts/migrations/accountDataMigration"
import {
  migrateSiteAccountCheckInToV7,
  type StoredSiteAccountForV7Codec,
} from "~/services/accounts/migrations/checkInV7Migration"
import {
  getLegacyAutoCheckinMethodIds,
  LEGACY_AUTO_CHECKIN_METHOD_SITE_TYPES,
} from "~/services/checkin/autoCheckin/providers/registry"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { CheckInMethodId } from "~/types/checkIn"

function createSiteAccount(
  overrides: Partial<StoredSiteAccountForV7Codec> = {},
): StoredSiteAccountForV7Codec {
  return {
    id: "account-1",
    site_name: "Example Site",
    site_url: "https://account.example.invalid",
    health: { status: SiteHealthStatus.Healthy },
    site_type: SITE_TYPES.UNKNOWN,
    exchange_rate: 7,
    account_info: {
      id: "user-1",
      access_token: "placeholder-token",
      username: "example-user",
      quota: 1000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: 10,
    updated_at: 20,
    user_updated_at: 21,
    created_at: 5,
    notes: "",
    tagIds: [],
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    configVersion: 6,
    ...overrides,
  }
}

const legacyRegistrations = (
  Object.entries(LEGACY_AUTO_CHECKIN_METHOD_SITE_TYPES) as Array<
    [CheckInMethodId, readonly SiteAccount["site_type"][]]
  >
).flatMap(([methodId, siteTypes]) =>
  siteTypes.map((siteType) => ({
    methodId,
    siteType,
  })),
)

const legacyResolver = {
  getLegacyMethodIds: (siteType: SiteAccount["site_type"]) =>
    getLegacyAutoCheckinMethodIds(siteType),
}

describe("migrateSiteAccountCheckInToV7", () => {
  it("keeps every pre-V7 provider covered by an exact legacy registration", () => {
    const expectedRegistrations = [
      {
        methodId: "anyrouter:daily-checkin",
        siteType: SITE_TYPES.ANYROUTER,
      },
      {
        methodId: "veloera:daily-checkin",
        siteType: SITE_TYPES.VELOERA,
      },
      {
        methodId: "wong-gongyi:daily-checkin",
        siteType: SITE_TYPES.WONG_GONGYI,
      },
      {
        methodId: "new-api:daily-checkin",
        siteType: SITE_TYPES.NEW_API,
      },
      {
        methodId: "new-api:daily-checkin",
        siteType: SITE_TYPES.MODELFLARE,
      },
      {
        methodId: "voapi-v2:daily-checkin",
        siteType: SITE_TYPES.VO_API_V2,
      },
    ]

    expect(legacyRegistrations).toHaveLength(expectedRegistrations.length)
    expect(legacyRegistrations).toEqual(
      expect.arrayContaining(expectedRegistrations),
    )
  })

  it.each(legacyRegistrations)(
    "maps $siteType to $methodId through pure legacy registry metadata",
    ({ methodId, siteType }) => {
      const account = createSiteAccount({
        site_type: siteType,
        disabled: true,
        checkIn: { enableDetection: true },
      })

      const migrated = migrateSiteAccountCheckInToV7(account, legacyResolver)

      expect(migrated.configVersion).toBe(7)
      expect(migrated.disabled).toBe(true)
      expect(migrated.checkIn.automaticExecutionEnabled).toBe(true)
      expect(migrated.checkIn.selection).toEqual({
        mode: "automatic",
        methodId,
      })
      expect(
        migrated.checkIn.methodKnowledge.methods[methodId]?.detection,
      ).toEqual({
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      })
    },
  )

  it("preserves disabled automatic execution, legacy daily status, and the complete custom object", () => {
    const customCheckIn = {
      url: "https://checkin.example.invalid",
      turnstilePreTrigger: {
        kind: "clickSelector" as const,
        selector: "#check-in",
        label: "Check in",
        throttle: { maxAttempts: 2, minIntervalMs: 100 },
      },
      redeemUrl: "https://redeem.example.invalid",
      openRedeemWithCheckIn: false,
      isCheckedInToday: true,
      lastCheckInDate: "2026-08-09",
    }
    const account = createSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: false,
        siteStatus: {
          isCheckedInToday: true,
          lastCheckInDate: "2026-08-10",
          lastDetectedAt: 123,
        },
        customCheckIn,
      },
    })

    const migrated = migrateSiteAccountCheckInToV7(account, legacyResolver)
    const methodId = migrated.checkIn.selection.methodId as CheckInMethodId

    expect(migrated.checkIn.automaticExecutionEnabled).toBe(false)
    expect(migrated.checkIn.customCheckIn).toEqual(customCheckIn)
    expect(migrated.checkIn.customCheckIn).not.toBe(customCheckIn)
    expect(migrated.checkIn.methodKnowledge.methods[methodId]?.status).toEqual({
      outcome: "known",
      today: "checked",
      evidence: {
        source: "legacy_migration",
        legacyObservedAt: 123,
        legacyDayKey: "2026-08-10",
      },
    })
    expect(migrated.updated_at).toBe(20)
    expect(migrated.user_updated_at).toBe(21)
  })

  it.each([false, undefined, "invalid"])(
    "does not turn enableDetection=%s into authoritative unsupported evidence",
    (enableDetection) => {
      const account = createSiteAccount({
        site_type: SITE_TYPES.NEW_API,
        checkIn: {
          enableDetection: enableDetection as boolean,
          siteStatus: { isCheckedInToday: false },
        },
      })

      const migrated = migrateSiteAccountCheckInToV7(account, legacyResolver)

      expect(migrated.checkIn.methodKnowledge.methods).toEqual({})
      expect(
        migrated.checkIn.methodKnowledge.lastFullDiscoveryAt,
      ).toBeUndefined()
      expect(migrated.checkIn.selection).toEqual({ mode: "automatic" })
    },
  )

  it("uses configVersion rather than stray partial V7 fields to identify legacy input", () => {
    const account = createSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      configVersion: 6,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: false,
        selection: { mode: "automatic", methodId: "new-api:daily-checkin" },
      } as any,
    })

    const migrated = migrateSiteAccountCheckInToV7(account, legacyResolver)

    expect(migrated.checkIn.automaticExecutionEnabled).toBe(false)
    expect(migrated.checkIn.selection).toEqual({ mode: "automatic" })
    expect(migrated.checkIn.methodKnowledge.methods).toEqual({})
  })

  it("retains legacy daily status without inventing an observation timestamp", () => {
    const account = createSiteAccount({
      site_type: SITE_TYPES.NEW_API,
      checkIn: {
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
      },
    })

    const migrated = migrateSiteAccountCheckInToV7(account, legacyResolver)
    const methodId = migrated.checkIn.selection.methodId as CheckInMethodId

    expect(migrated.checkIn.methodKnowledge.methods[methodId]?.status).toEqual({
      outcome: "known",
      today: "not_checked",
      evidence: { source: "legacy_migration" },
    })
  })

  it("is deterministic and idempotent while the runtime schema remains V6", () => {
    const account = createSiteAccount({
      site_type: SITE_TYPES.VELOERA,
      checkIn: {
        enableDetection: true,
        siteStatus: { isCheckedInToday: false },
      },
    })

    const first = migrateSiteAccountCheckInToV7(account, legacyResolver)
    const second = migrateSiteAccountCheckInToV7(account, legacyResolver)
    const repeated = migrateSiteAccountCheckInToV7(first, legacyResolver)

    expect(second).toEqual(first)
    expect(repeated).toEqual(first)
    expect(CURRENT_CONFIG_VERSION).toBe(7)
  })

  it("removes pre-V1 account flags from V7 normalization", () => {
    const account = createSiteAccount({
      configVersion: 7,
      can_check_in: true,
      supports_check_in: true,
      checkIn: {
        automaticExecutionEnabled: false,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      },
    })

    const normalized = migrateSiteAccountCheckInToV7(account, legacyResolver)

    expect(normalized).not.toHaveProperty("can_check_in")
    expect(normalized).not.toHaveProperty("supports_check_in")
  })

  it("activates V7 through the public account migration chain", () => {
    const migrated = migrateAccountConfig(
      createSiteAccount({
        site_type: SITE_TYPES.NEW_API,
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: false,
          siteStatus: { isCheckedInToday: true },
        },
      }) as unknown as SiteAccount,
    )

    expect(migrated.configVersion).toBe(7)
    expect(migrated.checkIn).toMatchObject({
      automaticExecutionEnabled: false,
      selection: {
        mode: "automatic",
        methodId: "new-api:daily-checkin",
      },
    })
    expect(migrated.checkIn).not.toHaveProperty("enableDetection")
    expect(migrated.checkIn).not.toHaveProperty("autoCheckInEnabled")
    expect(migrated.checkIn).not.toHaveProperty("siteStatus")
  })
})
