import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountKeyScopeSelector } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyScopeSelector"
import type { AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const workspace: AccountKeyScope = {
  scopeKey: "workspace-example-id",
  routeKey: "example-team",
  displayName: "Example team",
  secondaryLabel: "Workspace owner",
  isDefault: true,
}

describe("AccountKeyScopeSelector", () => {
  it.each([
    SITE_TYPES.NEW_API,
    SITE_TYPES.SUB2API,
    SITE_TYPES.VO_API_V2,
    SITE_TYPES.AIHUBMIX,
  ])(
    "shows loading before hiding the settled implicit account scope for %s",
    (siteType) => {
      const props = { siteType, onSelectScope: vi.fn() }
      const { rerender } = render(
        <AccountKeyScopeSelector
          {...props}
          scopes={[]}
          selectedScope={null}
          isLoading
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )
      expect(screen.getByRole("status")).toHaveTextContent(
        "keyManagement:native.scope.loading",
      )

      const accountScope: AccountKeyScope = {
        scopeKey: "account",
        routeKey: "account",
        displayName: "Example account",
        isDefault: true,
      }
      rerender(
        <AccountKeyScopeSelector
          {...props}
          scopes={[accountScope]}
          selectedScope={accountScope}
        />,
      )
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
      expect(screen.queryByRole("heading")).not.toBeInTheDocument()
    },
  )

  it("uses neutral scope terminology for another provider", () => {
    render(
      <AccountKeyScopeSelector
        siteType="new-api"
        scopes={[
          workspace,
          {
            scopeKey: "another-scope",
            routeKey: "another",
            displayName: "Another scope",
            isDefault: false,
          },
        ]}
        selectedScope={workspace}
        onSelectScope={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    expect(
      screen.getByRole("combobox", {
        name: "keyManagement:native.scope.label",
      }),
    ).toHaveTextContent(workspace.displayName)
    expect(
      screen.getByRole("heading", {
        name: "keyManagement:native.scope.heading",
      }),
    ).toBeVisible()
    expect(screen.queryByText(workspace.scopeKey)).toBeNull()
    expect(
      screen.queryByText("keyManagement:openRouter.workspace.heading"),
    ).toBeNull()
  })

  it("uses a searchable name and slug selector and reports only the selected scope key", async () => {
    const onSelectScope = vi.fn()
    render(
      <AccountKeyScopeSelector
        siteType="openrouter"
        scopes={[workspace]}
        selectedScope={workspace}
        onSelectScope={onSelectScope}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const selector = screen.getByRole("combobox", {
      name: "keyManagement:openRouter.workspace.label",
    })
    expect(selector).toHaveTextContent("Example team")
    fireEvent.click(selector)
    expect(
      await screen.findByRole("option", { name: /Example team/ }),
    ).toHaveTextContent("Workspace owner")
    fireEvent.click(screen.getByRole("option", { name: /Example team/ }))
    expect(onSelectScope).toHaveBeenCalledWith(workspace.scopeKey)
  })

  it.each(["openrouter", "new-api"])(
    "shows loading, empty and retryable errors for %s",
    (siteType) => {
      const onRetry = vi.fn()
      const { rerender } = render(
        <AccountKeyScopeSelector
          siteType={siteType}
          scopes={[]}
          selectedScope={null}
          isLoading
          onSelectScope={() => undefined}
        />,
        { withUserPreferencesProvider: false, withThemeProvider: false },
      )

      expect(screen.getByRole("status")).toHaveTextContent(
        `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.loading`,
      )
      rerender(
        <AccountKeyScopeSelector
          siteType={siteType}
          scopes={[workspace]}
          selectedScope={workspace}
          isPartial
          onRetry={onRetry}
          onSelectScope={() => undefined}
        />,
      )
      expect(
        screen.getByText(
          `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.partial`,
        ),
      ).toBeVisible()
      fireEvent.click(
        screen.getByRole("button", {
          name: `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.retry`,
        }),
      )
      expect(onRetry).toHaveBeenCalledOnce()
      expect(
        screen.getByRole("combobox", {
          name: `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.label`,
        }),
      ).toHaveTextContent("Example team")
      rerender(
        <AccountKeyScopeSelector
          siteType={siteType}
          scopes={[]}
          selectedScope={null}
          onSelectScope={() => undefined}
        />,
      )
      expect(
        screen.getByText(
          `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.empty`,
        ),
      ).toBeVisible()
      rerender(
        <AccountKeyScopeSelector
          siteType={siteType}
          scopes={[]}
          selectedScope={null}
          error="unavailable"
          onRetry={onRetry}
          onSelectScope={() => undefined}
        />,
      )
      expect(screen.getByRole("alert")).toHaveTextContent(
        `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.error`,
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: `keyManagement:${siteType === "openrouter" ? "openRouter.workspace" : "native.scope"}.retry`,
        }),
      )
      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole("textbox")).toBeNull()
    },
  )
})
