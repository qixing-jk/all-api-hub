import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AccountKeyResourceDeleteDialog } from "~/features/KeyManagement/resources/AccountKeyResourceDeleteDialog"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
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
