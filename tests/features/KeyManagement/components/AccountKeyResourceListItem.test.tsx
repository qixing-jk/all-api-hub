import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountKeyResourceListItem } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceListItem"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { render, screen } from "~~/tests/test-utils/render"

const row: NativeKeyManagementRow = {
  kind: "account-key-resource",
  rowKey: "native-row-1",
  accountId: "account-example",
  accountName: "Example account",
  workspaceName: "Example workspace",
  facts: {
    ref: {
      accountId: "account-example",
      siteType: "openrouter",
      scopeKey: "workspace-example",
      resourceId: "hash-example",
    },
    displayName: "Example key",
    maskedLabel: "sk-or-v1-••••example",
    status: "disabled",
    fields: [
      { fieldId: "limit", kind: "number", value: 20 },
      { fieldId: "limit_remaining", kind: "number", value: -2 },
      { fieldId: "usage", kind: "number", value: 22 },
    ],
    actions: { canUpdate: true, canDelete: true },
  },
}

describe("AccountKeyResourceListItem", () => {
  it("renders a native key with only detail, edit, and delete actions", async () => {
    const user = userEvent.setup()
    const setExpanded = vi.fn()
    const edit = vi.fn()
    const remove = vi.fn()
    const { rerender } = render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={setExpanded}
        onEdit={edit}
        onDelete={remove}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByText("Example key")).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeKeyRow),
    ).toBeVisible()
    expect(screen.getByText("sk-or-v1-••••example")).toBeVisible()
    expect(screen.getByText("Example account")).toBeVisible()
    expect(screen.getByText("Example workspace")).toBeVisible()
    expect(screen.getByText("-2")).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay),
    ).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts),
    ).toBeVisible()
    expect(screen.getByText("keyManagement:keyDetails.key")).toBeVisible()
    expect(
      screen.getByText("keyManagement:keyDetails.createResponseOnlySecret"),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.list.actions.edit",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: /copy key/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /verify api/i })).toBeNull()
    expect(
      screen.queryByRole("button", { name: /save to api credentials/i }),
    ).toBeNull()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.list.actions.edit",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    )
    expect(edit).toHaveBeenCalledWith(row.facts.ref)
    expect(remove).toHaveBeenCalledWith(row.facts.ref)
    expect(setExpanded).toHaveBeenCalledWith(true)

    rerender(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={setExpanded}
        onEdit={edit}
        onDelete={remove}
        expanded
        detail={{
          ...row.facts,
          fields: [
            {
              fieldId: "workspace_id",
              kind: "text",
              value: "Loaded workspace",
            },
            { fieldId: "byok_usage", kind: "number", value: 7 },
          ],
        }}
      />,
    )

    expect(screen.getByText("Loaded workspace")).toBeVisible()
    expect(
      screen.getByText("keyManagement:openRouter.list.details.byokUsage"),
    ).toBeVisible()
  })

  it("does not treat missing finite limits as unlimited", () => {
    render(
      <AccountKeyResourceListItem
        row={{
          ...row,
          facts: {
            ...row.facts,
            fields: [
              { fieldId: "limit_mode", kind: "text", value: "limited" },
              { fieldId: "usage", kind: "number", value: 4 },
            ],
          },
        }}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.getAllByText("keyManagement:openRouter.list.values.missing"),
    ).toHaveLength(2)
    expect(
      screen.queryByText("keyManagement:openRouter.list.values.unlimited"),
    ).toBeNull()
  })

  it("keeps native mutations available when details come from row facts", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
        detailsFromRow
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const editButton = screen.getByRole("button", {
      name: "keyManagement:openRouter.list.actions.edit",
    })
    const deleteButton = screen.getByRole("button", {
      name: "keyManagement:openRouter.list.actions.delete",
    })
    expect(editButton).toBeEnabled()
    expect(deleteButton).toBeEnabled()

    await user.click(editButton)
    await user.click(deleteButton)
    expect(onEdit).toHaveBeenCalledWith(row.facts.ref)
    expect(onDelete).toHaveBeenCalledWith(row.facts.ref)
  })

  it("omits mutations that the native resource does not support", () => {
    render(
      <AccountKeyResourceListItem
        row={{
          ...row,
          facts: {
            ...row.facts,
            actions: { canUpdate: false, canDelete: false },
          },
        }}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.edit",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:openRouter.list.actions.delete",
      }),
    ).toBeNull()
  })

  it("expands list facts in all-account mode without requesting unavailable single-account detail", () => {
    render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        detailsFromRow
        expanded
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.getAllByText("keyManagement:openRouter.list.details.limit"),
    ).toHaveLength(2)
    expect(screen.getAllByText(row.facts.displayName)).toHaveLength(1)
  })

  it("uses the shared loading and retryable error detail states", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const { rerender } = render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={retry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        expanded
        isDetailLoading
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:details.loading",
    )

    rerender(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={retry}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        expanded
        detailFailure={{ code: "unavailable" }}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent(
      "keyManagement:openRouter.list.details.loadFailed",
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )
    expect(retry).toHaveBeenCalledWith(true)
  })
})
