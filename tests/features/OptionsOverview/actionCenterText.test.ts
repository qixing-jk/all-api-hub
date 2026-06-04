import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  getActionCenterDescription,
  getActionCenterLabel,
  getActionCenterStateDescription,
  getActionCenterStatusLabel,
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
  subItems: [],
  isVisible: true,
}

describe("action center text helpers", () => {
  it("resolves action center labels and descriptions", () => {
    for (const id of Object.values(OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS)) {
      expect(getActionCenterLabel(id, t)).toBe(
        `optionsOverview:configurationOverview.${id}.label`,
      )
      expect(getActionCenterDescription(id, t)).toBe(
        `optionsOverview:configurationOverview.${id}.description`,
      )
    }
  })

  it("resolves non-configured state descriptions and suppresses configured ones", () => {
    for (const id of Object.values(OPTIONS_OVERVIEW_ACTION_CENTER_ITEM_IDS)) {
      expect(
        getActionCenterStateDescription(
          {
            ...baseActionCenterItem,
            id,
            status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.needsSetup,
          },
          t,
        ),
      ).toBe(`optionsOverview:configurationOverview.${id}.state.needs_setup`)
      expect(
        getActionCenterStateDescription(
          {
            ...baseActionCenterItem,
            id,
            status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.disabled,
          },
          t,
        ),
      ).toBe(`optionsOverview:configurationOverview.${id}.state.disabled`)
      expect(
        getActionCenterStateDescription(
          {
            ...baseActionCenterItem,
            id,
            status: OPTIONS_OVERVIEW_CONFIGURATION_STATUSES.notApplicable,
          },
          t,
        ),
      ).toBe(`optionsOverview:configurationOverview.${id}.state.not_applicable`)
    }
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
    for (const id of Object.values(
      OPTIONS_OVERVIEW_CONFIGURATION_SUB_ITEM_IDS,
    )) {
      expect(getConfigurationSubItemLabel(id, t)).toBe(
        `optionsOverview:configurationOverview.subItems.${id}`,
      )
    }
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
