import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { createUnattributedAccountCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { AccountKeyResourceEditor } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
import { AuthTypeEnum } from "~/types"
import { buildNewApiKeyCreationResult } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const { context } = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: context,
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
  resolveProductAnalyticsErrorCategoryFromError: () => "unknown",
}))
const account = buildDisplaySiteData({
  siteType: "new-api",
  id: "native-creation-account",
})
const creation = buildNewApiKeyCreationResult(
  account,
  buildNewApiToken({ name: "Created native key" }),
)

function setup() {
  const scope = {
    scopeKey: "account",
    routeKey: "account",
    displayName: "Account",
    isDefault: true,
  }
  const submit = vi.fn().mockResolvedValue(creation)
  const definition = createNewApiKeyEditor(
    "new-api",
    { baseUrl: account.baseUrl, auth: { authType: AuthTypeEnum.AccessToken } },
    resolveNewApiFamilyTokenTransport("new-api"),
  )
  const initialValues = { ...definition.initialValues, name: "Native default" }
  const openCreateEditor = vi.fn().mockResolvedValue({
    fields: definition.fields,
    initialValues,
    resolveDestinationScopeKey: () => "account",
    loadOptions: async () => [],
    validate: () => ({ valid: true, issues: [] }),
    submit,
  } satisfies AccountKeyResourceEditor)
  const session = {
    resolveDefaultScope: async () => scope,
    listScopes: async () => [scope],
    openCollection: async () => ({ list: async () => ({ items: [] }) }),
    openCreateEditor,
  }
  context.mockReturnValue({
    accountKeyResources: { open: async () => session },
    request: {},
  })
  const onSuccess = vi.fn()
  const onClose = vi.fn()
  const props = {
    isOpen: true,
    availableAccounts: [account],
    preSelectedAccountId: account.id,
    onSuccess,
    onClose,
  }
  return {
    props,
    submit,
    openCreateEditor,
    onSuccess,
    onClose,
    initialValues,
    session,
  }
}

describe("native AddTokenDialog", () => {
  beforeEach(() => {
    context.mockReset()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it("shows an unsupported account message when no native inventory exists", async () => {
    const { props } = setup()
    render(
      <AddTokenDialog
        {...props}
        availableAccounts={[]}
        preSelectedAccountId={null}
      />,
    )
    expect(
      await screen.findByText("ui:dialog.copyKey.createNotSupported"),
    ).toBeVisible()
  })

  it("requires selecting an account when multiple accounts are available", async () => {
    const { props, openCreateEditor } = setup()
    const user = userEvent.setup()
    render(
      <AddTokenDialog
        {...props}
        availableAccounts={[
          account,
          { ...account, id: "second-account", name: "Second" },
        ]}
        preSelectedAccountId={null}
      />,
    )
    await user.click(await screen.findByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Second" }))
    await screen.findByDisplayValue("Native default")
    expect(openCreateEditor).toHaveBeenCalledTimes(1)
  })

  it("retries an unavailable inventory before opening the editor", async () => {
    const { props, session } = setup()
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(session)
    context.mockReturnValue({ accountKeyResources: { open }, request: {} })
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    const retry = await screen.findByRole("button", {
      name: "common:actions.retry",
    })
    const readsBeforeRetry = open.mock.calls.length
    await user.click(retry)
    await screen.findByDisplayValue("Native default")
    expect(open.mock.calls.length).toBeGreaterThan(readsBeforeRetry)
  })

  it("closes after a successful write even if the consumer handoff fails", async () => {
    const { props, onSuccess, onClose, submit } = setup()
    onSuccess.mockRejectedValueOnce(new Error("consumer unavailable"))
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    await screen.findByDisplayValue("Native default")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("cancels an open native editor without submitting a write", async () => {
    const { props, onClose, submit } = setup()
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    const editor = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.nativeEditor,
    )
    await user.click(
      within(editor).getByRole("button", { name: "common:actions.close" }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
  })

  it("forwards semantic intent and submits the provider's native draft once", async () => {
    const { props, submit, openCreateEditor, onSuccess, initialValues } =
      setup()
    const user = userEvent.setup()
    render(
      <AddTokenDialog
        {...props}
        createPrefill={{
          modelId: "model-a",
          group: "vip",
          allowedGroups: ["vip"],
          defaultName: "Suggested",
        }}
      />,
      { reactStrictMode: true },
    )
    const input = await screen.findByDisplayValue("Native default")
    await user.clear(input)
    await user.type(input, "Manual name")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith(creation),
    )
    expect(submit).toHaveBeenCalledTimes(1)
    expect(atIndex(submit.mock.calls, 0)[0]).toEqual({
      ...initialValues,
      name: "Manual name",
    })
    expect(openCreateEditor).toHaveBeenCalledWith(
      "account",
      expect.any(Object),
      {
        nameHint: "Suggested",
        preferredGroup: "vip",
        allowedGroups: ["vip"],
        modelContext: { modelId: "model-a" },
      },
    )
  })

  it("reopens the native editor after the selected account credentials change", async () => {
    const { props, openCreateEditor } = setup()
    const { rerender } = render(<AddTokenDialog {...props} />)
    await screen.findByDisplayValue("Native default")
    const first = openCreateEditor.mock.calls.length
    rerender(
      <AddTokenDialog
        {...props}
        availableAccounts={[{ ...account, token: "new-login" }]}
      />,
    )
    await waitFor(() =>
      expect(openCreateEditor.mock.calls.length).toBeGreaterThan(first),
    )
    await screen.findByDisplayValue("Native default")
  })

  it.each([true, false])(
    "retains a response-only secret with acknowledgement ownership %s",
    async (showOneTimeKeyDialog) => {
      const { props, submit, onSuccess, onClose } = setup()
      const createdSecret = createUnattributedAccountCreatedRuntimeSecret({
        accountId: account.id,
        displayName: "Only copy",
        secret: "one-time-test-secret",
        credential: {
          accountName: account.name,
          baseUrl: account.baseUrl,
          apiType: "openai-compatible",
          tagIds: [],
        },
      })
      submit.mockResolvedValue({ facts: null, createdSecret })
      const user = userEvent.setup()
      const writeText = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined)
      render(
        <AddTokenDialog
          {...props}
          showOneTimeKeyDialog={showOneTimeKeyDialog}
        />,
      )
      await screen.findByDisplayValue("Native default")
      await user.click(
        screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
      )
      if (showOneTimeKeyDialog) {
        await screen.findByDisplayValue("one-time-test-secret")
        expect(onSuccess).not.toHaveBeenCalled()
        await waitFor(() => expect(writeText).toHaveBeenCalled())
        await user.click(
          screen.getByTestId(TOKEN_PROVISIONING_TEST_IDS.oneTimeKeyCloseButton),
        )
      }
      await waitFor(() =>
        expect(onSuccess).toHaveBeenCalledExactlyOnceWith({
          ref: null,
          facts: null,
          createdSecret,
        }),
      )
      expect(onClose).toHaveBeenCalledTimes(1)
    },
  )
})
