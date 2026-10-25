import { describe, expect, it } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { calculateAccountStats } from "~/services/accounts/accountStorage/accountStatistics"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
  createDefaultAccountStorageConfig,
  createPersistedSiteAccount,
  normalizeAccountStorageConfigForRead,
  normalizeAccountStorageConfigForWrite,
  normalizeSiteAccount,
} from "~/services/accounts/editing/accountDefaults"
import { CURRENT_CONFIG_VERSION } from "~/services/accounts/migrations/accountDataMigration"
import type { AccountStorageConfig, SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"

describe("accountDefaults", () => {
  it("drops Requesty's legacy allowance projection while preserving its monetary balance", () => {
    const saved = createSiteAccount({ site_type: SITE_TYPES.REQUESTY })
    saved.account_info.quota = 6_250_000
    saved.account_info.nativeBalance = {
      unit: "USD",
      total: 12.5,
      permanent: 12.5,
      daily: 0,
      components: [{ kind: "permanent", amount: 12.5 }],
    }
    const normalized = normalizeSiteAccount(saved)
    expect(normalized.account_info.nativeBalance).toBeUndefined()
    expect(normalized.account_info.quota).toBe(6_250_000)
    expect(calculateAccountStats([normalized]).total_quota).toBe(6_250_000)
    expect(saved.account_info.nativeBalance?.total).toBe(12.5)
  })
  it.each([
    { site_url: "https://other.example" },
    { account_info: { id: "2" } },
    { site_type: SITE_TYPES.SUB2API },
  ])(
    "preserves an explicit replacement login when identity changes: %j",
    (identity) => {
      const login = {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "bob", password: " new secret " },
      }
      const changed = applySiteAccountUpdates({
        account: createSiteAccount({
          login: {
            methodId: ACCOUNT_LOGIN_METHODS.Password,
            credentials: { username: "alice", password: "old secret" },
          },
        }),
        updates: { ...identity, login },
        now: 20,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })
      expect(changed.login).toEqual(login)
    },
  )
  it("does not carry saved console passwords to a changed account origin or identity", () => {
    const saved = createSiteAccount({
      login: {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "alice", password: " secret " },
      },
    })
    for (const updates of [
      { site_url: "https://other.example" },
      { account_info: { id: "2" } },
      { site_type: SITE_TYPES.SUB2API },
    ]) {
      const changed = applySiteAccountUpdates({
        account: saved,
        updates,
        now: 20,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })
      expect(changed.login).toBeUndefined()
    }
    expect(normalizeSiteAccount(saved).login?.credentials).toEqual({
      username: "alice",
      password: " secret ",
    })
  })
  const createSiteAccount = (
    overrides: Partial<SiteAccount> = {},
  ): SiteAccount =>
    ({
      id: "test-account-1",
      site_name: "Test Site",
      site_url: "https://test.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.UNKNOWN,
      exchange_rate: 7,
      account_info: {
        id: "1",
        access_token: "token",
        username: "user",
        quota: 1000,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: 0,
      updated_at: 0,
      user_updated_at: 0,
      created_at: 0,
      notes: "",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      checkIn: {
        automaticExecutionEnabled: false,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" as const },
      },
      tagIds: [],
      ...overrides,
    }) as SiteAccount

  describe("normalizeAccountStorageConfigForRead", () => {
    it("defaults missing top-level collections and last_updated", () => {
      const normalized = normalizeAccountStorageConfigForRead(undefined, 123)
      expect(normalized).toEqual({
        accounts: [],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        deletedEntryRecords: {},
        last_updated: 123,
      })
    })

    it("preserves provided top-level collections", () => {
      const raw: AccountStorageConfig = {
        accounts: [createSiteAccount()],
        bookmarks: [] as any,
        pinnedAccountIds: ["a"],
        orderedAccountIds: ["b"],
        deletedEntryRecords: {},
        last_updated: 42,
      }

      expect(normalizeAccountStorageConfigForRead(raw, 999)).toEqual(raw)
    })

    it("drops reserved deletion marker ids into a null-prototype map", () => {
      const persistedDeletedEntryRecords = JSON.parse(`{
        "safe": {
          "kind": "account",
          "deletedAt": 200,
          "entryUpdatedAt": 100
        },
        "__proto__": {
          "kind": "account",
          "deletedAt": 201,
          "entryUpdatedAt": 101
        },
        "constructor": {
          "kind": "bookmark",
          "deletedAt": 202,
          "entryUpdatedAt": 102
        },
        "prototype": {
          "kind": "bookmark",
          "deletedAt": 203,
          "entryUpdatedAt": 103
        }
      }`)

      const normalized = normalizeAccountStorageConfigForRead(
        {
          deletedEntryRecords: persistedDeletedEntryRecords,
        } as any,
        999,
      )

      expect(Object.getPrototypeOf(normalized.deletedEntryRecords)).toBeNull()
      expect(normalized.deletedEntryRecords).toEqual({
        safe: {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
      })
      expect(({} as any).safe).toBeUndefined()
    })
  })

  describe("storage helpers", () => {
    it("creates the canonical default storage shape", () => {
      expect(createDefaultAccountStorageConfig(321)).toEqual({
        accounts: [],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        deletedEntryRecords: {},
        last_updated: 321,
      })
    })

    it("normalizes write payloads before persistence", () => {
      const normalized = normalizeAccountStorageConfigForWrite(
        {
          accounts: "bad" as any,
          bookmarks: [{ id: "bookmark-1" }] as any,
          pinnedAccountIds: "bad" as any,
          orderedAccountIds: ["ordered-1"],
          last_updated: 1,
        } as any,
        456,
      )

      expect(normalized).toEqual({
        accounts: [],
        bookmarks: [{ id: "bookmark-1" }],
        pinnedAccountIds: [],
        orderedAccountIds: ["ordered-1"],
        deletedEntryRecords: {},
        last_updated: 456,
      })
    })
  })

  describe("normalizeSiteAccount", () => {
    it.each([
      { unit: "quota", total: 1, asset: {} },
      {
        unit: "quota",
        total: Infinity,
        asset: {
          id: "token",
          label: "Token",
          displayScale: 1000000,
          displayLabel: "M Token",
        },
      },
    ])("drops malformed native quota balances %j", (nativeBalance) => {
      const source = createSiteAccount()
      expect(
        normalizeSiteAccount({
          ...source,
          account_info: {
            ...source.account_info,
            nativeBalance:
              nativeBalance as typeof source.account_info.nativeBalance,
          },
        }).account_info.nativeBalance,
      ).toBeUndefined()
    })
    it("preserves signed atomic token balances", () => {
      const asset = {
        id: "https://emrank.tech/token",
        label: "Token",
        displayScale: 1000000,
        displayLabel: "M Token",
      }
      const source = createSiteAccount({ site_type: "emrank" })
      source.account_info.nativeBalance = {
        unit: "quota",
        asset,
        total: -1234567,
      }
      expect(normalizeSiteAccount(source).account_info.nativeBalance).toEqual(
        source.account_info.nativeBalance,
      )
    })

    it("normalizes timed allowance details with the same validation as components", () => {
      const source = createSiteAccount()
      const details = [
        { amount: 2 },
        null,
        { kind: "unknown", amount: 2 },
        { kind: "timed", amount: Infinity },
        {
          kind: "timed",
          amount: 2,
          name: 123,
          scope: null,
          unlockedModels: [null, "gpt-4o"],
          unlimited: "true",
          expiresAt: "2099-01-01",
          resetAt: 123,
        },
      ]
      source.account_info.nativeBalance = {
        unit: "USD",
        total: 2,
        permanent: 0,
        daily: 2,
        timedDetails: details,
        components: details,
      } as unknown as NonNullable<SiteAccount["account_info"]["nativeBalance"]>
      const normalized = normalizeSiteAccount(source).account_info.nativeBalance
      expect(normalized).toMatchObject({
        timedDetails: [
          {
            kind: "timed",
            amount: 2,
            unlockedModels: ["gpt-4o"],
            expiresAt: "2099-01-01",
          },
        ],
      })
      if (normalized?.unit !== "USD") throw new Error("Expected USD allowances")
      expect(normalized.timedDetails).toEqual(normalized.components)
      expect(normalized.timedDetails?.[0]).toMatchObject({
        name: undefined,
        scope: undefined,
        unlimited: undefined,
        resetAt: undefined,
      })
    })

    it("retains scoped USD allowances through storage normalization", () => {
      const source = createSiteAccount()
      source.account_info.nativeBalance = {
        unit: "USD",
        total: 6,
        permanent: 1,
        daily: 2,
        components: [
          { kind: "permanent", amount: 1 },
          { kind: "timed", amount: 2 },
          {
            kind: "subscription",
            amount: 3,
            name: "Monthly",
            scope: "premium-only",
            unlockedModels: ["gpt-4o"],
            expiresAt: "2099-01-01",
          },
          { kind: "group", amount: 4, scope: "premium" },
        ],
      }
      expect(
        normalizeSiteAccount(source).account_info.nativeBalance,
      ).toMatchObject(source.account_info.nativeBalance)
    })

    it("retains native credits across storage normalization and refresh updates", () => {
      const source = createSiteAccount()
      source.account_info.nativeBalance = {
        unit: "credits",
        total: 36000,
        permanent: 34000,
        daily: 2000,
      }
      const normalized = normalizeSiteAccount(source)
      expect(normalized.account_info.nativeBalance).toEqual(
        source.account_info.nativeBalance,
      )
      const refreshed = applySiteAccountUpdates({
        account: normalized,
        updates: {
          account_info: {
            nativeBalance: {
              unit: "credits",
              total: 34000,
              permanent: 34000,
              daily: 0,
            },
          },
        },
        now: 12345,
        userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
      })
      expect(refreshed.account_info.nativeBalance).toEqual({
        unit: "credits",
        total: 34000,
        permanent: 34000,
        daily: 0,
      })
    })
    it("retains token allowances through account normalization without treating them as request counts", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          account_info: {
            ...createSiteAccount().account_info,
            subscription: {
              name: "Dahl",
              billingType: "tokens",
              remainingTokens: 100000000,
              isActive: true,
            },
          },
        }),
      )
      expect(normalized.account_info.subscription?.remainingTokens).toBe(
        100000000,
      )
      expect(
        normalized.account_info.subscription?.remainingCount,
      ).toBeUndefined()
    })
    it("normalizes V7 check-in config without retaining legacy runtime fields", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          configVersion: 7,
          checkIn: {
            automaticExecutionEnabled: false,
            methodKnowledge: { methods: {} },
            selection: { mode: "automatic" as const },
            enableDetection: true,
            autoCheckInEnabled: true,
            siteStatus: { isCheckedInToday: true },
          } as any,
        }),
      )

      expect(normalized.checkIn).toEqual({
        automaticExecutionEnabled: false,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" as const },
      })
    })

    it("drops legacy identity provenance from persisted account info", () => {
      const legacy = createSiteAccount({
        account_info: {
          ...createSiteAccount().account_info,
          identity_scope: "local",
        } as unknown as SiteAccount["account_info"],
      })

      expect(normalizeSiteAccount(legacy).account_info).not.toHaveProperty(
        "identity_scope",
      )
    })

    it("drops legacy account-level check-in capability flags", () => {
      const legacy = createSiteAccount() as SiteAccount & {
        can_check_in?: boolean
        supports_check_in?: boolean
      }
      legacy.can_check_in = true
      legacy.supports_check_in = true

      const normalized = normalizeSiteAccount(legacy)

      expect(normalized).not.toHaveProperty("can_check_in")
      expect(normalized).not.toHaveProperty("supports_check_in")
    })

    it("preserves legacy numeric statistics without inventing availability", () => {
      const legacy = createSiteAccount({
        account_info: {
          ...createSiteAccount().account_info,
          today_quota_consumption: 123,
        },
      })

      const normalized = normalizeSiteAccount(legacy)

      expect(normalized.account_info.today_quota_consumption).toBe(123)
      expect(normalized.account_info.todayStatsAvailability).toBeUndefined()
    })

    it("normalizes malformed explicit availability closed and preserves valid groups", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          account_info: {
            ...createSiteAccount().account_info,
            todayStatsAvailability: {
              consumption: {
                status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
                reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
              },
              requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
              tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
              income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
            },
          },
        }),
      )

      expect(normalized.account_info.todayStatsAvailability).toEqual({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
        },
        requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      })
    })
    it("applies backward-compatible defaults for missing additive fields", () => {
      const legacy = createSiteAccount()
      delete (legacy as any).disabled
      delete (legacy as any).excludeFromTotalBalance
      delete (legacy as any).excludeFromTodayIncome
      delete (legacy as any).tagIds
      delete (legacy as any).tags
      delete (legacy as any).checkIn
      delete (legacy as any).notes

      const normalized = normalizeSiteAccount(legacy as any)

      expect(normalized.disabled).toBe(false)
      expect(normalized.excludeFromTotalBalance).toBe(false)
      expect(normalized.excludeFromTodayIncome).toBe(false)
      expect(normalized.tagIds).toEqual([])
      expect(normalized.tags).toBeUndefined()
      expect(normalized.notes).toBe("")
      expect(normalized.checkIn).toEqual({
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      })
    })

    it("falls back legacy user update timestamp to updated_at", () => {
      const legacy = createSiteAccount({
        updated_at: 123,
      })
      delete (legacy as any).user_updated_at

      const normalized = normalizeSiteAccount(legacy as any)

      expect(normalized.updated_at).toBe(123)
      expect(normalized.user_updated_at).toBe(123)
    })

    it("preserves explicit values over defaults", () => {
      const account = createSiteAccount({
        disabled: true,
        excludeFromTotalBalance: true,
        excludeFromTodayIncome: true,
        tagIds: ["t1"],
        tags: ["Legacy"],
        checkIn: {
          automaticExecutionEnabled: false,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" },
        },
        notes: "hello",
        updated_at: 456,
        user_updated_at: 123,
      })

      const normalized = normalizeSiteAccount(account)

      expect(normalized.disabled).toBe(true)
      expect(normalized.excludeFromTotalBalance).toBe(true)
      expect(normalized.excludeFromTodayIncome).toBe(true)
      expect(normalized.tagIds).toEqual(["t1"])
      expect(normalized.tags).toEqual(["Legacy"])
      expect(normalized.checkIn.automaticExecutionEnabled).toBe(false)
      expect(normalized.checkIn.selection).toEqual({ mode: "automatic" })
      expect(normalized.notes).toBe("hello")
      expect(normalized.updated_at).toBe(456)
      expect(normalized.user_updated_at).toBe(123)
    })

    it("preserves known legacy auth modes independently of current site policy", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          site_type: SITE_TYPES.SHAREDCHAT,
          authType: AuthTypeEnum.AccessToken,
        }),
      )

      expect(normalized.site_type).toBe(SITE_TYPES.SHAREDCHAT)
      expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    })

    it("canonicalizes AIHubMix accounts to the console web origin", () => {
      const normalized = normalizeSiteAccount(
        createSiteAccount({
          site_type: SITE_TYPES.AIHUBMIX,
          site_url: "https://aihubmix.com/statistics?tab=detail",
        }),
      )

      expect(normalized.site_url).toBe("https://console.aihubmix.com")
    })

    it("coerces invalid persisted values to stable defaults", () => {
      const normalized = normalizeSiteAccount({
        ...createSiteAccount(),
        site_type: "",
        exchange_rate: "bad" as any,
        authType: "invalid-auth" as any,
        account_info: {
          ...createSiteAccount().account_info,
          id: 12 as any,
          quota: "15" as any,
          today_income: "invalid" as any,
        },
        health: {
          status: "invalid-status" as any,
          reason: 123 as any,
          code: "UNHEALTHY" as any,
        },
        checkIn: {
          enableDetection: 1 as any,
          customCheckIn: {
            url: "https://checkin.example",
          },
        } as any,
        tagIds: [" first ", "", 2 as any, "second"],
        tags: "legacy" as any,
      } as any)

      expect(normalized.site_type).toBe(SITE_TYPES.UNKNOWN)
      expect(normalized.exchange_rate).toBe(DEFAULT_USD_TO_CNY_RATE)
      expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
      expect(normalized.account_info.id).toBe("12")
      expect(normalized.account_info.quota).toBe(15)
      expect(normalized.account_info.today_income).toBe(0)
      expect(normalized.health.status).toBe(SiteHealthStatus.Unknown)
      expect(normalized.health.reason).toBeUndefined()
      expect(normalized.health.code).toBe("UNHEALTHY")
      expect(normalized.checkIn.automaticExecutionEnabled).toBe(true)
      expect(normalized.checkIn.methodKnowledge.methods).toEqual({})
      expect(normalized.checkIn.customCheckIn?.openRedeemWithCheckIn).toBe(true)
      expect(normalized.tagIds).toEqual(["first", "second"])
      expect(normalized.tags).toBeUndefined()
    })

    it("preserves string account identity and normalizes legacy numeric ids to strings", () => {
      expect(
        normalizeSiteAccount(
          createSiteAccount({
            account_info: {
              ...createSiteAccount().account_info,
              id: "aihubmix-user" as any,
            },
          }),
        ).account_info.id,
      ).toBe("aihubmix-user")

      expect(
        normalizeSiteAccount(
          createSiteAccount({
            account_info: {
              ...createSiteAccount().account_info,
              id: 42 as any,
            },
          }),
        ).account_info.id,
      ).toBe("42")
    })
  })

  describe("createPersistedSiteAccount", () => {
    it("applies generated ids and timestamps while normalizing nested fields", () => {
      const {
        id: _legacyId,
        created_at: _legacyCreatedAt,
        updated_at: _legacyUpdatedAt,
        user_updated_at: _legacyUserUpdatedAt,
        ...account
      } = createSiteAccount({
        id: "legacy-id" as any,
        created_at: 1 as any,
        updated_at: 2 as any,
        user_updated_at: 3 as any,
        notes: undefined as any,
        checkIn: {
          enableDetection: true,
          customCheckIn: { url: "https://checkin.example" },
        } as any,
        tagIds: [" tag-a ", ""],
      })
      void _legacyId
      void _legacyCreatedAt
      void _legacyUpdatedAt
      void _legacyUserUpdatedAt

      const created = createPersistedSiteAccount({
        id: "persisted-id",
        now: 777,
        account,
      })

      expect(created.id).toBe("persisted-id")
      expect(created.created_at).toBe(777)
      expect(created.updated_at).toBe(777)
      expect(created.user_updated_at).toBe(777)
      expect(created.configVersion).toBe(CURRENT_CONFIG_VERSION)
      expect(created.notes).toBe("")
      expect(created.tagIds).toEqual(["tag-a"])
      expect(created.checkIn.customCheckIn?.openRedeemWithCheckIn).toBe(true)
    })
  })

  describe("applySiteAccountUpdates", () => {
    it.each([true, false])(
      "clears native credits only when an update explicitly removes them (%s)",
      (explicitRemoval) => {
        const account = createSiteAccount()
        account.account_info.nativeBalance = {
          unit: "credits",
          total: 30,
          permanent: 20,
          daily: 10,
        }
        const updated = applySiteAccountUpdates({
          account,
          updates: {
            account_info: {
              quota: 5000,
              ...(explicitRemoval ? { nativeBalance: undefined } : {}),
            },
          },
          now: 100,
          userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
        })
        if (explicitRemoval) {
          expect(updated.account_info).not.toHaveProperty("nativeBalance")
        } else {
          expect(updated.account_info.nativeBalance).toEqual(
            account.account_info.nativeBalance,
          )
        }
        expect(updated.account_info.quota).toBe(5000)
        expect(account.account_info.nativeBalance?.total).toBe(30)
      },
    )
    it("deep merges nested updates and preserves sibling fields", () => {
      const current = createSiteAccount({
        checkIn: {
          automaticExecutionEnabled: true,
          methodKnowledge: {
            methods: {
              "new-api:daily-checkin": {
                detection: {
                  outcome: "matched",
                  evidence: { source: "compatibility_registration" },
                },
                status: {
                  outcome: "known",
                  today: "not_checked",
                  evidence: { source: "probe", observedAt: 123 },
                },
              },
            },
          },
          selection: {
            mode: "automatic",
            methodId: "new-api:daily-checkin",
          },
        },
      })

      const updated = applySiteAccountUpdates({
        account: current as any,
        updates: {
          checkIn: {
            methodKnowledge: {
              methods: {
                "new-api:daily-checkin": {
                  status: {
                    outcome: "known",
                    today: "checked",
                    evidence: { source: "probe", observedAt: 123 },
                  },
                },
              },
            },
          },
        },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(
        updated.checkIn.methodKnowledge.methods["new-api:daily-checkin"]
          ?.status,
      ).toMatchObject({
        outcome: "known",
        today: "checked",
        evidence: { source: "probe", observedAt: 123 },
      })
      expect(
        updated.checkIn.methodKnowledge.methods["new-api:daily-checkin"]
          ?.detection,
      ).toEqual({
        outcome: "matched",
        evidence: { source: "compatibility_registration" },
      })
    })

    it("replaces arrays instead of concatenating", () => {
      const current = createSiteAccount({ tagIds: ["a"] })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { tagIds: ["b"] },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(updated.tagIds).toEqual(["b"])
    })

    it("removes custom check-in when the update explicitly clears it", () => {
      const current = createSiteAccount({
        checkIn: {
          ...createSiteAccount().checkIn,
          customCheckIn: { url: "https://example.invalid/check-in" },
        },
      })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { checkIn: { customCheckIn: undefined } },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(updated.checkIn.customCheckIn).toBeUndefined()
    })

    it("advances user update timestamp when requested", () => {
      const current = createSiteAccount({
        updated_at: 111,
        user_updated_at: 100,
      })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { notes: "manual" },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(updated.updated_at).toBe(999)
      expect(updated.user_updated_at).toBe(999)
    })

    it("can preserve user update timestamp for automated updates", () => {
      const current = createSiteAccount({
        updated_at: 111,
        user_updated_at: 100,
      })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { last_sync_time: 999 },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
      })

      expect(updated.updated_at).toBe(999)
      expect(updated.user_updated_at).toBe(100)
    })

    it("handles legacy stored accounts missing additive fields during partial update", () => {
      const legacy = createSiteAccount()
      delete (legacy as any).tagIds
      delete (legacy as any).checkIn
      delete (legacy as any).user_updated_at

      const updated = applySiteAccountUpdates({
        account: legacy as any,
        updates: { notes: "updated" },
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(updated.notes).toBe("updated")
      expect(updated.tagIds).toEqual([])
      expect(updated.checkIn).toEqual({
        automaticExecutionEnabled: true,
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" },
      })
      expect(updated.user_updated_at).toBe(999)
    })

    it("preserves explicit cleanup semantics for health.code when update sets it to undefined", () => {
      const current = createSiteAccount({
        health: {
          status: SiteHealthStatus.Warning,
          reason: "needs attention",
          code: "TEMP_WINDOW_DISABLED" as any,
        },
      })

      const updated = applySiteAccountUpdates({
        account: current,
        updates: { health: { code: undefined } } as any,
        now: 999,
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
      })

      expect(updated.health.code).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(updated.health, "code")).toBe(
        false,
      )
      expect(JSON.stringify(updated.health)).not.toContain("code")
    })
  })
})
