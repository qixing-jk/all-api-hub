import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  getActionCenterDescription,
  getActionCenterLabel,
  getActionCenterStateDescription,
  getActionCenterStatusLabel,
  getActionCenterSummary,
  getConfigurationSubItemLabel,
} from "~/features/OptionsOverview/components/actionCenterText"
import {
  OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS,
  OPTIONS_OVERVIEW_CONFIGURATION_STATUSES,
  OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS,
} from "~/features/OptionsOverview/ids"
import type { OptionsOverviewActionCenterItem } from "~/features/OptionsOverview/types"

const t = ((key: string) => key) as TFunction

const baseActionCenterItem: OptionsOverviewActionCenterItem = {
  id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.accountFoundation,
  status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.needsSetup,
  summaryValue: 0,
  subItems: [],
  isVisible: true,
}

describe("action center text helpers", () => {
  it("resolves action center labels, descriptions, and summaries", () => {
    const summaryT = vi.fn((key: string) => key) as unknown as TFunction

    expect(
      getActionCenterLabel(
        OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.accountFoundation,
        t,
      ),
    ).toBe("optionsOverview:configurationOverview.accountFoundation.label")
    expect(
      getActionCenterDescription(
        OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.automation,
        t,
      ),
    ).toBe("optionsOverview:configurationOverview.automation.description")
    expect(
      getActionCenterSummary(
        OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.backupSync,
        2,
        summaryT,
      ),
    ).toBe("optionsOverview:configurationOverview.backupSync.summary")
    expect(summaryT).toHaveBeenCalledWith(
      "optionsOverview:configurationOverview.backupSync.summary",
      { count: 2 },
    )
  })

  it("resolves non-configured state descriptions and suppresses configured ones", () => {
    expect(getActionCenterStateDescription(baseActionCenterItem, t)).toBe(
      "optionsOverview:configurationOverview.accountFoundation.state.needs_setup",
    )
    expect(
      getActionCenterStateDescription(
        {
          ...baseActionCenterItem,
          id: OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS.automation,
          status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.disabled,
        },
        t,
      ),
    ).toBe("optionsOverview:configurationOverview.automation.state.disabled")
    expect(
      getActionCenterStateDescription(
        {
          ...baseActionCenterItem,
          status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.configured,
        },
        t,
      ),
    ).toBe("")
  })

  it("resolves configuration sub item labels", () => {
    expect(
      getConfigurationSubItemLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.accounts,
        t,
      ),
    ).toBe("optionsOverview:configurationOverview.subItems.accounts")
    expect(
      getConfigurationSubItemLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS.managedSiteModelSync,
        t,
      ),
    ).toBe(
      "optionsOverview:configurationOverview.subItems.managedSiteModelSync",
    )
  })

  it("resolves coverage status labels", () => {
    expect(
      getActionCenterStatusLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.configured,
        t,
      ),
    ).toBe("optionsOverview:coverageStatus.configured")
    expect(
      getActionCenterStatusLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.disabled,
        t,
      ),
    ).toBe("optionsOverview:coverageStatus.disabled")
    expect(
      getActionCenterStatusLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.needsSetup,
        t,
      ),
    ).toBe("optionsOverview:coverageStatus.needs_setup")
    expect(
      getActionCenterStatusLabel(
        OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.notApplicable,
        t,
      ),
    ).toBe("optionsOverview:coverageStatus.not_applicable")
  })
})
