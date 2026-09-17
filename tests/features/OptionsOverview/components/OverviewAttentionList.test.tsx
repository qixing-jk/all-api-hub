import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OverviewAttentionList } from "~/features/OptionsOverview/components/OverviewAttentionList"
import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "~/features/OptionsOverview/ids"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
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

  it("summarizes severity counts and collapses long queues", async () => {
    const user = userEvent.setup()
    const t = ((key: string, options?: Record<string, unknown>) =>
      options
        ? `${key}:${String(options.name ?? options.total ?? "")}`
        : key) as TFunction
    const items: OptionsOverviewAttentionItem[] = [
      {
        id: "error-1",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        severity: "error",
        titleOptions: { name: "Broken Relay" },
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      },
      ...["warning-1", "warning-2", "warning-3"].map((id, index) => ({
        id,
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        severity: "warning" as const,
        titleOptions: { name: `Warning Relay ${index + 1}` },
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      })),
      {
        id: "info-1",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        severity: "info",
        target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
      },
    ]

    render(<OverviewAttentionList items={items} t={t} onNavigate={vi.fn()} />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(
      screen.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityCounts)
        .textContent,
    ).toBe(
      [
        "optionsOverview:severity.error 1",
        "optionsOverview:severity.warning 3",
        "optionsOverview:severity.info 1",
      ].join(""),
    )

    expect(screen.getByText(/Warning Relay 2/u)).toBeVisible()
    expect(screen.queryByText(/Warning Relay 3/u)).not.toBeInTheDocument()

    const toggle = screen.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.attentionToggle)
    expect(toggle).toHaveTextContent("optionsOverview:attention.showAll:2")

    await user.click(toggle)

    expect(screen.getByText(/Warning Relay 3/u)).toBeVisible()
    expect(
      screen.getByText(/optionsOverview:attention\.addProfile\.title/u),
    ).toBeVisible()
    expect(toggle).toHaveTextContent("optionsOverview:attention.showLess")
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
