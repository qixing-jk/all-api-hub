import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountKeyProvisioningDialog } from "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const { prepare, notify } = vi.hoisted(() => ({
  prepare: vi.fn(),
  notify: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock("~/lib/notify", () => ({ default: notify }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "keyManagement:provisioning.progress"
        ? `${options?.created} / ${options?.total}; ${options?.covered}`
        : key,
  }),
}))
vi.mock("~/services/accounts/keys/accountKeyProvisioning", () => ({
  prepareAccountKeyProvisioning: prepare,
}))
vi.mock(
  "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction",
  () => ({ buildOneTimeApiKeyProfileSaveAction: vi.fn() }),
)
vi.mock(
  "~/features/KeyManagement/resources/AccountKeyResourceEditorDialog",
  () => ({
    AccountKeyResourceEditorDialog: ({
      editor,
      onSubmit,
      onClose,
      notice,
      onLoadOptions,
      onValuesChange,
    }: any) =>
      editor ? (
        <div role="dialog" aria-label="Input">
          <p>{notice}</p>
          <p>{JSON.stringify(editor.feedback)}</p>
          <p>{JSON.stringify(editor.optionsByField)}</p>
          <p>{JSON.stringify(editor.optionFailuresByField)}</p>
          <button
            onClick={() =>
              onLoadOptions(editor.editorId, "models", editor.values)
            }
          >
            Load options
          </button>
          <button onClick={() => onValuesChange(editor.editorId, { quota: 7 })}>
            Edit values
          </button>
          <button onClick={() => onSubmit(editor.editorId, { quota: 5 })}>
            Accept input
          </button>
          <button onClick={() => onClose(editor.editorId)}>Cancel input</button>
        </div>
      ) : null,
  }),
)
vi.mock(
  "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog",
  () => ({
    OneTimeSecretDialog: ({ result, onClose }: any) =>
      result ? (
        <div role="dialog" aria-label="Secret">
          <p>{result.secret}</p>
          <button onClick={onClose}>Secret handled</button>
        </div>
      ) : null,
  }),
)
const account = buildDisplaySiteData({ siteType: "voapi-v2" })
const entry = (key: string, input = false) => ({
  key,
  label: key,
  create: vi.fn().mockResolvedValue({ ref: null, facts: null }),
  ...(input
    ? {
        editor: {
          fields: [],
          initialValues: { quota: 0 },
          validate: () => ({ valid: true }),
          loadOptions: vi.fn(),
        },
      }
    : {}),
})
const setup = () => {
  const onClose = vi.fn()
  return {
    onClose,
    ...render(
      <AccountKeyProvisioningDialog
        account={account}
        mode="all-groups"
        onClose={onClose}
      />,
    ),
  }
}

describe("foreground account key provisioning", () => {
  it.each([false, true])(
    "ignores a stale option load after a newer successful request (reject=%s)",
    async (reject) => {
      const user = userEvent.setup()
      const manual = entry("manual", true)
      const pending =
        createDeferred<readonly { value: string; displayLabel: string }[]>()
      manual
        .editor!.loadOptions.mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce([
          { value: "new", displayLabel: "Newest choice" },
        ])
      prepare.mockResolvedValue({ coveredCount: 0, entries: [manual] })
      setup()
      await user.click(
        await screen.findByRole("button", { name: "Load options" }),
      )
      await user.click(screen.getByRole("button", { name: "Load options" }))
      await screen.findByText(/Newest choice/)
      await act(async () => {
        if (reject) pending.reject(new Error("Stale failure"))
        else pending.resolve([{ value: "old", displayLabel: "Stale choice" }])
      })
      expect(screen.getByText(/Newest choice/)).toBeVisible()
      expect(
        screen.queryByText(/Stale choice|unexpected/),
      ).not.toBeInTheDocument()
      expect(manual.create).not.toHaveBeenCalled()
    },
  )
  beforeEach(() => {
    prepare.mockReset()
    vi.clearAllMocks()
  })

  it("finishes an automatic plan without requiring a result-dialog click", async () => {
    const automatic = entry("automatic")
    prepare.mockResolvedValue({ coveredCount: 0, entries: [automatic] })
    const { onClose } = setup()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(automatic.create).toHaveBeenCalledOnce()
  })

  it("collects every input before creating any key", async () => {
    const user = userEvent.setup()
    const first = entry("first", true),
      second = entry("second", true)
    prepare.mockResolvedValue({ coveredCount: 0, entries: [first, second] })
    setup()
    await user.click(
      await screen.findByRole("button", { name: "Accept input" }),
    )
    expect(first.create).not.toHaveBeenCalled()
    expect(second.create).not.toHaveBeenCalled()
    await user.click(
      await screen.findByRole("button", { name: "Accept input" }),
    )
    await waitFor(() =>
      expect(second.create).toHaveBeenCalledWith({ quota: 5 }),
    )
    expect(first.create).toHaveBeenCalledWith({ quota: 5 })
  })

  it("cancels an input batch without writing the automatic requirements", async () => {
    const user = userEvent.setup()
    const automatic = entry("automatic"),
      manual = entry("manual", true)
    prepare.mockResolvedValue({ coveredCount: 0, entries: [automatic, manual] })
    const { onClose } = setup()
    await user.click(
      await screen.findByRole("button", { name: "Cancel input" }),
    )
    expect(automatic.create).not.toHaveBeenCalled()
    expect(manual.create).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("waits for a response-only secret to be handled before the next creation", async () => {
    const user = userEvent.setup()
    const first = entry("first"),
      second = entry("second")
    first.create.mockResolvedValue({
      ref: null,
      facts: null,
      createdSecret: { secret: "one-time" },
    } as never)
    prepare.mockResolvedValue({ coveredCount: 0, entries: [first, second] })
    setup()
    await screen.findByRole("dialog", { name: "Secret" })
    expect(second.create).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Secret handled" }))
    await waitFor(() => expect(second.create).toHaveBeenCalledOnce())
  })

  it("reports partial completion and stops after an uncertain write", async () => {
    const first = entry("first"),
      second = entry("second"),
      third = entry("third")
    second.create.mockRejectedValue(
      new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
    )
    prepare.mockResolvedValue({
      coveredCount: 0,
      entries: [first, second, third],
    })
    setup()
    await screen.findByText(/1.*3/)
    await screen.findByRole("alert")
    expect(second.create).toHaveBeenCalledOnce()
    expect(third.create).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument()
  })

  it.each(["cancel", "close"])(
    "lets the in-flight write settle after %s and preserves its one-time secret",
    async (action) => {
      const user = userEvent.setup()
      const pending = createDeferred<any>()
      const first = entry("first"),
        second = entry("second")
      first.create.mockReturnValue(pending.promise)
      prepare.mockResolvedValue({ coveredCount: 0, entries: [first, second] })
      const { onClose } = setup()
      await waitFor(() => expect(first.create).toHaveBeenCalledOnce())
      await user.click(
        await screen.findByRole("button", { name: `common:actions.${action}` }),
      )
      expect(onClose).not.toHaveBeenCalled()
      await act(async () =>
        pending.resolve({
          ref: null,
          facts: null,
          createdSecret: { secret: "retained" },
        }),
      )
      await screen.findByRole("dialog", { name: "Secret" })
      await user.click(screen.getByRole("button", { name: "Secret handled" }))
      await screen.findByText("keyManagement:provisioning.cancelled")
      expect(second.create).not.toHaveBeenCalled()
    },
  )

  it("ignores an old source plan after the account changes", async () => {
    const pending = createDeferred<any>()
    const stale = entry("stale")
    prepare
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ coveredCount: 1, entries: [] })
    const { rerender } = setup()
    rerender(
      <AccountKeyProvisioningDialog
        account={{ ...account, token: "replacement" }}
        mode="all-groups"
        onClose={vi.fn()}
      />,
    )
    await act(async () =>
      pending.resolve({ coveredCount: 0, entries: [stale] }),
    )
    expect(stale.create).not.toHaveBeenCalled()
  })

  it("hands off a settled one-time secret after the owner unmounts without aborting the write", async () => {
    const user = userEvent.setup()
    const pending = createDeferred<any>()
    const first = entry("first"),
      second = entry("second")
    first.create.mockReturnValue(pending.promise)
    prepare.mockResolvedValue({ coveredCount: 0, entries: [first, second] })
    const { unmount } = setup()
    await waitFor(() => expect(first.create).toHaveBeenCalledOnce())
    const signal = prepare.mock.calls[0]![2].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(false)
    await act(async () =>
      pending.resolve({
        ref: null,
        facts: null,
        createdSecret: { secret: "detached-secret" },
      }),
    )
    expect(await screen.findByText("detached-secret")).toBeVisible()
    expect(second.create).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Secret handled" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Secret" }),
      ).not.toBeInTheDocument(),
    )
  })

  it("keeps an already displayed secret available when its parent closes", async () => {
    const user = userEvent.setup()
    const first = entry("first")
    first.create.mockResolvedValue({
      ref: null,
      facts: null,
      createdSecret: { secret: "visible-secret" },
    } as never)
    prepare.mockResolvedValue({ coveredCount: 0, entries: [first] })
    const { unmount } = setup()
    await screen.findByText("visible-secret")
    unmount()
    expect(await screen.findByText("visible-secret")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Secret handled" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Secret" }),
      ).not.toBeInTheDocument(),
    )
  })

  it.each(["confirmed", "uncertain", "rejected"] as const)(
    "reports a detached %s mutation and stops subsequent writes",
    async (outcome) => {
      const pending = createDeferred<any>()
      const first = entry("first"),
        second = entry("second")
      first.create.mockReturnValue(pending.promise)
      prepare.mockResolvedValue({ coveredCount: 0, entries: [first, second] })
      const { unmount } = setup()
      await waitFor(() => expect(first.create).toHaveBeenCalledOnce())
      unmount()
      await act(async () => {
        if (outcome === "confirmed") pending.resolve({ ref: null, facts: null })
        else if (outcome === "uncertain")
          pending.reject(
            new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
          )
        else
          pending.reject(
            new AccountKeyResourceError({ code: "validation_failed" }),
          )
      })
      expect(second.create).not.toHaveBeenCalled()
      if (outcome === "confirmed")
        expect(notify.info).toHaveBeenCalledWith("1 / 2; 0")
      else
        expect(notify.error).toHaveBeenCalledWith(
          outcome === "uncertain"
            ? "keyManagement:native.editor.feedback.uncertain"
            : "keyManagement:native.editor.feedback.error",
        )
    },
  )

  it("closes an already covered plan without writes", async () => {
    prepare.mockResolvedValue({ coveredCount: 1, entries: [] })
    const { onClose } = setup()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it("reports preparation failures and permits closing", async () => {
    const user = userEvent.setup()
    prepare.mockRejectedValue(new Error("inventory failed"))
    const { onClose } = setup()
    await screen.findByRole("alert")
    await user.click(
      screen.getAllByRole("button", { name: "common:actions.close" }).at(-1)!,
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("keeps invalid input editable and loads native options from updated values", async () => {
    const user = userEvent.setup()
    const manual = entry("manual", true)
    manual.editor!.validate = vi
      .fn()
      .mockReturnValueOnce({
        valid: false,
        issues: [{ fieldId: "quota", code: "out_of_range" }],
      })
      .mockReturnValue({ valid: true })
    manual.editor!.loadOptions.mockResolvedValue([
      { value: "new-model", displayLabel: "New model" },
    ])
    prepare.mockResolvedValue({ coveredCount: 0, entries: [manual] })
    setup()
    await user.click(
      await screen.findByRole("button", { name: "Accept input" }),
    )
    expect(manual.create).not.toHaveBeenCalled()
    expect(screen.getByText(/validation_failed/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Edit values" }))
    await user.click(screen.getByRole("button", { name: "Load options" }))
    expect(manual.editor!.loadOptions).toHaveBeenCalledWith(
      "models",
      { quota: 7 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(await screen.findByText(/new-model/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Accept input" }))
    await waitFor(() => expect(manual.create).toHaveBeenCalledOnce())
  })

  it.each([true, false])(
    "shows option failure and recovers through reloading (native error: %s)",
    async (nativeError) => {
      const user = userEvent.setup()
      const manual = entry("manual", true)
      manual
        .editor!.loadOptions.mockRejectedValueOnce(
          nativeError
            ? new AccountKeyResourceError({ code: "unavailable" })
            : new Error("options failed"),
        )
        .mockResolvedValue([{ value: "recovered", displayLabel: "Recovered" }])
      prepare.mockResolvedValue({ coveredCount: 0, entries: [manual] })
      setup()
      await user.click(
        await screen.findByRole("button", { name: "Load options" }),
      )
      expect(
        await screen.findByText(
          new RegExp(nativeError ? "unavailable" : "unexpected"),
        ),
      ).toBeVisible()
      await user.click(screen.getByRole("button", { name: "Load options" }))
      expect(await screen.findByText(/recovered/)).toBeVisible()
      expect(manual.create).not.toHaveBeenCalled()
    },
  )
})
