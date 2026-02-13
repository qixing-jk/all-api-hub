import { describe, expect, it } from "vitest"

import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"

describe("userPreferences", () => {
  describe("DEFAULT_PREFERENCES", () => {
    it("has correct default values", () => {
      expect(DEFAULT_PREFERENCES.currencyType).toBe("USD")
      expect(DEFAULT_PREFERENCES.activeTab).toBe(DATA_TYPE_CASHFLOW)
      expect(DEFAULT_PREFERENCES.sortField).toBe(DATA_TYPE_BALANCE)
      expect(DEFAULT_PREFERENCES.sortOrder).toBe("desc")
      expect(DEFAULT_PREFERENCES.showTodayCashflow).toBe(true)
      expect(DEFAULT_PREFERENCES.showHealthStatus).toBe(true)
      expect(DEFAULT_PREFERENCES.themeMode).toBe("system")
      expect(DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd).toBe(true)
      expect(DEFAULT_PREFERENCES.balanceHistory?.enabled).toBe(false)
      expect(DEFAULT_PREFERENCES.balanceHistory?.endOfDayCapture.enabled).toBe(
        false,
      )
      expect(DEFAULT_PREFERENCES.balanceHistory?.retentionDays).toBe(365)
      expect(DEFAULT_PREFERENCES.redemptionAssist?.enabled).toBe(true)
      expect(DEFAULT_PREFERENCES.redemptionAssist?.relaxedCodeValidation).toBe(
        true,
      )
      expect(DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist).toBeDefined()
      expect(DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist.enabled).toBe(
        true,
      )
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist
          .includeAccountSiteUrls,
      ).toBe(true)
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist
          .includeCheckInAndRedeemUrls,
      ).toBe(true)
      expect(
        DEFAULT_PREFERENCES.redemptionAssist?.urlWhitelist.patterns,
      ).toEqual(["cdk.linux.do"])
      expect(DEFAULT_PREFERENCES.tempWindowFallbackReminder?.dismissed).toBe(
        false,
      )
    })

    it("has valid accountAutoRefresh config", () => {
      expect(DEFAULT_PREFERENCES.accountAutoRefresh).toBeDefined()
      expect(DEFAULT_PREFERENCES.accountAutoRefresh).toEqual(
        DEFAULT_ACCOUNT_AUTO_REFRESH,
      )
      expect(DEFAULT_PREFERENCES.accountAutoRefresh.interval).toBeGreaterThan(0)
    })

    it("has valid webdav config", () => {
      expect(DEFAULT_PREFERENCES.webdav).toBeDefined()
      expect(DEFAULT_PREFERENCES.webdav.autoSync).toBe(false)
    })

    it("has valid managedSite config", () => {
      expect(DEFAULT_PREFERENCES.newApi).toBeDefined()
      expect(DEFAULT_PREFERENCES.newApi.baseUrl).toBe("")
    })
  })
})
