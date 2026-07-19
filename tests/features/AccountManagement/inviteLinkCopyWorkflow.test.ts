import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const {
  canFetchDisplayAccountInviteLinkMock,
  fetchDisplayAccountInviteLinkMock,
  clipboardWriteTextMock,
} = vi.hoisted(() => ({
  canFetchDisplayAccountInviteLinkMock: vi.fn(),
  fetchDisplayAccountInviteLinkMock: vi.fn(),
  clipboardWriteTextMock: vi.fn(),
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  canFetchDisplayAccountInviteLink: (...args: unknown[]) =>
    canFetchDisplayAccountInviteLinkMock(...args),
  fetchDisplayAccountInviteLink: (...args: unknown[]) =>
    fetchDisplayAccountInviteLinkMock(...args),
}))

const buildAccount = (id: string) =>
  buildDisplaySiteData({
    id,
    name: `Account ${id}`,
    disabled: false,
    siteType: "new-api",
    baseUrl: `https://${id}.example.invalid`,
  })

describe("runInviteLinkCopyWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(true)
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      async (account: { id: string }) =>
        `https://invite.example.invalid/${account.id}`,
    )
    clipboardWriteTextMock.mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
  })

  it("copies one raw link and forwards a cancellable request signal", async () => {
    const controller = new AbortController()

    const result = await runInviteLinkCopyWorkflow({
      accounts: [buildAccount("one")],
      format: "raw",
      signal: controller.signal,
    })

    expect(result.result).toBe(INVITE_LINK_COPY_RESULTS.Success)
    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "one" }),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://invite.example.invalid/one",
    )
  })

  it("starts all supported account fetches without a client concurrency cap", async () => {
    const releases: Array<() => void> = []
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      async (account: { id: string }) => {
        await new Promise<void>((resolve) => releases.push(resolve))
        return `https://invite.example.invalid/${account.id}`
      },
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: Array.from({ length: 6 }, (_, index) =>
        buildAccount(String(index)),
      ),
      format: "labeled",
    })

    await vi.waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(6)
    })
    while (releases.length > 0) {
      releases.shift()?.()
      await Promise.resolve()
    }
    await copyPromise
  })

  it("preserves the generated payload when clipboard access fails", async () => {
    clipboardWriteTextMock.mockRejectedValueOnce(
      new DOMException("Clipboard access denied", "NotAllowedError"),
    )

    const result = await runInviteLinkCopyWorkflow({
      accounts: [buildAccount("manual")],
      format: "labeled",
    })

    expect(result).toMatchObject({
      result: INVITE_LINK_COPY_RESULTS.ClipboardFailure,
      payload: "Account manual: https://invite.example.invalid/manual",
      successCount: 1,
      failureCount: 0,
    })
  })

  it("uses the base URL as the label when the account name is blank", async () => {
    const account = {
      ...buildAccount("blank-name"),
      name: "   ",
      baseUrl: "https://example.invalid",
    }

    await runInviteLinkCopyWorkflow({
      accounts: [account],
      format: "labeled",
    })

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://example.invalid: https://invite.example.invalid/blank-name",
    )
  })

  it("cancels pending requests and never writes stale clipboard data", async () => {
    const controller = new AbortController()
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (_account: unknown, options: { abortSignal: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("stale")],
      format: "raw",
      signal: controller.signal,
    })
    controller.abort()

    await expect(copyPromise).resolves.toMatchObject({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("does not report success after cancellation during clipboard writing", async () => {
    const controller = new AbortController()
    let finishClipboardWrite: (() => void) | undefined
    clipboardWriteTextMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClipboardWrite = resolve
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("clipboard-pending")],
      format: "raw",
      signal: controller.signal,
    })
    await vi.waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1)
    })
    controller.abort()
    finishClipboardWrite?.()

    await expect(copyPromise).resolves.toMatchObject({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
    })
  })

  it("does not impose a feature-specific timeout on queued requests", async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    let resolveFetch: ((value: string) => void) | undefined
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (_account: unknown, options: { abortSignal: AbortSignal }) =>
        new Promise<string>((resolve) => {
          requestSignal = options.abortSignal
          resolveFetch = resolve
        }),
    )

    try {
      const copyPromise = runInviteLinkCopyWorkflow({
        accounts: [buildAccount("slow")],
        format: "raw",
      })
      await vi.advanceTimersByTimeAsync(15_000)
      resolveFetch?.("https://invite.example.invalid/slow")

      await expect(copyPromise).resolves.toMatchObject({
        result: INVITE_LINK_COPY_RESULTS.Success,
      })
      expect(requestSignal).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
