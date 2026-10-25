import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountKeyResourceDeleteDialog } from "~/features/KeyManagement/resources/AccountKeyResourceDeleteDialog"
import {
  ACCOUNT_KEY_CREDENTIAL_ROLES,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({ config: vi.fn() }))
vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: () => ({ config: { get: mocks.config } }),
}))
vi.mock("~/services/managedSites/configuration/runtimeConfig", () => ({
  getCurrentManagedSiteType: async () => "new-api",
}))
vi.mock("~/services/accounts/keys/keyProductCapabilities", () => ({
  supportsRecoverableAccountRuntimeKeySecrets: () => true,
}))

type Props = ComponentProps<typeof AccountKeyResourceDeleteDialog>
const createProps = (): Props => ({
  nativeKeys: {
    allRows: [],
    deleteState: {
      isOpen: true,
      isExecuting: false,
      failure: null,
      ref: {
        accountId: "account",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "default",
        resourceId: "a",
      },
    },
    refresh: vi.fn(),
    confirmDelete: vi.fn().mockResolvedValue(true),
    cancelDelete: vi.fn(),
  },
  accounts: [
    {
      id: "account",
      siteType: SITE_TYPES.NEW_API,
    } as Props["accounts"][number],
  ],
  getProfileForLocator: vi.fn(),
})

beforeEach(() => {
  mocks.config.mockReset().mockResolvedValue({})
})

it("uses revocation-specific failure feedback", async () => {
  const props = createProps()
  props.nativeKeys.deleteState.operation = "revoke"
  props.nativeKeys.deleteState.failure = {
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
  }
  render(<AccountKeyResourceDeleteDialog {...props} />)
  expect(
    await screen.findByText("keyManagement:native.revoke.feedback.error"),
  ).toBeVisible()
})

it("confirms record-preserving revocation separately and never offers linked deletion cleanup", async () => {
  const props = createProps()
  props.nativeKeys.deleteState.operation = "revoke"
  render(<AccountKeyResourceDeleteDialog {...props} />)
  expect(
    await screen.findByText("keyManagement:native.revoke.description"),
  ).toBeInTheDocument()
  expect(screen.queryByRole("checkbox")).toBeNull()
  expect(
    screen.getByRole("button", { name: "keyManagement:native.actions.revoke" }),
  ).toHaveClass("bg-(--button-warning-bg)")
  await userEvent.click(
    screen.getByRole("button", { name: "keyManagement:native.actions.revoke" }),
  )
  expect(props.nativeKeys.confirmDelete).toHaveBeenCalledWith(false)
})

it("describes Dahl revocation and the return of remaining token credit", async () => {
  const props = createProps()
  props.nativeKeys.deleteState.ref = {
    ...props.nativeKeys.deleteState.ref!,
    siteType: SITE_TYPES.DAHL,
  }
  props.accounts[0]!.siteType = SITE_TYPES.DAHL
  render(<AccountKeyResourceDeleteDialog {...props} />)
  expect(
    await screen.findByText(
      "keyManagement:native.editor.dahl.revokeDescription",
    ),
  ).toBeInTheDocument()
  expect(
    screen.getByRole("button", {
      name: "keyManagement:native.editor.dahl.revoke",
    }),
  ).toBeInTheDocument()
})

it("rechecks cleanup availability when reopening deletion for the same key", async () => {
  const user = userEvent.setup()
  const props = createProps()
  const { rerender } = render(<AccountKeyResourceDeleteDialog {...props} />)
  const checkbox = await screen.findByRole("checkbox")
  await waitFor(() => expect(checkbox).toBeChecked())
  await user.click(
    screen.getByRole("button", { name: "common:actions.cancel" }),
  )
  rerender(
    <AccountKeyResourceDeleteDialog
      {...props}
      nativeKeys={{
        ...props.nativeKeys,
        deleteState: { ...props.nativeKeys.deleteState, isOpen: false },
      }}
    />,
  )
  mocks.config.mockResolvedValue(null)
  rerender(<AccountKeyResourceDeleteDialog {...props} />)
  await waitFor(() => expect(mocks.config).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "keyManagement:native.delete.confirm" }),
  )
  expect(props.nativeKeys.confirmDelete).toHaveBeenCalledWith(false)
})

it("initializes cleanup independently when switching deletion targets", async () => {
  const user = userEvent.setup()
  const props = createProps()
  const { rerender } = render(<AccountKeyResourceDeleteDialog {...props} />)
  const checkbox = await screen.findByRole("checkbox")
  await waitFor(() => expect(checkbox).toBeChecked())
  await user.click(checkbox)
  expect(checkbox).not.toBeChecked()
  rerender(
    <AccountKeyResourceDeleteDialog
      {...props}
      nativeKeys={{
        ...props.nativeKeys,
        deleteState: {
          ...props.nativeKeys.deleteState,
          ref: { ...props.nativeKeys.deleteState.ref!, resourceId: "b" },
        },
      }}
    />,
  )
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked())
})

it.each([
  [
    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
    "authenticationFailed",
  ],
  [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied, "permissionDenied"],
  [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable, "unavailable"],
  [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed, "error"],
  [ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain, "uncertain"],
])("shows deletion failure %s", async (code, message) => {
  const props = createProps()
  render(
    <AccountKeyResourceDeleteDialog
      {...props}
      nativeKeys={{
        ...props.nativeKeys,
        deleteState: {
          ...props.nativeKeys.deleteState,
          failure: { code, message: "Failure detail" },
        },
      }}
    />,
  )
  expect(
    await screen.findByText(`keyManagement:native.delete.feedback.${message}`),
  ).toBeInTheDocument()
})

describe("account credential deletion guard", () => {
  const createRequestyCredentialProps = (): Props => {
    const props = createProps()
    props.nativeKeys.deleteState.ref = {
      ...props.nativeKeys.deleteState.ref!,
      siteType: SITE_TYPES.REQUESTY,
    }
    props.accounts[0]!.siteType = SITE_TYPES.REQUESTY
    props.nativeKeys.allRows = [
      {
        ref: props.nativeKeys.deleteState.ref!,
        displayName: "account-credential",
        maskedLabel: "masked",
        status: "enabled",
        credentialRole: ACCOUNT_KEY_CREDENTIAL_ROLES.Account,
        fields: [],
        actions: { canUpdate: true, canDelete: true },
        displayFacts: [
          {
            fieldId: "permissions",
            kind: "permission",
            role: "manage",
            granted: true,
          },
        ],
      },
    ]
    return props
  }

  it("blocks confirmation until the account-credential warning is acknowledged", async () => {
    const user = userEvent.setup()
    const props = createRequestyCredentialProps()
    render(<AccountKeyResourceDeleteDialog {...props} />)
    const confirm = await screen.findByRole("button", {
      name: "keyManagement:native.delete.confirm",
    })
    expect(confirm).toBeDisabled()
    expect(
      screen.getByTestId("key-management-native-delete-credential-warning"),
    ).toBeVisible()
    const checkbox = screen.getByTestId(
      "key-management-native-delete-credential-acknowledge",
    )
    await user.click(checkbox)
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(props.nativeKeys.confirmDelete).toHaveBeenCalled()
  })

  it("shows a warning without a gate for manage keys that are not the account credential", async () => {
    const props = createRequestyCredentialProps()
    props.nativeKeys.allRows = [
      {
        ...props.nativeKeys.allRows[0]!,
        credentialRole: undefined,
      },
    ]
    render(<AccountKeyResourceDeleteDialog {...props} />)
    expect(
      await screen.findByTestId(
        "key-management-native-delete-credential-warning",
      ),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:native.delete.confirm",
      }),
    ).toBeEnabled()
    expect(
      screen.queryByRole("checkbox", {
        name: "keyManagement:native.delete.accountCredentialAcknowledge",
      }),
    ).toBeNull()
  })

  it("keeps revocation of the account credential free of the delete gate", async () => {
    const props = createRequestyCredentialProps()
    props.nativeKeys.deleteState.operation = "revoke"
    render(<AccountKeyResourceDeleteDialog {...props} />)
    expect(
      await screen.findByText("keyManagement:native.revoke.description"),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("key-management-native-delete-credential-warning"),
    ).toBeNull()
  })
})
