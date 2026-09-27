import userEvent from "@testing-library/user-event"
import type { ComponentType } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "wxt/browser"

import { SITE_TYPES } from "~/constants/siteType"
import AutoFill from "~/features/BasicSettings/components/tabs/AccountManagement/AutoFillCurrentSiteUrlOnAccountAddSettings"
import AutoProvision from "~/features/BasicSettings/components/tabs/AccountManagement/AutoProvisionKeyOnAccountAddSettings"
import Duplicate from "~/features/BasicSettings/components/tabs/AccountManagement/DuplicateAccountWarningOnAddSettings"
import BalanceHistory from "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistorySettings"
import Redemption from "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings"
import ActionClick from "~/features/BasicSettings/components/tabs/General/ActionClickBehaviorSettings"
import Changelog from "~/features/BasicSettings/components/tabs/General/ChangelogOnUpdateSettings"
import Logging from "~/features/BasicSettings/components/tabs/General/LoggingSettings"
import ManagedSite from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteSelector"
import Refresh from "~/features/BasicSettings/components/tabs/Refresh/RefreshSettings"
import WebAi from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const cases: {
  name: string
  Component: ComponentType
  changes: Partial<UserPreferences>
  confirmed?: boolean
}[] = [
  {
    name: "balance history",
    Component: BalanceHistory,
    confirmed: true,
    changes: {
      balanceHistory: {
        ...DEFAULT_PREFERENCES.balanceHistory!,
        enabled: false,
        retentionDays: DEFAULT_PREFERENCES.balanceHistory!.retentionDays + 1,
      },
    },
  },
  {
    name: "current site URL",
    Component: AutoFill,
    changes: { autoFillCurrentSiteUrlOnAccountAdd: false },
  },
  {
    name: "duplicate warning",
    Component: Duplicate,
    changes: { warnOnDuplicateAccountAdd: false },
  },
  {
    name: "automatic keys",
    Component: AutoProvision,
    changes: {
      autoProvisionKeyOnAccountAdd: true,
      autoProvisionKeyOnAccountAddMode: "all-groups",
    },
  },
  {
    name: "toolbar action",
    Component: ActionClick,
    changes: { actionClickBehavior: "sidepanel" },
  },
  {
    name: "changelog",
    Component: Changelog,
    changes: { openChangelogOnUpdate: false },
  },
  {
    name: "logging",
    Component: Logging,
    changes: { logging: { ...DEFAULT_PREFERENCES.logging, level: "error" } },
  },
  {
    name: "managed site",
    Component: ManagedSite,
    changes: { managedSiteType: SITE_TYPES.VELOERA },
  },
  {
    name: "refresh",
    Component: Refresh,
    changes: {
      accountAutoRefresh: {
        ...DEFAULT_PREFERENCES.accountAutoRefresh,
        enabled: true,
        interval: 1800,
        minInterval: 300,
      },
    },
  },
  {
    name: "redemption patterns",
    Component: Redemption,
    confirmed: true,
    changes: {
      redemptionAssist: {
        ...DEFAULT_PREFERENCES.redemptionAssist!,
        urlWhitelist: {
          ...DEFAULT_PREFERENCES.redemptionAssist!.urlWhitelist,
          patterns: ["https://example.com/*"],
        },
      },
    },
  },
  {
    name: "API detection patterns",
    Component: WebAi,
    confirmed: true,
    changes: {
      webAiApiCheck: {
        ...DEFAULT_PREFERENCES.webAiApiCheck!,
        keyCleanup: {
          ...DEFAULT_PREFERENCES.webAiApiCheck!.keyCleanup,
          removalPatterns: ["prefix-"],
        },
      },
    },
  },
]

describe("settings reset persistence", () => {
  beforeEach(() => {
    vi.spyOn(browser.runtime, "sendMessage").mockImplementation((async () => ({
      success: true,
    })) as typeof browser.runtime.sendMessage)
  })
  it.each(cases)(
    "restores $name defaults and preserves unrelated settings",
    async ({ Component, changes, confirmed }) => {
      const user = userEvent.setup()
      await userPreferences.savePreferences({
        ...structuredClone(DEFAULT_PREFERENCES),
        ...changes,
        currencyType: "CNY",
      })
      render(<Component />, { withThemeProvider: false })
      const reset = await screen.findByRole("button", {
        name: "common:actions.reset",
      })
      await waitFor(() => expect(reset).toBeEnabled())
      await user.click(reset)
      if (confirmed) {
        await user.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "common:actions.reset",
          }),
        )
      } else {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      }
      await waitFor(() => expect(reset).toBeDisabled())
      const saved = await userPreferences.getPreferences()
      for (const key of Object.keys(changes) as (keyof UserPreferences)[]) {
        expect(saved[key]).toEqual(DEFAULT_PREFERENCES[key])
      }
      expect(saved.currencyType).toBe("CNY")
    },
  )
})
