import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountKeyResourceList as NativeAccountKeyResourceList } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceList"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { render, screen } from "~~/tests/test-utils/render"

const AccountKeyResourceList = (props: any) => (
  <NativeAccountKeyResourceList
    ariaLabel="Native account keys"
    cardAdapter={openRouterKeyResourceCardAdapter}
    {...props}
  />
)

const itemProps = new Map<string, any>()

vi.mock(
  "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceListItem",
  () => ({
    AccountKeyResourceListItem: (props: any) => {
      itemProps.set(props.row.rowKey, props)
      return (
        <div data-testid={`row-${props.row.rowKey}`}>
          {props.expanded ? "expanded" : "collapsed"}
          {props.isDetailLoading ? " loading" : ""}
          {props.detailFailure ? " failed" : ""}
          {props.detail?.displayName ?? ""}
        </div>
      )
    },
  }),
)

const createRow = (
  rowKey: string,
  resourceId: string,
  accountId = "account-example",
): NativeKeyManagementRow => ({
  kind: "account-key-resource",
  rowKey,
  accountId,
  accountName: "Example account",
  workspaceName: "Example workspace",
  facts: {
    ref: {
      accountId,
      siteType: "openrouter",
      scopeKey: "workspace-example",
      resourceId,
    },
    displayName: `Key ${rowKey}`,
    maskedLabel: "sk-or-v1-••••example",
    status: "enabled",
    fields: [],
    actions: { canUpdate: true, canDelete: true },
  },
})

describe("AccountKeyResourceList", () => {
  beforeEach(() => itemProps.clear())

  it("keeps one active disclosure and ignores a stale collapse from the previous row", () => {
    const openDetail = vi.fn()
    const closeDetail = vi.fn()
    const rows = [createRow("a", "resource-a"), createRow("b", "resource-b")]

    render(
      <AccountKeyResourceList
        rows={rows}
        onOpenDetail={openDetail}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCloseDetail={closeDetail}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    act(() => itemProps.get("a").onExpandedChange(true))
    const staleCollapseA = itemProps.get("a").onExpandedChange
    expect(screen.getByTestId("row-a")).toHaveTextContent("expanded")

    act(() => itemProps.get("b").onExpandedChange(true))
    expect(screen.getByTestId("row-a")).toHaveTextContent("collapsed")
    expect(screen.getByTestId("row-b")).toHaveTextContent("expanded")

    act(() => staleCollapseA(false))
    expect(screen.getByTestId("row-b")).toHaveTextContent("expanded")
    expect(closeDetail).not.toHaveBeenCalled()
    expect(openDetail).toHaveBeenNthCalledWith(1, rows[0].facts.ref)
    expect(openDetail).toHaveBeenNthCalledWith(2, rows[1].facts.ref)
  })

  it("binds detail loading and failure state only to the active row", () => {
    const rows = [createRow("a", "resource-a"), createRow("b", "resource-b")]
    const { rerender } = render(
      <AccountKeyResourceList
        rows={rows}
        onOpenDetail={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        isDetailLoading
        detailFailure={{ code: "unavailable" }}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    act(() => itemProps.get("b").onExpandedChange(true))
    rerender(
      <AccountKeyResourceList
        rows={rows}
        onOpenDetail={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        detail={{ ...rows[1].facts, displayName: "Loaded B" }}
        isDetailLoading
        detailFailure={{ code: "unavailable" }}
      />,
    )

    expect(screen.getByTestId("row-a")).toHaveTextContent("collapsed")
    expect(screen.getByTestId("row-a")).not.toHaveTextContent("loading")
    expect(screen.getByTestId("row-a")).not.toHaveTextContent("failed")
    expect(screen.getByTestId("row-b")).toHaveTextContent("expanded")
    expect(screen.getByTestId("row-b")).toHaveTextContent("loading")
    expect(screen.getByTestId("row-b")).toHaveTextContent("failed")
    expect(screen.getByTestId("row-b")).toHaveTextContent("Loaded B")
  })

  it("does not bind a same-id detail from another account to the active row", () => {
    const rows = [
      createRow("a", "shared-resource", "account-a"),
      createRow("b", "shared-resource", "account-b"),
    ]
    render(
      <AccountKeyResourceList
        rows={rows}
        onOpenDetail={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        detail={{ ...rows[0].facts, displayName: "Wrong account detail" }}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    act(() => itemProps.get("b").onExpandedChange(true))

    expect(screen.getByTestId("row-b")).not.toHaveTextContent(
      "Wrong account detail",
    )
  })
})
