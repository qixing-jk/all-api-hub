import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useAccountPostSaveWorkflow } from "~/features/AccountManagement/components/AccountDialog/postSave/useAccountPostSaveWorkflow"
import { ACCOUNT_POST_SAVE_WORKFLOW_STEPS as STEPS } from "~/services/accounts/accountPostSaveWorkflow"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildDisplaySiteData,
  buildNewApiToken,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  getDisplay: vi.fn(),
  ensureKey: vi.fn(),
  resolveKey: vi.fn(),
  openChannel: vi.fn(),
  error: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({
    openWithAccount: mocks.openChannel,
    openWithCredentials: vi.fn(),
    openDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  }),
}))
vi.mock("~/lib/notify", () => ({ default: { error: mocks.error } }))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: mocks.getAccount },
}))
vi.mock("~/services/accounts/accountStorage/accountReadModels", () => ({
  accountReadModels: { getDisplayDataById: mocks.getDisplay },
}))
vi.mock("~/services/accounts/accountKeyCreation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/accountKeyCreation")
  >()),
  ensureAccountKey: mocks.ensureKey,
  resolveCreatedAccountRuntimeKey: mocks.resolveKey,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const display = buildDisplaySiteData({ id: "saved" })
const runtimeKey = buildNewApiRuntimeKey(display, buildNewApiToken())

function setup() {
  const onSuccess = vi.fn()
  const hook = renderHook(() =>
    useAccountPostSaveWorkflow({
      managedSiteType: SITE_TYPES.NEW_API,
      onSuccess,
    }),
  )
  const saveAccount = vi.fn().mockResolvedValue({
    success: true,
    accountId: "saved",
  })
  const ready = vi.fn().mockResolvedValue(true)
  const execute = () =>
    hook.result.current.executeAutoConfig({
      saveAccount,
      ensureManagedSiteAutoConfigReady: ready,
    })
  return { ...hook, onSuccess, saveAccount, ready, execute }
}

describe("post-save workflow recovery and cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getAccount.mockResolvedValue(buildSiteAccount({ id: "saved" }))
    mocks.getDisplay.mockResolvedValue(display)
    mocks.ensureKey.mockResolvedValue({ kind: "ready", runtimeKey })
    mocks.openChannel.mockResolvedValue({ opened: true })
  })

  it("reports a prerequisite failure without saving or entering auto-configuration", async () => {
    const { result, ready, saveAccount, execute } = setup()
    ready.mockRejectedValue(new Error("configuration unavailable"))
    await act(execute)
    expect(mocks.error).toHaveBeenCalledWith("messages.operationFailed")
    expect(saveAccount).not.toHaveBeenCalled()
    expect(result.current.state.isAutoConfiguring).toBe(false)
  })

  it.each(["resolve", "reject"] as const)(
    "ignores a prerequisite %s after the workflow is cleared",
    async (settlement) => {
      const { result, ready, saveAccount, execute } = setup()
      const pending = deferred<boolean>()
      ready.mockReturnValue(pending.promise)
      let running!: Promise<void>
      act(() => {
        running = execute()
      })
      act(() => result.current.clear())
      await act(async () => {
        if (settlement === "resolve") pending.resolve(true)
        else pending.reject(new Error("late failure"))
        await running
      })
      expect(saveAccount).not.toHaveBeenCalled()
      expect(mocks.error).not.toHaveBeenCalled()
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(STEPS.Idle)
    },
  )

  it.each(["save", "account", "display"] as const)(
    "does not continue from a late %s result after clearing the workflow",
    async (stage) => {
      const { result, saveAccount, execute } = setup()
      const pending = deferred<unknown>()
      const boundary =
        stage === "save"
          ? saveAccount
          : stage === "account"
            ? mocks.getAccount
            : mocks.getDisplay
      boundary.mockReturnValue(pending.promise)
      let running!: Promise<void>
      await act(async () => {
        running = execute()
      })
      expect(boundary).toHaveBeenCalledOnce()
      act(() => result.current.clear())
      await act(async () => {
        pending.resolve(
          stage === "save"
            ? { success: true, accountId: "saved" }
            : stage === "account"
              ? buildSiteAccount({ id: "saved" })
              : display,
        )
        await running
      })
      expect(mocks.ensureKey).not.toHaveBeenCalled()
      expect(mocks.openChannel).not.toHaveBeenCalled()
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(STEPS.Idle)
    },
  )

  it.each([false, true])(
    "keeps key-check failures scoped to their active workflow (cleared=%s)",
    async (cleared) => {
      const { result, execute } = setup()
      const pending = deferred<never>()
      mocks.ensureKey.mockReturnValue(pending.promise)
      let running!: Promise<void>
      await act(async () => {
        running = execute()
      })
      expect(mocks.ensureKey).toHaveBeenCalledOnce()
      if (cleared) act(() => result.current.clear())
      await act(async () => {
        pending.reject(new Error("key inventory unavailable"))
        await running
      })
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        cleared ? STEPS.Idle : STEPS.Failed,
      )
      expect(mocks.error).toHaveBeenCalledTimes(cleared ? 0 : 1)
      expect(result.current.state.isAutoConfiguring).toBe(false)
    },
  )

  it.each(["resolve", "reject"] as const)(
    "ignores channel opening %s after clearing the workflow",
    async (settlement) => {
      const { result, onSuccess, execute } = setup()
      const pending = deferred<{ opened: boolean }>()
      mocks.openChannel.mockReturnValue(pending.promise)
      let running!: Promise<void>
      await act(async () => {
        running = execute()
      })
      expect(mocks.openChannel).toHaveBeenCalledOnce()
      const completed = mocks.openChannel.mock.calls[0]![2]
      act(() => result.current.clear())
      await act(async () => {
        if (settlement === "resolve") pending.resolve({ opened: true })
        else pending.reject(new Error("late opening failure"))
        await running
        completed()
      })
      expect(onSuccess).not.toHaveBeenCalled()
      expect(mocks.error).not.toHaveBeenCalled()
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(STEPS.Idle)
    },
  )

  it.each([false, true])(
    "distinguishes rejected channel admission from deferred admission (deferred=%s)",
    async (deferred) => {
      const { result, execute } = setup()
      mocks.openChannel.mockResolvedValue({ opened: false, deferred })
      await act(execute)
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        deferred ? STEPS.OpeningManagedSiteDialog : STEPS.Failed,
      )
      expect(result.current.state.isAutoConfiguring).toBe(false)
    },
  )

  it.each([false, true])(
    "handles native key recovery failures only for the current input session (cleared=%s)",
    async (cleared) => {
      const { result, execute } = setup()
      mocks.ensureKey.mockResolvedValue({ kind: "input-required" })
      await act(execute)
      const handlers =
        result.current.handlers.getPostSaveKeyInputDialogHandlers(
          result.current.state.postSaveKeyInputSessionId!,
        )
      const pending = deferred<never>()
      mocks.resolveKey.mockReturnValue(pending.promise)
      let running!: Promise<void>
      await act(async () => {
        running = handlers.onSuccess({ ref: null, facts: null })
      })
      if (cleared) act(() => result.current.clear())
      await act(async () => {
        pending.reject(new Error("native recovery unavailable"))
        await running
      })
      expect(result.current.state.accountPostSaveWorkflowStep).toBe(
        cleared ? STEPS.Idle : STEPS.Failed,
      )
      expect(mocks.error).toHaveBeenCalledTimes(cleared ? 0 : 1)
      expect(mocks.openChannel).not.toHaveBeenCalled()
    },
  )
})
