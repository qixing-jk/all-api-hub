import { describe, expect, it, vi } from "vitest"

import { OpenRouterWorkspaceSelector } from "~/features/KeyManagement/components/AccountKeyResource/OpenRouterWorkspaceSelector"
import type { AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const workspace: AccountKeyScope = {
  scopeKey: "workspace-example-id",
  routeKey: "example-team",
  displayName: "Example team",
  secondaryLabel: "example-team",
  isDefault: true,
}

describe("OpenRouterWorkspaceSelector", () => {
  it("uses a searchable name and slug selector and reports only the selected scope key", async () => {
    const onSelectScope = vi.fn()
    render(
      <OpenRouterWorkspaceSelector
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
    ).toHaveTextContent("example-team")
    fireEvent.click(screen.getByRole("option", { name: /Example team/ }))
    expect(onSelectScope).toHaveBeenCalledWith(workspace.scopeKey)
  })

  it("shows distinguishable loading, empty, and retryable error states without a raw-ID fallback", () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <OpenRouterWorkspaceSelector
        scopes={[]}
        selectedScope={null}
        isLoading
        onSelectScope={() => undefined}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:openRouter.workspace.loading",
    )
    rerender(
      <OpenRouterWorkspaceSelector
        scopes={[workspace]}
        selectedScope={workspace}
        isPartial
        onRetry={onRetry}
        onSelectScope={() => undefined}
      />,
    )
    expect(
      screen.getByText("keyManagement:openRouter.workspace.partial"),
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.workspace.retry",
      }),
    )
    expect(onRetry).toHaveBeenCalledOnce()
    expect(
      screen.getByRole("combobox", {
        name: "keyManagement:openRouter.workspace.label",
      }),
    ).toHaveTextContent("Example team")
    rerender(
      <OpenRouterWorkspaceSelector
        scopes={[]}
        selectedScope={null}
        onSelectScope={() => undefined}
      />,
    )
    expect(
      screen.getByText("keyManagement:openRouter.workspace.empty"),
    ).toBeVisible()
    rerender(
      <OpenRouterWorkspaceSelector
        scopes={[]}
        selectedScope={null}
        error="unavailable"
        onRetry={onRetry}
        onSelectScope={() => undefined}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "keyManagement:openRouter.workspace.error",
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.workspace.retry",
      }),
    )
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
