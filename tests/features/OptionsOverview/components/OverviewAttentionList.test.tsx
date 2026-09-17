import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OverviewAttentionList } from "~/features/OptionsOverview/components/OverviewAttentionList"
import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "~/features/OptionsOverview/ids"
import { OPTIONS_OVERVIEW_TEST_IDS } from "~/features/OptionsOverview/testIds"
import type { OptionsOverviewAttentionItem } from "~/features/OptionsOverview/types"
import { render, screen, within } from "~~/tests/test-utils/render"

describe("OverviewAttentionList", () => {
  it("shows a task summary and uses contextual navigation labels", async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    const target = { menuItemId: MENU_ITEM_IDS.ACCOUNT }
    const item: OptionsOverviewAttentionItem = {
      id: "account:1:error",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
      category: "accounts",
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

  it("filters the queue by severity and category", async () => {
    const user = userEvent.setup()
    const t = ((key: string, options?: Record<string, unknown>) =>
      options
        ? `${key}:${String(options.name ?? options.total ?? "")}`
        : key) as TFunction
    const items: OptionsOverviewAttentionItem[] = [
      {
        id: "error-1",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: "accounts",
        severity: "error",
        titleOptions: { name: "Broken Relay" },
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      },
      ...["warning-1", "warning-2"].map((id, index) => ({
        id,
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        category: "automation" as const,
        severity: "warning" as const,
        titleOptions: { name: `Warning Relay ${index + 1}` },
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      })),
      {
        id: "warning-3",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: "accounts",
        severity: "warning",
        titleOptions: { name: "Warning Relay 3" },
        target: { menuItemId: MENU_ITEM_IDS.ACCOUNT },
      },
      {
        id: "info-1",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        category: "credentials",
        severity: "info",
        target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
      },
    ]

    render(<OverviewAttentionList items={items} t={t} onNavigate={vi.fn()} />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const severityFilters = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityFilters,
    )
    const categoryFilters = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.attentionCategoryFilters,
    )

    expect(
      within(severityFilters).getByRole("button", {
        name: "optionsOverview:severity.warning 3",
      }),
    ).toBeVisible()
    const automationFilter = within(categoryFilters).getByRole("button", {
      name: "optionsOverview:attention.categories.automation 2",
    })
    expect(automationFilter).toHaveAttribute("aria-pressed", "false")

    // The queue renders in full until a filter is chosen.
    expect(screen.getByText(/Warning Relay 3/u)).toBeVisible()
    expect(
      screen.getByText(/optionsOverview:attention\.addProfile\.title/u),
    ).toBeVisible()

    await user.click(automationFilter)

    expect(automationFilter).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/Warning Relay 1/u)).toBeVisible()
    expect(screen.queryByText(/Warning Relay 3/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/Broken Relay/u)).not.toBeInTheDocument()
    // Counts stay faceted to the remaining scope.
    expect(
      within(severityFilters).getByRole("button", {
        name: "optionsOverview:severity.warning 2",
      }),
    ).toBeVisible()
    expect(
      within(severityFilters).queryByRole("button", {
        name: "optionsOverview:severity.error 1",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      within(categoryFilters).getByRole("button", {
        name: "optionsOverview:attention.filterAll 5",
      }),
    )

    expect(
      within(severityFilters).getByRole("button", {
        name: "optionsOverview:severity.error 1",
      }),
    ).toBeVisible()
    expect(screen.getByText(/Warning Relay 3/u)).toBeVisible()
  })

  it("falls back to the full queue when a reload drops the active combination", async () => {
    const user = userEvent.setup()
    const t = ((key: string, options?: Record<string, unknown>) =>
      options
        ? `${key}:${String(options.name ?? options.total ?? "")}`
        : key) as TFunction
    const target = { menuItemId: MENU_ITEM_IDS.ACCOUNT }
    const buildItem = (
      id: string,
      category: OptionsOverviewAttentionItem["category"],
      severity: OptionsOverviewAttentionItem["severity"],
      name: string,
    ): OptionsOverviewAttentionItem => ({
      id,
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
      category,
      severity,
      titleOptions: { name },
      target,
    })

    const { rerender } = render(
      <OverviewAttentionList
        items={[
          buildItem(
            "automation-warning",
            "automation",
            "warning",
            "Automation",
          ),
          buildItem("account-error", "accounts", "error", "Broken account"),
        ]}
        t={t}
        onNavigate={vi.fn()}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const categoryFilters = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.attentionCategoryFilters,
    )
    await user.click(
      within(categoryFilters).getByRole("button", {
        name: "optionsOverview:attention.categories.automation 1",
      }),
    )
    const severityFilters = screen.getByTestId(
      OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityFilters,
    )
    await user.click(
      within(severityFilters).getByRole("button", {
        name: "optionsOverview:severity.warning 1",
      }),
    )
    expect(screen.getByText(/Automation/u)).toBeVisible()

    // The reloaded queue keeps both filter values, but the combination is gone.
    rerender(
      <OverviewAttentionList
        items={[
          buildItem("automation-info", "automation", "info", "New automation"),
          buildItem(
            "account-warning",
            "accounts",
            "warning",
            "Account warning",
          ),
        ]}
        t={t}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByText(/New automation/u)).toBeVisible()
    expect(screen.getByText(/Account warning/u)).toBeVisible()
    expect(
      within(
        screen.getByTestId(OPTIONS_OVERVIEW_TEST_IDS.attentionCategoryFilters),
      ).getByRole("button", {
        name: "optionsOverview:attention.categories.automation 1",
      }),
    ).toHaveAttribute("aria-pressed", "false")
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
