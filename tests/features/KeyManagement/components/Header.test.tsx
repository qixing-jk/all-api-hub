import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Header } from "~/features/KeyManagement/components/Header"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe("KeyManagement Header", () => {
  it("marks only refresh busy, suppresses duplicate clicks, and restores after refresh", async () => {
    const user = userEvent.setup()
    const deferredRefresh = createDeferred<void>()
    const onRefresh = vi.fn(() => deferredRefresh.promise)

    render(
      <Header
        selectedAccount="account-1"
        onAddToken={vi.fn()}
        onRepairMissingKeys={vi.fn()}
        onRefresh={onRefresh}
        onOpenSelectedAccountModels={vi.fn()}
        onRefreshManagedSiteStatus={vi.fn()}
        isLoading={false}
        isManagedSiteStatusRefreshing={false}
        isAddTokenDisabled={false}
        isRepairDisabled={false}
        isManagedSiteStatusRefreshDisabled={false}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:refreshTokenList",
      }),
    )

    const refreshingButton = await screen.findByRole("button", {
      name: "common:status.refreshing",
    })
    expect(refreshingButton).toBeDisabled()
    expect(refreshingButton).toHaveAttribute("aria-busy", "true")

    for (const sibling of screen.getAllByRole("button")) {
      if (sibling !== refreshingButton) {
        expect(sibling).not.toHaveAttribute("aria-busy")
      }
    }

    await user.click(refreshingButton)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    deferredRefresh.resolve()

    await waitFor(() => {
      const restoredButton = screen.getByRole("button", {
        name: "keyManagement:refreshTokenList",
      })
      expect(restoredButton).toBeEnabled()
      expect(restoredButton).not.toHaveAttribute("aria-busy")
    })
  })

  it("keeps refresh disabled but non-busy during aggregate loading", () => {
    render(
      <Header
        selectedAccount="account-1"
        onAddToken={vi.fn()}
        onRepairMissingKeys={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={true}
        isAddTokenDisabled={true}
        isRepairDisabled={true}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const refreshButton = screen.getByRole("button", {
      name: "keyManagement:refreshTokenList",
    })
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).not.toHaveAttribute("aria-busy")
  })

  it("keeps refresh idle and non-busy when no account is selected", () => {
    const onRefresh = vi.fn()

    render(
      <Header
        selectedAccount=""
        onAddToken={vi.fn()}
        onRepairMissingKeys={vi.fn()}
        onRefresh={onRefresh}
        isLoading={true}
        isAddTokenDisabled={true}
        isRepairDisabled={true}
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const refreshButton = screen.getByRole("button", {
      name: "keyManagement:refreshTokenList",
    })
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).not.toHaveAttribute("aria-busy")

    refreshButton.click()
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
