/** Pure-local fixture accounts for exercising list/stats/empty-state UIs. */

import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountSiteType } from "~/constants/siteType"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type HealthStatus,
  type SiteAccount,
} from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("DevFixtureAccounts")

/** Notes prefix that marks an account as generated fixture data. */
export const DEV_FIXTURE_NOTES_MARKER = "[dev-fixture]"

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

const buildFixtureAccountData = (
  index: number,
  now: number,
): FixtureAccountData => {
  const serial = String(index + 1).padStart(2, "0")
  const variant = FIXTURE_VARIANTS[index % FIXTURE_VARIANTS.length]

  return {
    site_name: `Dev Fixture ${serial}`,
    site_url: `https://fixture-${serial}.local`,
    // "unknown" avoids site-profile URL normalization so fixture hosts persist as-is.
    site_type: "unknown" as AccountSiteType,
    exchange_rate: DEFAULT_USD_TO_CNY_RATE,
    notes: `${DEV_FIXTURE_NOTES_MARKER} ${variant.label}`,
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
    last_sync_time: now,
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

/** Counts persisted accounts created by the fixture generator. */
export async function countDevFixtureAccounts(): Promise<number> {
  try {
    const accounts = await accountQueries.getAllAccounts()
    return accounts.filter((account) =>
      account.notes.startsWith(DEV_FIXTURE_NOTES_MARKER),
    ).length
  } catch (error) {
    logger.warn("Failed to count dev fixture accounts", error)
    return 0
  }
}

/** Persists `count` fixture accounts locally without any network activity. */
export async function addDevFixtureAccounts(count: number): Promise<number> {
  const now = Date.now()
  const existing = await accountQueries.getAllAccounts()
  const startIndex = existing.filter((account) =>
    account.notes.startsWith(DEV_FIXTURE_NOTES_MARKER),
  ).length

  let added = 0
  for (let offset = 0; offset < count; offset += 1) {
    try {
      await accountMutations.addAccount(
        buildFixtureAccountData(startIndex + offset, now + ONE_DAY_MS),
      )
      added += 1
    } catch (error) {
      logger.error("Failed to add dev fixture account", error)
      break
    }
  }
  return added
}

/** Deletes every persisted fixture account, leaving real accounts untouched. */
export async function clearDevFixtureAccounts(): Promise<number> {
  const accounts = await accountQueries.getAllAccounts()
  const fixtureIds = accounts
    .filter((account) => account.notes.startsWith(DEV_FIXTURE_NOTES_MARKER))
    .map((account) => account.id)

  if (fixtureIds.length === 0) {
    return 0
  }

  const { deletedCount } = await accountMutations.deleteAccounts(fixtureIds)
  return deletedCount
}
