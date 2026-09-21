/** Pure-local fixture accounts for exercising list/stats/empty-state UIs. */

import { Storage } from "@plasmohq/storage"

import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountSiteType } from "~/constants/siteType"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type HealthStatus,
  type SiteAccount,
} from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("DevFixtureAccounts")

/**
 * Notes label written on generated accounts so they read as fixture data in
 * the UI. Identification for cleanup uses the persisted id registry instead,
 * because notes are user-editable.
 */
export const DEV_FIXTURE_NOTES_LABEL = "dev fixture"

type FixtureAccountData = Omit<
  SiteAccount,
  "id" | "created_at" | "updated_at" | "user_updated_at"
>

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Quota per USD used by New-API-style sites; balances stay readable in tests. */
const QUOTA_PER_USD = 500_000

interface FixtureVariant {
  label: string
  health: HealthStatus
  quota: number
  disabled: boolean
  excludeFromTotalBalance: boolean
  excludeFromTodayIncome: boolean
}

const FIXTURE_VARIANTS: readonly FixtureVariant[] = [
  {
    label: "healthy",
    health: { status: SiteHealthStatus.Healthy },
    quota: 100 * QUOTA_PER_USD,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
  },
  {
    label: "warning",
    health: { status: SiteHealthStatus.Warning, reason: "dev fixture warning" },
    quota: 32 * QUOTA_PER_USD,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
  },
  {
    label: "zero-balance",
    health: { status: SiteHealthStatus.Healthy },
    quota: 0,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
  },
  {
    label: "disabled",
    health: { status: SiteHealthStatus.Healthy },
    quota: 55 * QUOTA_PER_USD,
    disabled: true,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
  },
  {
    label: "excluded-total",
    health: { status: SiteHealthStatus.Healthy },
    quota: 75 * QUOTA_PER_USD,
    disabled: false,
    excludeFromTotalBalance: true,
    excludeFromTodayIncome: false,
  },
  {
    label: "error",
    health: {
      status: SiteHealthStatus.Error,
      reason: "dev fixture unreachable",
    },
    quota: 10 * QUOTA_PER_USD,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: true,
  },
]

/**
 * Persisted ids of generated fixture accounts.
 *
 * Cleanup and counting read this registry rather than matching editable account
 * fields, so a renamed fixture stays removable and a real account whose notes
 * happen to look similar is never deleted.
 */
class DevFixtureAccountRegistry {
  private storage = new Storage({ area: "local" })

  async read(): Promise<string[]> {
    try {
      const raw = (await this.storage.get(
        STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS,
      )) as unknown

      if (!Array.isArray(raw)) {
        return []
      }

      return raw.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    } catch (error) {
      logger.warn("Failed to read dev fixture account registry", error)
      return []
    }
  }

  async write(ids: string[]): Promise<string[]> {
    const unique = Array.from(new Set(ids))
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.DEV_FIXTURE_ACCOUNTS,
      () => this.storage.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, unique),
    )
    return unique
  }

  async add(ids: string[]): Promise<string[]> {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.DEV_FIXTURE_ACCOUNTS,
      async () => {
        const existing = await this.read()
        const unique = Array.from(new Set([...existing, ...ids]))
        await this.storage.set(STORAGE_KEYS.DEV_FIXTURE_ACCOUNT_IDS, unique)
        return unique
      },
    )
  }
}

const fixtureAccountRegistry = new DevFixtureAccountRegistry()

/** Reads registered fixture ids that still exist in account storage. */
async function readLiveFixtureAccounts(): Promise<SiteAccount[]> {
  const [ids, accounts] = await Promise.all([
    fixtureAccountRegistry.read(),
    accountQueries.getAllAccounts(),
  ])
  const idSet = new Set(ids)
  return accounts.filter((account) => idSet.has(account.id))
}

const buildFixtureAccountData = (
  index: number,
  now: number,
): FixtureAccountData => {
  const serial = String(index + 1).padStart(2, "0")
  const variant = FIXTURE_VARIANTS[index % FIXTURE_VARIANTS.length]
  if (!variant) {
    throw new Error("FIXTURE_VARIANTS must define at least one variant")
  }

  // Ages vary backwards from now so freshness and relative-time states are
  // realistic; a future timestamp would make every fixture look "just synced".
  const lastSyncTime = now - (index + 1) * ONE_DAY_MS

  return {
    site_name: `Dev Fixture ${serial}`,
    site_url: `https://fixture-${serial}.local`,
    // "unknown" avoids site-profile URL normalization so fixture hosts persist as-is.
    site_type: "unknown" as AccountSiteType,
    exchange_rate: DEFAULT_USD_TO_CNY_RATE,
    notes: `${DEV_FIXTURE_NOTES_LABEL}: ${variant.label}`,
    tagIds: [],
    disabled: variant.disabled,
    excludeFromTotalBalance: variant.excludeFromTotalBalance,
    excludeFromTodayIncome: variant.excludeFromTodayIncome,
    authType: AuthTypeEnum.AccessToken,
    // Background automations never see a real endpoint; keep check-in off.
    checkIn: {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
    },
    health: variant.health,
    last_sync_time: lastSyncTime,
    account_info: {
      id: `dev-fixture-user-${serial}`,
      access_token: `dev-fixture-token-${serial}`,
      username: `dev_fixture_${serial}`,
      quota: variant.quota,
      today_prompt_tokens: (index + 1) * 1200,
      today_completion_tokens: (index + 1) * 800,
      today_quota_consumption: (index + 1) * 2 * QUOTA_PER_USD,
      today_requests_count: (index + 1) * 7,
      today_income: (index + 1) * 3 * QUOTA_PER_USD,
    },
  }
}

/** Counts registered fixture accounts that still exist. */
export async function countDevFixtureAccounts(): Promise<number> {
  try {
    return (await readLiveFixtureAccounts()).length
  } catch (error) {
    logger.warn("Failed to count dev fixture accounts", error)
    return 0
  }
}

/** Persists `count` fixture accounts locally without any network activity. */
export async function addDevFixtureAccounts(count: number): Promise<number> {
  const now = Date.now()
  const existingCount = await countDevFixtureAccounts()

  const addedIds: string[] = []
  for (let offset = 0; offset < count; offset += 1) {
    try {
      const accountId = await accountMutations.addAccount(
        buildFixtureAccountData(existingCount + offset, now),
      )
      addedIds.push(accountId)
    } catch (error) {
      logger.error("Failed to add dev fixture account", error)
      break
    }
  }

  if (addedIds.length > 0) {
    await fixtureAccountRegistry.add(addedIds)
  }
  return addedIds.length
}

/** Deletes every registered fixture account, leaving real accounts untouched. */
export async function clearDevFixtureAccounts(): Promise<number> {
  const fixtureAccounts = await readLiveFixtureAccounts()
  const fixtureIds = fixtureAccounts.map((account) => account.id)

  if (fixtureIds.length === 0) {
    // Drop stale ids (fixtures deleted elsewhere) so the count cannot drift.
    await fixtureAccountRegistry.write([])
    return 0
  }

  const { deletedCount } = await accountMutations.deleteAccounts(fixtureIds)
  const deletedIdSet = new Set(fixtureIds)
  const remaining = (await fixtureAccountRegistry.read()).filter(
    (id) => !deletedIdSet.has(id),
  )
  await fixtureAccountRegistry.write(remaining)
  return deletedCount
}
