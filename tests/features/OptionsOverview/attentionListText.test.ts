import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  getAttentionActionLabel,
  getAttentionCategoryLabel,
  getAttentionDescription,
  getAttentionSeverityLabel,
  getAttentionTitle,
} from "~/features/OptionsOverview/components/attentionListText"
import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "~/features/OptionsOverview/ids"
import type { OptionsOverviewAttentionItem } from "~/features/OptionsOverview/types"

const target = { menuItemId: "account" } as const

function createAttentionItem(
  item: Partial<OptionsOverviewAttentionItem> &
    Pick<OptionsOverviewAttentionItem, "kind">,
): OptionsOverviewAttentionItem {
  return {
    id: item.kind,
    kind: item.kind,
    category: item.category ?? "accounts",
    severity: item.severity ?? "info",
    titleOptions: item.titleOptions,
    descriptionOptions: item.descriptionOptions,
    target,
  }
}

describe("attention list text helpers", () => {
  it("resolves severity labels", () => {
    const t = ((key: string) => key) as TFunction

    expect(getAttentionSeverityLabel("error", t)).toBe(
      "optionsOverview:severity.error",
    )
    expect(getAttentionSeverityLabel("warning", t)).toBe(
      "optionsOverview:severity.warning",
    )
    expect(getAttentionSeverityLabel("info", t)).toBe(
      "optionsOverview:severity.info",
    )
  })

  it("resolves attention titles and forwards title interpolation options", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const titleOptions = { name: "Relay" }

    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
          titleOptions,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountUnhealthy.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.addAccount.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.addProfile.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.siteTypeUnknown.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInMethodUnresolved.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.autoCheckinNeedsAttention.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.usageRefreshPending.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.autoCheckinGloballyDisabled.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.unreadSiteAnnouncements.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInReloginRequired.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInAccountDataMissing.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInPermissionDenied.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountsAllDisabled.title")
    expect(
      getAttentionTitle(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountTempWindowIssue.title")

    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.accountUnhealthy.title",
      titleOptions,
    )
  })

  it("forwards aggregate attention totals as plural counts", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction

    getAttentionTitle(
      createAttentionItem({
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
        titleOptions: { total: 3 },
      }),
      t,
    )
    getAttentionDescription(
      createAttentionItem({
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
        descriptionOptions: { total: 2 },
      }),
      t,
    )

    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.usageRefreshPending.title",
      { count: 3 },
    )
    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.autoCheckinGloballyDisabled.description",
      { count: 2 },
    )
  })

  it("resolves attention descriptions and forwards description options", () => {
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const descriptionOptions = { reason: "sync failed" }

    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
          descriptionOptions,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountUnhealthy.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.addAccount.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.addProfile.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.siteTypeUnknown.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInMethodUnresolved.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.autoCheckinNeedsAttention.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.usageRefreshPending.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.autoCheckinGloballyDisabled.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.unreadSiteAnnouncements.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInReloginRequired.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInAccountDataMissing.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.checkInPermissionDenied.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountsAllDisabled.description")
    expect(
      getAttentionDescription(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.accountTempWindowIssue.description")

    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.accountUnhealthy.description",
      descriptionOptions,
    )
  })

  it("resolves attention category labels", () => {
    const t = ((key: string) => key) as TFunction

    expect(getAttentionCategoryLabel("accounts", t)).toBe(
      "optionsOverview:attention.categories.accounts",
    )
    expect(getAttentionCategoryLabel("credentials", t)).toBe(
      "optionsOverview:attention.categories.credentials",
    )
    expect(getAttentionCategoryLabel("automation", t)).toBe(
      "optionsOverview:attention.categories.automation",
    )
    expect(getAttentionCategoryLabel("data", t)).toBe(
      "optionsOverview:attention.categories.data",
    )
  })

  it("resolves contextual action labels", () => {
    const t = ((key: string) => key) as TFunction

    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.viewAccount")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.editAccount")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.handleCheckIn")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.viewCheckIn")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.refreshAccounts")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.handleCheckIn")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.viewAnnouncements")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.signInAgain")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.fixAccount")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.viewCheckInResults")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.manageAccounts")
    expect(
      getAttentionActionLabel(
        createAttentionItem({
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.openSettings")
  })
})
