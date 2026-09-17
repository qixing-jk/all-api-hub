import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OverviewAttentionList } from "~/features/OptionsOverview/components/OverviewAttentionList"
import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "~/features/OptionsOverview/ids"
import type { OptionsOverviewAttentionItem } from "~/features/OptionsOverview/types"
import { render, screen } from "~~/tests/test-utils/render"

describe("OverviewAttentionList", () => {
  it("shows a task summary and uses contextual navigation labels", async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const target = { menuItemId: MENU_ITEM_IDS.ACCOUNT }
    const item: OptionsOverviewAttentionItem = {
      id: "account:1:error",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
      severity: "error",
      titleOptions: { name: "Relay" },
      descriptionOptions: { reason: "Token expired" },
      target,
    }
    const t = ((key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${String(options.total ?? "")}` : key) as TFunction

    render(
      <OverviewAttentionList items={[item]} t={t} onNavigate={onNavigate} />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByText("optionsOverview:attention.summary:1"),
    ).toBeVisible()
    expect(screen.getByText("optionsOverview:attention.sortHint")).toBeVisible()

    const action = screen.getByRole("button", {
      name: /optionsOverview:attention\.actions\.viewAccount/,
    })
    await user.click(action)
    expect(onNavigate).toHaveBeenCalledWith(target)
  })

  it("explains the all-clear state while keeping the card compact", () => {
    const t = ((key: string) => key) as TFunction

    render(<OverviewAttentionList items={[]} t={t} onNavigate={vi.fn()} />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByText("optionsOverview:states.allClear")).toBeVisible()
    expect(
      screen.getByText("optionsOverview:states.allClearDescription"),
    ).toBeVisible()
  })
})
