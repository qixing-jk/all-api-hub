import userEvent from "@testing-library/user-event"
import { Tag } from "lucide-react"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import * as presentationPolicy from "~/features/KeyManagement/presentation/keyResourcePresentationPolicy"
import { openRouterKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/openRouterKeyResourceCard"
import { AccountKeyResourceListItem as NativeAccountKeyResourceListItem } from "~/features/KeyManagement/resources/AccountKeyResourceListItem"
import { useAccountKeySecretDisclosure } from "~/features/KeyManagement/resources/useAccountKeySecretDisclosure"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import toast from "~/lib/notify"
import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { server } from "~~/tests/msw/server"
import { buildApiCredentialProfile } from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

const AccountKeyResourceListItem = (props: any) => (
  <NativeAccountKeyResourceListItem
    cardAdapter={openRouterKeyResourceCardAdapter}
    account={createAccount({
      id: props.row.accountId,
      siteType: props.row.facts.ref.siteType,
    })}
    {...props}
  />
)

const row: NativeKeyManagementRow = {
  kind: "account-key-resource",
  rowKey: "native-row-1",
  accountId: "account-example",
  accountName: "Example account",
  scopeName: "Example workspace",
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
  it("updates the account credential badge when linked plaintext confirms or disproves a masked match", async () => {
    const nativeRow: NativeKeyManagementRow = {
      ...row,
      facts: {
        ...row.facts,
        ref: { ...row.facts.ref, siteType: "novita" },
        accountCredentialIdentity: { status: "possible", source: "masked-key" },
        maskedLabel: "sk_test****last",
      },
    }
    const props = {
      row: nativeRow,
      cardAdapter: getAccountKeyResourceCardAdapter("novita"),
      account: createAccount({
        id: row.accountId,
        siteType: "novita",
        token: "sk_test-first-last",
      }),
      onExpandedChange: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }
    const { rerender } = render(<AccountKeyResourceListItem {...props} />)
    expect(
      await screen.findByText(
        "keyManagement:native.badges.accountCredentialCandidate",
      ),
    ).toBeVisible()
    const profile = buildApiCredentialProfile({ apiKey: "sk_test-first-last" })
    rerender(
      <AccountKeyResourceListItem {...props} associatedProfile={profile} />,
    )
    expect(
      await screen.findByText("keyManagement:native.badges.accountCredential"),
    ).toBeVisible()
    rerender(
      <AccountKeyResourceListItem
        {...props}
        row={{
          ...nativeRow,
          facts: {
            ...nativeRow.facts,
            accountCredentialIdentity: {
              status: "confirmed",
              source: "provider",
            },
          },
        }}
        associatedProfile={{ ...profile, apiKey: "sk_test-second-last" }}
      />,
    )
    expect(
      await screen.findByText("keyManagement:native.badges.accountCredential"),
    ).toBeVisible()
    expect(
      screen.queryByText(
        "keyManagement:native.badges.accountCredentialCandidate",
      ),
    ).not.toBeInTheDocument()
    rerender(
      <AccountKeyResourceListItem
        {...props}
        associatedProfile={{ ...profile, apiKey: "sk_test-second-last" }}
      />,
    )
    expect(
      screen.queryByText("keyManagement:native.badges.accountCredential"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:native.badges.accountCredentialCandidate",
      ),
    ).not.toBeInTheDocument()
    rerender(<AccountKeyResourceListItem {...props} />)
    expect(
      await screen.findByText(
        "keyManagement:native.badges.accountCredentialCandidate",
      ),
    ).toBeVisible()
    rerender(
      <AccountKeyResourceListItem
        {...props}
        associatedProfile={{ ...profile, apiKey: "sk_test****last" }}
      />,
    )
    expect(
      await screen.findByText(
        "keyManagement:native.badges.accountCredentialCandidate",
      ),
    ).toBeVisible()
    rerender(
      <AccountKeyResourceListItem
        {...props}
        row={{
          ...nativeRow,
          facts: { ...nativeRow.facts, accountCredentialIdentity: undefined },
        }}
        associatedProfile={profile}
      />,
    )
    expect(
      await screen.findByText("keyManagement:native.badges.accountCredential"),
    ).toBeVisible()
  })
  it("keeps the disclosure open with explicit empty feedback when fetched details add nothing", async () => {
    const user = userEvent.setup()
    const nativeRow = {
      ...row,
      facts: {
        ...row.facts,
        ref: { ...row.facts.ref, siteType: "krill" },
        displayFacts: [
          {
            fieldId: "accessed_time",
            kind: "last-used" as const,
            timestampMs: Date.parse("2026-10-01T00:00:00Z"),
          },
        ],
      },
    }
    const props = {
      row: nativeRow,
      cardAdapter: getAccountKeyResourceCardAdapter("krill"),
      onExpandedChange: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }
    const { rerender } = render(<AccountKeyResourceListItem {...props} />)
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    expect(props.onExpandedChange).toHaveBeenCalledWith(true)
    rerender(<AccountKeyResourceListItem {...props} expanded isDetailLoading />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "keyManagement:details.loading",
    )
    rerender(
      <AccountKeyResourceListItem
        {...props}
        detail={nativeRow.facts}
        expanded
      />,
    )
    const trigger = screen.getByRole("button", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("region", { name: "keyManagement:actions.detailsFor" }),
    ).toHaveTextContent("keyManagement:details.empty")
    await user.click(trigger)
    expect(props.onExpandedChange).toHaveBeenCalledWith(false)
    rerender(
      <AccountKeyResourceListItem
        {...props}
        detail={nativeRow.facts}
        expanded={false}
      />,
    )
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.detailsFor" }),
    ).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByRole("region", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeNull()
  })

  it("dispatches revoke separately from permanent deletion", async () => {
    const onRevoke = vi.fn()
    const onDelete = vi.fn()
    const nativeRow = {
      ...row,
      facts: {
        ...row.facts,
        ref: { ...row.facts.ref, siteType: "krill" },
        actions: { ...row.facts.actions, canRevoke: true },
      },
    }
    render(
      <AccountKeyResourceListItem
        row={nativeRow}
        cardAdapter={getAccountKeyResourceCardAdapter("krill")}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
        onRevoke={onRevoke}
      />,
    )
    await userEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:native.actions.revoke",
      }),
    )
    expect(onRevoke).toHaveBeenCalledWith(nativeRow.facts.ref)
    expect(onDelete).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:native.actions.revoke",
      }),
    ).toHaveClass(
      "bg-transparent",
      "text-warning-indicator",
      "hover:bg-warning-soft",
    )
    expect(
      screen.getByRole("button", {
        name: "keyManagement:native.actions.delete",
      }),
    ).toHaveClass("text-destructive-text")
    const managementActions = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((label) =>
        [
          "keyManagement:native.actions.edit",
          "keyManagement:native.actions.revoke",
          "keyManagement:native.actions.delete",
        ].includes(label ?? ""),
      )
    expect(managementActions).toEqual([
      "keyManagement:native.actions.edit",
      "keyManagement:native.actions.revoke",
      "keyManagement:native.actions.delete",
    ])
  })
  it("dispatches a provider-declared action independently of its label and other actions", async () => {
    const policy = presentationPolicy.getKeyResourcePresentationPolicy("dahl")
    const declaration = vi
      .spyOn(presentationPolicy, "getKeyResourcePresentationPolicy")
      .mockReturnValue({
        ...policy,
        actions: {
          ...policy.actions!,
          editActions: [
            {
              intent: editActions.Rename,
              label: () => "Custom provider action",
              icon: Tag,
            },
          ],
        },
      })
    try {
      const edit = vi.fn()
      const declaredRow = {
        ...row,
        facts: {
          ...row.facts,
          ref: { ...row.facts.ref, siteType: "cubence" as const },
        },
      }
      render(
        <AccountKeyResourceListItem
          row={declaredRow}
          onExpandedChange={vi.fn()}
          onEdit={edit}
          onDelete={vi.fn()}
        />,
        { withThemeProvider: false },
      )
      await userEvent
        .setup()
        .click(
          await screen.findByRole("button", { name: "Custom provider action" }),
        )
      expect(edit).toHaveBeenCalledWith(
        declaredRow.facts.ref,
        editActions.Rename,
      )
      expect(
        screen.queryByRole("button", {
          name: "keyManagement:native.editor.dahl.allocate",
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", {
          name: "keyManagement:native.editor.dahl.return",
        }),
      ).not.toBeInTheDocument()
    } finally {
      declaration.mockRestore()
    }
  })
  it("offers a direct Dahl rename action separately from token allocation", async () => {
    const dahl = {
      ...row,
      facts: {
        ...row.facts,
        detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
        ref: {
          ...row.facts.ref,
          siteType: "dahl" as const,
          scopeKey: "default",
          resourceId: "7",
        },
      },
    }
    const edit = vi.fn()
    render(
      <AccountKeyResourceListItem
        row={dahl}
        cardAdapter={getAccountKeyResourceCardAdapter("dahl")}
        onExpandedChange={vi.fn()}
        onEdit={edit}
        onDelete={vi.fn()}
      />,
      { withThemeProvider: false },
    )
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "keyManagement:native.editor.dahl.rename",
      }),
    )
    expect(edit).toHaveBeenCalledWith(dahl.facts.ref, editActions.Rename)
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "keyManagement:native.editor.dahl.allocate",
      }),
    )
    expect(edit).toHaveBeenLastCalledWith(dahl.facts.ref, editActions.Allocate)
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "keyManagement:native.editor.dahl.return",
      }),
    )
    expect(edit).toHaveBeenLastCalledWith(dahl.facts.ref, editActions.Return)
    expect(
      screen.queryByRole("button", { name: /details/i }),
    ).not.toBeInTheDocument()
  })
  it("reveals and hides a recoverable provider key through the shared controls", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: row.accountId,
      siteType: row.facts.ref.siteType,
    })
    const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
      account,
      row.facts,
      "sk-recoverable-example",
    )
    function Disclosure() {
      const { secret, secretControls } = useAccountKeySecretDisclosure({
        account,
        runtimeKey,
        recoverable: true,
        maskedLabel: "masked",
        displayName: "Example",
      })
      return (
        <div>
          <span>{secret}</span>
          {secretControls}
        </div>
      )
    }
    render(<Disclosure />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.getByText("••••••")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:actions.showKey" }),
    )
    expect(await screen.findByText("sk-recoverable-example")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "keyManagement:actions.hideKey" }),
    )
    expect(screen.queryByText("sk-recoverable-example")).not.toBeInTheDocument()
    expect(screen.getByText("••••••")).toBeVisible()
  })

  it("separates native key management from the detail action", () => {
    render(
      <AccountKeyResourceListItem
        row={row}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )
    const management = screen.getByRole("group", {
      name: "keyManagement:actionToolbar.management",
    })
    expect(management).toContainElement(
      screen.getByRole("button", { name: "keyManagement:native.actions.edit" }),
    )
    expect(management.previousElementSibling).toHaveAttribute(
      "aria-hidden",
      "true",
    )
  })

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
    expect(screen.getByText("sk-o••••••mple")).toBeVisible()
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
        name: "keyManagement:native.actions.edit",
      }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:native.actions.delete",
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
        name: "keyManagement:native.actions.edit",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:native.actions.delete",
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

  describe.each([true, false])(
    "linked credential profile (native mask=%s)",
    (nativeMask) => {
      const setup = () => {
        const user = userEvent.setup()
        const writeText = vi
          .spyOn(navigator.clipboard, "writeText")
          .mockResolvedValue(undefined)
        render(
          <AccountKeyResourceListItem
            row={{
              ...row,
              facts: {
                ...row.facts,
                maskedLabel: nativeMask ? row.facts.maskedLabel : undefined,
              },
            }}
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

        return { user, writeText }
      }

      it("exposes complete-key actions and keeps the secret masked", async () => {
        setup()
        expect(
          await screen.findByText(
            nativeMask ? "sk-o••••••mple" : "comp••••••cret",
          ),
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
      })

      it("reveals and hides the complete linked key", async () => {
        const { user } = setup()
        await user.click(
          await screen.findByRole("button", {
            name: "keyManagement:actions.showKey",
          }),
        )
        expect(screen.getByText("complete-example-secret")).toBeVisible()
        await user.click(
          screen.getByRole("button", { name: "keyManagement:actions.hideKey" }),
        )
        expect(
          screen.queryByText("complete-example-secret"),
        ).not.toBeInTheDocument()
      })

      it("copies the complete linked key and reports clipboard failures", async () => {
        const { user, writeText } = setup()
        await user.click(
          await screen.findByRole("button", { name: "common:actions.copyKey" }),
        )
        await waitFor(() =>
          expect(writeText).toHaveBeenCalledWith("complete-example-secret"),
        )

        const errorToast = vi.spyOn(toast, "error")
        writeText.mockRejectedValueOnce(new Error("clipboard denied"))
        await user.click(
          screen.getByRole("button", { name: "common:actions.copyKey" }),
        )
        await waitFor(() =>
          expect(errorToast).toHaveBeenCalledWith(
            "keyManagement:messages.copyFailed",
          ),
        )
      })

      it("opens export actions and dismisses them with Escape", async () => {
        const { user } = setup()
        await user.click(
          await screen.findByRole("button", { name: "common:actions.export" }),
        )
        expect(
          await screen.findByText("keyManagement:actions.useInCherry"),
        ).toBeVisible()
        await user.keyboard("{Escape}")
        await waitFor(() =>
          expect(
            screen.queryByText("keyManagement:actions.useInCherry"),
          ).not.toBeInTheDocument(),
        )
      })

      it("opens API verification for the complete linked key", async () => {
        server.use(
          http.get("https://api.example.invalid/v1/models", () =>
            HttpResponse.json({ data: { object: "list", data: [] } }),
          ),
        )
        const { user } = setup()
        await user.click(
          await screen.findByRole("button", {
            name: "keyManagement:actions.verifyApi",
          }),
        )
        expect(await screen.findByRole("dialog")).toBeVisible()
      })
    },
  )

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
    expect(screen.getByText("sk-o••••••mple")).toBeVisible()
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
      name: "keyManagement:native.actions.edit",
    })
    const deleteButton = screen.getByRole("button", {
      name: "keyManagement:native.actions.delete",
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
        name: "keyManagement:native.actions.edit",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:native.actions.delete",
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
    ).toHaveLength(1)
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

it.each(["foxcode", "dahl", "new-api", "sub2api"] as const)(
  "shows details only for additional information in a complete %s inventory row",
  async (siteType) => {
    const completeRow: NativeKeyManagementRow = {
      ...row,
      facts: {
        ...row.facts,
        ref: { ...row.facts.ref, siteType },
        detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
        displayFacts: [
          {
            fieldId: "channel",
            kind: "group",
            value: "Official",
            emptyValue: "ungrouped",
          },
          { fieldId: "quota", kind: "money", role: "total", amountUsd: 1 },
          { fieldId: "used", kind: "money", role: "used", amountUsd: 0.1 },
        ],
        runtimeKey: {
          createdAt: Date.parse("2026-10-01T00:00:00Z"),
          modelAccess: {
            groups: ["Official"],
            allowedModelIds: null,
            suggestedModelIds: [],
          },
        },
      },
    }
    const props = {
      row: completeRow,
      cardAdapter: getAccountKeyResourceCardAdapter(siteType),
      onExpandedChange: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    }
    const { rerender } = render(<AccountKeyResourceListItem {...props} />, {
      withThemeProvider: false,
    })
    expect(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.keyResourceSummaryFacts,
      ),
    ).toHaveTextContent("Official")
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    ).toBeNull()
    const extraRow = {
      ...completeRow,
      facts: {
        ...completeRow.facts,
        runtimeKey: { ...completeRow.facts.runtimeKey!, notes: "Extra note" },
      },
    }
    rerender(<AccountKeyResourceListItem {...props} row={extraRow} expanded />)
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.detailsFor" }),
    ).toBeInTheDocument()
    const details = screen.getByRole("region", {
      name: "keyManagement:actions.detailsFor",
    })
    expect(details).toHaveTextContent("Extra note")
    expect(details).not.toHaveTextContent("keyManagement:keyDetails.usedQuota")
  },
)

it.each([true, false])(
  "offers independent rotation and status actions for a response-only key (enabled=%s)",
  async (enabled) => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const nativeRow: NativeKeyManagementRow = {
      ...row,
      facts: {
        ...row.facts,
        ref: { ...row.facts.ref, siteType: "relayfor" },
        status: enabled ? "enabled" : "disabled",
        actions: {
          canUpdate: true,
          canDelete: true,
          canRotate: true,
          canEnable: !enabled,
          canDisable: enabled,
        },
      },
    }
    render(
      <AccountKeyResourceListItem
        row={nativeRow}
        cardAdapter={getAccountKeyResourceCardAdapter("relayfor")}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onExpandedChange={vi.fn()}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:native.actions.rotate",
      }),
    )
    expect(onEdit).toHaveBeenCalledWith(nativeRow.facts.ref, "rotate")
    await user.click(
      screen.getByRole("button", {
        name: `keyManagement:native.actions.${enabled ? "disable" : "enable"}`,
      }),
    )
    expect(onEdit).toHaveBeenCalledWith(
      nativeRow.facts.ref,
      enabled ? "disable" : "enable",
    )
    const names = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
    expect(names.indexOf("keyManagement:native.actions.rotate")).toBe(
      names.indexOf("keyManagement:native.actions.delete") - 1,
    )
    expect(
      names.indexOf(
        `keyManagement:native.actions.${enabled ? "disable" : "enable"}`,
      ),
    ).toBeLessThan(names.indexOf("keyManagement:native.actions.rotate"))

    expect(
      screen.queryByRole("button", {
        name: `keyManagement:native.actions.${enabled ? "enable" : "disable"}`,
      }),
    ).toBeNull()
  },
)
