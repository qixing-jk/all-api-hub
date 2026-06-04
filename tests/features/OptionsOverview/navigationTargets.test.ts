import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { OPTIONS_OVERVIEW_CONFIGURATION_STATUSES } from "~/features/OptionsOverview/ids"
import {
  buildAccountNavigationTarget,
  buildAutoCheckinConfigurationTarget,
  buildBasicSettingsAnchorTarget,
  buildConfigurationTarget,
  buildDataHistoryConfigurationTarget,
  buildManagedSiteModelSyncConfigurationTarget,
  buildSiteAnnouncementsConfigurationTarget,
} from "~/features/OptionsOverview/navigationTargets"

const STATUSES = OPTIONS_OVERVIEW_CONFIGURATION_STATUSES

describe("options overview navigation targets", () => {
  it("builds basic settings anchor targets with the owning tab", () => {
    expect(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.AUTO_CHECKIN),
    ).toEqual({
      menuItemId: MENU_ITEM_IDS.BASIC,
      params: {
        tab: "checkinRedeem",
        anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
        highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
      },
    })
    expect(
      buildBasicSettingsAnchorTarget(
        SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      ).params?.tab,
    ).toBe("general")
    expect(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.USAGE_HISTORY_SYNC).params
        ?.tab,
    ).toBe("accountUsage")
    expect(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.BALANCE_HISTORY).params
        ?.tab,
    ).toBe("balanceHistory")
    expect(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR)
        .params?.tab,
    ).toBe("managedSite")
  })

  it("routes configured generic capabilities to operational pages", () => {
    expect(
      buildConfigurationTarget(
        STATUSES.configured,
        MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      ),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS })
    expect(
      buildConfigurationTarget(
        STATUSES.disabled,
        MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      ),
    ).toEqual(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR),
    )
  })

  it("routes auto check-in setup gaps to the missing prerequisite owner", () => {
    expect(
      buildAutoCheckinConfigurationTarget({ status: STATUSES.configured }),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN })
    expect(
      buildAutoCheckinConfigurationTarget({ status: STATUSES.needsSetup }),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined })
    expect(
      buildAutoCheckinConfigurationTarget({ status: STATUSES.disabled }),
    ).toEqual(buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.AUTO_CHECKIN))
  })

  it("routes announcement and history setup gaps to accounts when no account scope exists", () => {
    expect(
      buildSiteAnnouncementsConfigurationTarget({
        status: STATUSES.needsSetup,
        enabledAccountCount: 0,
      }),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined })
    expect(
      buildDataHistoryConfigurationTarget({
        status: STATUSES.needsSetup,
        enabledAccountCount: 0,
        operationalMenuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS,
        settingsAnchor: SETTINGS_ANCHORS.USAGE_HISTORY_SYNC,
      }),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined })
  })

  it("routes model sync setup to model sync or managed-site prerequisites", () => {
    expect(
      buildManagedSiteModelSyncConfigurationTarget({
        status: STATUSES.configured,
        managedSiteConfigured: true,
      }),
    ).toEqual({ menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC })
    expect(
      buildManagedSiteModelSyncConfigurationTarget({
        status: STATUSES.disabled,
        managedSiteConfigured: true,
      }),
    ).toEqual(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC),
    )
    expect(
      buildManagedSiteModelSyncConfigurationTarget({
        status: STATUSES.needsSetup,
        managedSiteConfigured: false,
      }),
    ).toEqual(
      buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR),
    )
  })

  it("builds account navigation targets with trimmed optional search", () => {
    expect(buildAccountNavigationTarget()).toEqual({
      menuItemId: MENU_ITEM_IDS.ACCOUNT,
      params: undefined,
    })
    expect(buildAccountNavigationTarget("  account-1  ")).toEqual({
      menuItemId: MENU_ITEM_IDS.ACCOUNT,
      params: { search: "account-1" },
    })
  })
})
