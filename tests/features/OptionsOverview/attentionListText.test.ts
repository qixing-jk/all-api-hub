import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  getAttentionActionLabel,
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

    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.accountUnhealthy.title",
      titleOptions,
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

    expect(t).toHaveBeenCalledWith(
      "optionsOverview:attention.accountUnhealthy.description",
      descriptionOptions,
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
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
        }),
        t,
      ),
    ).toBe("optionsOverview:attention.actions.refreshAccounts")
  })
})
