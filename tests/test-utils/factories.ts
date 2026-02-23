/**
 * Test factories for generating safe, non-secret-like values.
 *
 * IMPORTANT:
 * - Do not embed realistic-looking secrets (e.g. `sk-...`) as string literals.
 * - Keep values deterministic to avoid brittle snapshots/expectations.
 */

import type {
  AccountShareSnapshotPayload,
  OverviewShareSnapshotPayload,
  ShareSnapshotPayload,
} from "~/services/shareSnapshots/types"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

/**
 * Build a dummy API key used by Web AI API Check tests.
 */
export function buildApiKey(): string {
  return "test-api-key"
}

/**
 * Build a clipboard payload that the content script can extract credentials from.
 */
export function buildApiCheckClipboardText(params?: {
  baseUrl?: string
  apiKey?: string
}): string {
  const baseUrl = params?.baseUrl ?? "https://proxy.example.com/api/v1"
  const apiKey = params?.apiKey ?? buildApiKey()

  return [`Base URL: ${baseUrl}`, `API Key: ${apiKey}`].join("\n")
}

/**
 * Build a share snapshot payload with deterministic, non-secret-like values.
 */
export function buildShareSnapshotPayload(
  overrides:
    | (Partial<AccountShareSnapshotPayload> & { kind?: "account" })
    | (Partial<OverviewShareSnapshotPayload> & { kind: "overview" }) = {},
): ShareSnapshotPayload {
  if (overrides.kind === "overview") {
    const base: OverviewShareSnapshotPayload = {
      kind: "overview",
      currencyType: "USD",
      enabledAccountCount: 2,
      totalBalance: 123.45,
      asOf: 1700000000000,
      backgroundSeed: 1,
    }

    return { ...base, ...overrides, kind: "overview" }
  }

  const base: AccountShareSnapshotPayload = {
    kind: "account",
    currencyType: "USD",
    siteName: "Example Site",
    originUrl: "https://example.com",
    balance: 12.34,
    asOf: 1700000000000,
    backgroundSeed: 1,
  }

  return { ...base, ...overrides, kind: "account" }
}

/**
 * Build a minimal `DisplaySiteData` fixture with sensible defaults for UI tests.
 */
export function buildDisplaySiteData(
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  const base: DisplaySiteData = {
    id: "account-1",
    name: "Test Account",
    username: "test-user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "test",
    baseUrl: "https://example.com",
    token: "test-token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
  }

  return {
    ...base,
    ...overrides,
    checkIn: {
      ...base.checkIn,
      ...overrides.checkIn,
    },
  }
}
