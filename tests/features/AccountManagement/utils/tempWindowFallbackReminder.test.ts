import { describe, expect, it } from "vitest"

import { getTempWindowFallbackIssue } from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import {
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type DisplaySiteData,
} from "~/types"

/**
 * Build a DisplaySiteData object with overrides for test scenarios.
 */
function makeSite(overrides: Partial<DisplaySiteData>): DisplaySiteData {
  return {
    id: "acc-1",
    name: "Example",
    username: "user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: {
      status: SiteHealthStatus.Healthy,
      reason: "ok",
    },
    siteType: "oneHub",
    baseUrl: "https://example.com",
    token: "token",
    userId: 1,
    authType: "access_token" as any,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

describe("tempWindowFallbackReminder", () => {
  it("returns null when there is no relevant health code", () => {
    const issue = getTempWindowFallbackIssue([
      makeSite({
        health: {
          status: SiteHealthStatus.Warning,
          reason: "other",
          code: undefined,
        },
      }),
    ])

    expect(issue).toBeNull()
  })

  it("returns an issue for TEMP_WINDOW_DISABLED and maps to refresh tab", () => {
    const issue = getTempWindowFallbackIssue([
      makeSite({
        id: "acc-2",
        name: "Relay",
        health: {
          status: SiteHealthStatus.Warning,
          reason: "disabled",
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
        },
      }),
    ])

    expect(issue).not.toBeNull()
    expect(issue?.settingsTab).toBe("refresh")
    expect(issue?.accountName).toBe("Relay")
  })

  it("returns an issue for TEMP_WINDOW_PERMISSION_REQUIRED and maps to permissions tab", () => {
    const issue = getTempWindowFallbackIssue([
      makeSite({
        id: "acc-3",
        name: "Relay",
        health: {
          status: SiteHealthStatus.Warning,
          reason: "perm",
          code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
        },
      }),
    ])

    expect(issue).not.toBeNull()
    expect(issue?.settingsTab).toBe("permissions")
  })
})
