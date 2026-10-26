import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Header } from "~/features/KeyManagement/workspace/Header"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

describe("KeyManagement Header", () => {
  it("offers the selected account's native console as a direct recovery action", async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(
      <Header
        selectedAccount="a"
        onAddToken={vi.fn()}
        onRefresh={vi.fn()}
        onOpenSelectedAccountConsole={open}
        isLoading={false}
        isAddTokenDisabled={false}
        isRepairDisabled={false}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:native.editor.vercelAiGateway.openConsole",
      }),
    )
    expect(open).toHaveBeenCalledOnce()
  })
  it("keeps checks accessible while completion is busy and disables its shortcuts", async () => {
    const user = userEvent.setup()
    const onProvisionKeys = vi.fn()
    render(
      <Header
        selectedAccount="account-1"
        onAddToken={vi.fn()}
        onRefresh={vi.fn()}
        onRepairMissingKeys={vi.fn()}
        onProvisionKeys={onProvisionKeys}
        isProvisioningKeys
        isLoading={false}
        isAddTokenDisabled={false}
        isRepairDisabled={false}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:tools.title" }),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    ).not.toHaveAttribute("aria-disabled", "true")
    for (const action of ["default", "allGroups"]) {
      const item = screen.getByRole("menuitem", {
        name: `keyManagement:provisioning.actions.${action}`,
      })
      expect(item).toHaveAttribute("aria-disabled", "true")
      await user.click(item)
    }
    expect(onProvisionKeys).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    "groups key tools with single-account shortcuts available: %s",
    async (singleAccount) => {
      const user = userEvent.setup()
      const onRepair = vi.fn()
      render(
        <Header
          selectedAccount={singleAccount ? "account-1" : "all"}
          onAddToken={vi.fn()}
          onRefresh={vi.fn()}
          onRepairMissingKeys={onRepair}
          onProvisionKeys={singleAccount ? vi.fn() : undefined}
          isLoading={false}
          isAddTokenDisabled={false}
          isRepairDisabled={false}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      if (!singleAccount) {
        expect(
          screen.queryByRole("button", { name: "keyManagement:tools.title" }),
        ).not.toBeInTheDocument()
        await user.click(
          screen.getByRole("button", {
            name: "keyManagement:repairMissingKeys.action",
          }),
        )
        expect(onRepair).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
        return
      }
      expect(
        screen.queryByRole("button", {
          name: "keyManagement:repairMissingKeys.action",
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: "keyManagement:provisioning.actions.title",
        }),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", { name: "keyManagement:tools.title" }),
      )
      expect(screen.queryAllByRole("menuitem")).toHaveLength(
        singleAccount ? 3 : 1,
      )
      await user.click(
        screen.getByRole("menuitem", {
          name: "keyManagement:repairMissingKeys.action",
        }),
      )
      expect(onRepair).toHaveBeenCalledTimes(1)
    },
  )
  it.each(["default", "all-groups"] as const)(
    "offers %s completion separately from adding another key",
    async (mode) => {
      const user = userEvent.setup()
      const onProvisionKeys = vi.fn()
      const onAddToken = vi.fn()
      render(
        <Header
          selectedAccount="account-1"
          onAddToken={onAddToken}
          onProvisionKeys={onProvisionKeys}
          onRefresh={vi.fn()}
          isLoading={false}
          isAddTokenDisabled={false}
          isRepairDisabled={false}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      await user.click(
        screen.getByRole("button", {
          name: "keyManagement:tools.title",
        }),
      )
      expect(
        screen.getByText("keyManagement:provisioning.actions.hint"),
      ).toBeVisible()
      await user.click(
        screen.getByRole("menuitem", {
          name: `keyManagement:provisioning.actions.${mode === "default" ? "default" : "allGroups"}`,
        }),
      )
      expect(onProvisionKeys).toHaveBeenCalledWith(mode)
      expect(onAddToken).not.toHaveBeenCalled()
    },
  )
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

  it("makes an unsupported add-key reason keyboard discoverable", () => {
    render(
      <Header
        selectedAccount="all"
        onAddToken={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        isAddTokenDisabled
        addTokenDisabledReason="No account supports creating keys"
        isRepairDisabled
      />,
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(
      screen.getByRole("group", {
        name: "keyManagement:dialog.addToken",
      }),
    ).toHaveAccessibleDescription("No account supports creating keys")
    expect(screen.getByTestId("key-management-add-token-button")).toBeDisabled()
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

  it("can omit automatic repair controls for a native-key account", () => {
    render(
      <Header
        selectedAccount="account-example"
        onAddToken={vi.fn()}
        onRefresh={vi.fn()}
        isLoading={false}
        isAddTokenDisabled={false}
        isRepairDisabled={false}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.queryByRole("button", {
        name: "keyManagement:tools.title",
      }),
    ).toBeNull()
  })
})
