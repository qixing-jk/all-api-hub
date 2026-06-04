import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { buildAttentionItems } from "~/features/OptionsOverview/attentionItems"
import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "~/features/OptionsOverview/ids"
import { SiteHealthStatus, type DisplaySiteData } from "~/types"

const problemAccount = (
  id: string,
  status: SiteHealthStatus.Error | SiteHealthStatus.Warning,
  reason?: string,
): DisplaySiteData =>
  ({
    id,
    name: `Relay ${id}`,
    health: {
      status,
      reason,
    },
  }) as DisplaySiteData

describe("overview attention items", () => {
  it("turns unhealthy accounts into sorted actionable attention items", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [
          problemAccount("warning-account", SiteHealthStatus.Warning),
          problemAccount("error-b", SiteHealthStatus.Error, "sync failed"),
          problemAccount("error-a", SiteHealthStatus.Error, "token expired"),
        ],
      }),
    ).toEqual([
      {
        id: "account:error-a:error",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        severity: "error",
        titleOptions: { name: "Relay error-a" },
        descriptionOptions: { reason: "token expired" },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "error-a" },
        },
      },
      {
        id: "account:error-b:error",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        severity: "error",
        titleOptions: { name: "Relay error-b" },
        descriptionOptions: { reason: "sync failed" },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "error-b" },
        },
      },
      {
        id: "account:warning-account:warning",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        severity: "warning",
        titleOptions: { name: "Relay warning-account" },
        descriptionOptions: { reason: undefined },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "warning-account" },
        },
      },
    ])
  })

  it("adds setup hints when accounts or credential profiles are missing", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 0,
        profileCount: 0,
        problemAccounts: [],
      }),
    ).toEqual([
      {
        id: "setup:add-account",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
        severity: "info",
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: undefined,
        },
      },
      {
        id: "setup:add-profile",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        severity: "info",
        target: {
          menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
        },
      },
    ])
  })

  it("sorts setup hints after higher-severity account problems", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 0,
        profileCount: 0,
        problemAccounts: [
          problemAccount("warning-account", SiteHealthStatus.Warning),
        ],
      }).map((item) => [item.id, item.severity]),
    ).toEqual([
      ["account:warning-account:warning", "warning"],
      ["setup:add-account", "info"],
      ["setup:add-profile", "info"],
    ])
  })
})
