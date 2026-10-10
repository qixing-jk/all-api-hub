import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import AddTokenDialog from "~/features/TokenProvisioning/creation/AddTokenDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { createUnattributedAccountCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import {
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keys/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keys/keyVariant"
import { AuthTypeEnum } from "~/types"
import { buildNewApiKeyCreationResult } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

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
  const definition = createNewApiKeyEditor(resolveNewApiKeyVariant("new-api"), {
    baseUrl: account.baseUrl,
    auth: { authType: AuthTypeEnum.AccessToken },
  })
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

  it("opens a preselected account directly in the editor without an account-selection interstitial", async () => {
    const { props, session } = setup()
    let releaseSession: ((value: typeof session) => void) | undefined
    const opening = new Promise<typeof session>((resolve) => {
      releaseSession = resolve
    })
    const open = vi.fn(() => opening)
    context.mockReturnValue({
      accountKeyResources: { open },
      request: {},
    })

    render(<AddTokenDialog {...props} />)

    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(screen.queryByText("keyManagement:dialog.accountSelect")).toBeNull()
    expect(screen.queryByText("common:status.loading")).toBeNull()

    releaseSession?.(session)
    await screen.findByDisplayValue("Native default")
  })

  it("opens creation once without reading the existing key inventory", async () => {
    const { props, session } = setup()
    const list = vi.fn().mockRejectedValue(new Error("inventory unavailable"))
    session.openCollection = async () => ({ list })
    const open = vi.fn().mockResolvedValue(session)
    context.mockReturnValue({ accountKeyResources: { open }, request: {} })

    render(<AddTokenDialog {...props} />)

    await screen.findByDisplayValue("Native default")
    expect(list).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("opens and completes creation when management collections are unavailable", async () => {
    const { props, session, onSuccess } = setup()
    const listScopes = vi
      .fn()
      .mockRejectedValue(new Error("management unavailable"))
    const openCollection = vi
      .fn()
      .mockRejectedValue(new Error("management unavailable"))
    session.listScopes = listScopes
    session.openCollection = openCollection
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    await screen.findByDisplayValue("Native default")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledExactlyOnceWith(creation),
    )
    expect(listScopes).not.toHaveBeenCalled()
    expect(openCollection).not.toHaveBeenCalled()
  })

  it("retries an unavailable creation session from the opening dialog", async () => {
    const { props, session } = setup()
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(session)
    context.mockReturnValue({ accountKeyResources: { open }, request: {} })
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    const retry = await screen.findByRole("button", {
      name: "keyManagement:native.editor.opening.retry",
    })
    expect(screen.queryByText("keyManagement:dialog.accountSelect")).toBeNull()
    const readsBeforeRetry = open.mock.calls.length
    await user.click(retry)
    await screen.findByDisplayValue("Native default")
    expect(open.mock.calls.length).toBeGreaterThan(readsBeforeRetry)
  })

  it("shows cancellable opening feedback while a session is pending and ignores its late result", async () => {
    const { props, session, openCreateEditor, onClose } = setup()
    let resolve!: (value: typeof session) => void
    let signal: AbortSignal | undefined
    context.mockReturnValue({
      accountKeyResources: {
        open: (_: unknown, options: { signal: AbortSignal }) => {
          signal = options.signal
          return new Promise<typeof session>((done) => {
            resolve = done
          })
        },
      },
      request: {},
    })
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    const cancel = await screen.findByRole("button", {
      name: "common:actions.cancel",
    })
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(signal?.aborted).toBe(true)
    await act(async () => resolve(session))
    expect(openCreateEditor).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue("Native default")).toBeNull()
  })

  it("keeps a missing native capability actionable instead of leaving creation spinning", async () => {
    const { props } = setup()
    context.mockReturnValue({ request: {} })
    render(<AddTokenDialog {...props} />)
    expect(
      await screen.findByRole("button", {
        name: "keyManagement:native.editor.opening.retry",
      }),
    ).toBeVisible()
  })

  it("reconciles an uncertain write before allowing another submission and preserves the draft", async () => {
    const { props, session, submit } = setup()
    let resolve!: (value: { items: [] }) => void
    const list = vi.fn(
      () =>
        new Promise<{ items: [] }>((done) => {
          resolve = done
        }),
    )
    session.openCollection = async () => ({ list })
    submit.mockRejectedValueOnce(
      new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
    )
    const user = userEvent.setup()
    render(<AddTokenDialog {...props} />)
    const name = await screen.findByDisplayValue("Native default")
    await user.clear(name)
    await user.type(name, "Keep this draft")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    expect(submit).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ items: [] }))
    expect(await screen.findByDisplayValue("Keep this draft")).toBeVisible()
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    expect(list).toHaveBeenCalledTimes(1)
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

  it("can recover an uncertain write after credentials change during its inventory read", async () => {
    const { props, session, submit, openCreateEditor, onSuccess } = setup()
    const list = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ items: [] })
    session.openCollection = async () => ({ list })
    submit.mockRejectedValueOnce(
      new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
    )
    const user = userEvent.setup()
    const { rerender } = render(<AddTokenDialog {...props} />)
    await screen.findByDisplayValue("Native default")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    rerender(
      <AddTokenDialog
        {...props}
        availableAccounts={[{ ...account, token: "new-login" }]}
      />,
    )
    await waitFor(() => expect(openCreateEditor).toHaveBeenCalledTimes(2))
    await screen.findByDisplayValue("Native default")
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(openCreateEditor).toHaveBeenCalledTimes(3))
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditorSubmitButton),
    )
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(submit).toHaveBeenCalledTimes(2)
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
