import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { AccountKeyResourceListItem as NativeAccountKeyResourceListItem } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceListItem"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import { maskSecretForDisplay } from "~/utils/core/formatters"
import { server } from "~~/tests/msw/server"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const AccountKeyResourceListItem = (props: any) => (
  <NativeAccountKeyResourceListItem
    cardAdapter={openRouterKeyResourceCardAdapter}
    {...props}
  />
)

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
    expect(screen.getByText(/-USD\s*2/)).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSecretDisplay),
    ).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts),
    ).toBeVisible()
    expect(screen.getByText("keyManagement:keyDetails.key")).toBeVisible()
    const secretAvailabilityButton = screen.getByRole("button", {
      name: "keyManagement:keyDetails.createResponseOnlySecret",
    })
    expect(secretAvailabilityButton).toBeVisible()
    expect(secretAvailabilityButton).toHaveAttribute("type", "button")
    expect(screen.getByRole("note")).toHaveTextContent(
      "keyManagement:keyDetails.createResponseOnlySecret",
    )
    await user.hover(secretAvailabilityButton)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "keyManagement:keyDetails.createResponseOnlySecret",
    )
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
    expect(
      screen.queryByRole("button", { name: "common:actions.copyKey" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "common:actions.export" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
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

  it("exposes complete-key actions from a linked credential profile", async () => {
    const user = userEvent.setup()
    server.use(
      http.get("https://api.example.invalid/v1/v1/models", () =>
        HttpResponse.json({ data: { object: "list", data: [] } }),
      ),
    )
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        associatedProfile={{
          id: "profile-example",
          name: "Example credential",
          apiType: "openai-compatible",
          baseUrl: "https://api.example.invalid/v1",
          apiKey: "complete-example-secret",
          tagIds: [],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        }}
      />,
      { withUserPreferencesProvider: true, withThemeProvider: false },
    )

    expect(
      await screen.findByText(maskSecretForDisplay("complete-example-secret")),
    ).toBeVisible()
    const showButton = await screen.findByRole("button", {
      name: "keyManagement:actions.showKey",
    })
    expect(showButton).toBeVisible()
    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeVisible()
    const exportButton = await screen.findByRole("button", {
      name: "common:actions.export",
    })
    expect(exportButton).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton),
    ).toBeVisible()
    const verifyApiButton = await screen.findByRole("button", {
      name: "keyManagement:actions.verifyApi",
    })
    expect(verifyApiButton).toBeVisible()
    expect(
      await screen.findByRole("button", {
        name: "keyManagement:actions.verifyCliSupport",
      }),
    ).toBeVisible()

    await user.click(showButton)
    expect(screen.getByText("complete-example-secret")).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.copyKey" }),
    )
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("complete-example-secret"),
    )

    await user.click(exportButton)
    expect(
      await screen.findByText("keyManagement:actions.useInCherry"),
    ).toBeVisible()
    await user.keyboard("{Escape}")

    await user.click(verifyApiButton)
    expect(await screen.findByRole("dialog")).toBeVisible()
  })

  it("hides a newly linked profile secret until the user reveals it", async () => {
    const user = userEvent.setup()
    const commonProps = {
      row,
      onExpandedChange: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }
    const profile = {
      id: "profile-first",
      name: "First credential",
      apiType: "openai-compatible" as const,
      baseUrl: "https://api.example.invalid/v1",
      apiKey: "complete-first-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    }
    const { rerender } = render(
      <AccountKeyResourceListItem
        {...commonProps}
        associatedProfile={profile}
      />,
      { withUserPreferencesProvider: true, withThemeProvider: false },
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.showKey",
      }),
    )
    expect(screen.getByText(profile.apiKey)).toBeVisible()

    const nextProfile = {
      ...profile,
      id: "profile-second",
      name: "Second credential",
      apiKey: "complete-second-secret",
    }
    rerender(
      <AccountKeyResourceListItem
        {...commonProps}
        associatedProfile={nextProfile}
      />,
    )

    expect(screen.queryByText(nextProfile.apiKey)).not.toBeInTheDocument()
    expect(
      screen.getByText(maskSecretForDisplay(nextProfile.apiKey)),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.showKey" }),
    ).toBeVisible()
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
