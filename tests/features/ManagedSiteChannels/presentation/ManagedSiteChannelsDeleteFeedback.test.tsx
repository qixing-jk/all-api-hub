import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { ManagedChannelsDeleteState } from "~/features/ManagedSiteChannels/presentation/contracts"
import { ManagedSiteChannelsDeleteFeedback } from "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelsDeleteFeedback"
import { createManagedSiteChannelsLabels } from "~/features/ManagedSiteChannels/presentation/managedSiteChannelsLabels"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render } from "~~/tests/test-utils/render"

const labels = createManagedSiteChannelsLabels(testI18n.t, {
  rowActions: {
    trigger: "",
    edit: "",
    view: "",
    migrate: "",
    sync: "",
    syncing: "",
    openSync: "",
    filters: "",
    delete: "",
  },
  statusLabels: {},
})
const completed = (
  status: "success" | "failed" | "uncertain",
  requiresRefresh = false,
): ManagedChannelsDeleteState => ({
  isOpen: false,
  isWorking: false,
  rowKeys: ["one"],
  requiresRefresh,
  results: [
    {
      rowKey: "one",
      displayLabel: "Example channel",
      status,
      resultKey: status,
    },
  ],
})

describe("ManagedSiteChannelsDeleteFeedback", () => {
  it("omits successful results but retains recovery when the list refresh failed", () => {
    const props = {
      labels,
      canRefresh: true,
      isRefreshing: false,
      onRefresh: vi.fn(),
    }
    const { rerender } = render(
      <ManagedSiteChannelsDeleteFeedback
        {...props}
        deleteState={completed("success")}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    rerender(
      <ManagedSiteChannelsDeleteFeedback
        {...props}
        deleteState={completed("success", true)}
      />,
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: labels.deleteRefreshAction }),
    ).toBeVisible()
  })

  it.each(["failed", "uncertain"] as const)(
    "dismisses %s details without hiding required recovery and shows the next result",
    async (status) => {
      const user = userEvent.setup()
      const onRefresh = vi.fn()
      const props = { labels, canRefresh: true, isRefreshing: false, onRefresh }
      const state = completed(status, true)
      const { rerender } = render(
        <ManagedSiteChannelsDeleteFeedback {...props} deleteState={state} />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      await user.click(
        within(screen.getByRole("status")).getByRole("button", {
          name: "common:actions.close",
        }),
      )
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", { name: labels.deleteRefreshAction }),
      )
      expect(onRefresh).toHaveBeenCalledOnce()
      rerender(
        <ManagedSiteChannelsDeleteFeedback
          {...props}
          deleteState={{ ...state, isWorking: true, results: [] }}
        />,
      )
      rerender(
        <ManagedSiteChannelsDeleteFeedback {...props} deleteState={state} />,
      )
      expect(screen.getByRole("status")).toHaveTextContent("Example channel")
    },
  )
})
