import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  BULK_INVITE_LINK_COPY_POLICY,
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { createSiteRequestLimiter } from "~/services/apiTransport/siteRequestLimiter"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
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

  it("returns cancelled immediately when the parent signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await runInviteLinkCopyWorkflow({
      accounts: [buildAccount("already-cancelled")],
      format: "raw",
      signal: controller.signal,
    })

    expect(result).toEqual({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      selectedCount: 1,
      itemCount: 1,
      successCount: 0,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })
    expect(fetchDisplayAccountInviteLinkMock).not.toHaveBeenCalled()
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("starts every supported fetch without a global cap under the bulk policy", async () => {
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
      ...BULK_INVITE_LINK_COPY_POLICY,
    })

    await vi.waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(6)
    })

    releases.splice(0).forEach((release) => release())

    await copyPromise
  })

  it("forwards request deadlines without expiring site-limiter queue time", async () => {
    vi.useFakeTimers()
    const limiter = createSiteRequestLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60_000,
      burst: 1,
    })
    const startedAccountIds: string[] = []
    let releaseFirst: (() => void) | undefined
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (
        account: { id: string },
        options: {
          abortSignal?: AbortSignal
          requestTimeoutMs?: number
        },
      ) =>
        limiter(
          "https://shared.example.invalid",
          async () => {
            startedAccountIds.push(account.id)
            if (account.id === "first") {
              await new Promise<void>((resolve) => {
                releaseFirst = resolve
              })
            }
            return `https://invite.example.invalid/${account.id}`
          },
          options.abortSignal,
        ),
    )

    try {
      const copyPromise = runInviteLinkCopyWorkflow({
        accounts: [buildAccount("first"), buildAccount("queued")],
        format: "raw",
        requestTimeoutMs: 1_000,
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(startedAccountIds).toEqual(["first"])

      await vi.advanceTimersByTimeAsync(1_000)
      expect(startedAccountIds).toEqual(["first"])
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: "first" }),
        expect.objectContaining({ requestTimeoutMs: 1_000 }),
      )
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: "queued" }),
        expect.objectContaining({ requestTimeoutMs: 1_000 }),
      )

      releaseFirst?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(startedAccountIds).toEqual(["first", "queued"])

      await expect(copyPromise).resolves.toEqual({
        result: INVITE_LINK_COPY_RESULTS.Success,
        payload:
          "https://invite.example.invalid/first\nhttps://invite.example.invalid/queued",
        selectedCount: 2,
        itemCount: 2,
        successCount: 2,
        failureCount: 0,
        unsupportedCount: 0,
        skippedCount: 0,
      })
    } finally {
      releaseFirst?.()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it("preserves account order when concurrent fetches finish out of order", async () => {
    const resolvers = new Map<string, (value: string) => void>()
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (account: { id: string }) =>
        new Promise<string>((resolve) => {
          resolvers.set(account.id, resolve)
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("first"), buildAccount("second")],
      format: "raw",
    })
    await vi.waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
    })

    resolvers.get("second")?.("https://invite.example.invalid/second")
    resolvers.get("first")?.("https://invite.example.invalid/first")

    await copyPromise
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://invite.example.invalid/first\nhttps://invite.example.invalid/second",
    )
  })

  it("returns exact unsupported counts without touching the clipboard", async () => {
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(false)
    const disabledAccount = {
      ...buildAccount("disabled"),
      disabled: true,
    }

    const result = await runInviteLinkCopyWorkflow({
      accounts: [buildAccount("unsupported"), disabledAccount],
      format: "raw",
    })

    expect(result).toEqual({
      result: INVITE_LINK_COPY_RESULTS.Unsupported,
      selectedCount: 2,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      unsupportedCount: 1,
      skippedCount: 1,
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("returns exact failure counts when every supported fetch fails", async () => {
    fetchDisplayAccountInviteLinkMock.mockRejectedValue(
      new InviteLinkError(INVITE_LINK_FAILURE_REASONS.FeatureDisabled),
    )

    const result = await runInviteLinkCopyWorkflow({
      accounts: [buildAccount("first"), buildAccount("second")],
      format: "raw",
    })

    expect(result).toEqual({
      result: INVITE_LINK_COPY_RESULTS.Failure,
      selectedCount: 2,
      itemCount: 2,
      successCount: 0,
      failureCount: 2,
      failureReasonCounts: {
        [INVITE_LINK_FAILURE_REASONS.FeatureDisabled]: 2,
      },
      unsupportedCount: 0,
      skippedCount: 0,
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("returns exact partial-success counts and copies only successful links", async () => {
    canFetchDisplayAccountInviteLinkMock.mockImplementation(
      (account: { id: string }) => account.id !== "unsupported",
    )
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      async (account: { id: string }) => {
        if (account.id === "failed") {
          throw new InviteLinkError(
            INVITE_LINK_FAILURE_REASONS.AuthenticationRequired,
          )
        }
        return `https://invite.example.invalid/${account.id}`
      },
    )
    const disabledAccount = {
      ...buildAccount("disabled"),
      disabled: true,
    }

    const result = await runInviteLinkCopyWorkflow({
      accounts: [
        buildAccount("successful"),
        buildAccount("failed"),
        buildAccount("unsupported"),
        disabledAccount,
      ],
      format: "labeled",
    })

    expect(result).toEqual({
      result: INVITE_LINK_COPY_RESULTS.PartialSuccess,
      payload: "Account successful: https://invite.example.invalid/successful",
      selectedCount: 4,
      itemCount: 2,
      successCount: 1,
      failureCount: 1,
      failureReasonCounts: {
        [INVITE_LINK_FAILURE_REASONS.AuthenticationRequired]: 1,
      },
      unsupportedCount: 1,
      skippedCount: 1,
    })
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "Account successful: https://invite.example.invalid/successful",
    )
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

  it("keeps the committed partial-success result after clipboard writing resolves", async () => {
    const controller = new AbortController()
    let finishClipboardWrite: (() => void) | undefined
    clipboardWriteTextMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClipboardWrite = resolve
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [
        buildAccount("clipboard-pending"),
        { ...buildAccount("disabled"), disabled: true },
      ],
      format: "raw",
      signal: controller.signal,
    })
    await vi.waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1)
    })
    finishClipboardWrite?.()
    controller.abort()

    await expect(copyPromise).resolves.toMatchObject({
      result: INVITE_LINK_COPY_RESULTS.PartialSuccess,
      successCount: 1,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 1,
    })
  })

  it("returns cancelled when the parent aborts before clipboard writing resolves", async () => {
    const controller = new AbortController()
    let finishClipboardWrite: (() => void) | undefined
    clipboardWriteTextMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClipboardWrite = resolve
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("clipboard-cancelled")],
      format: "raw",
      signal: controller.signal,
    })
    await vi.waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1)
    })
    controller.abort()
    finishClipboardWrite?.()

    await expect(copyPromise).resolves.toEqual({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      payload: "https://invite.example.invalid/clipboard-cancelled",
      selectedCount: 1,
      itemCount: 1,
      successCount: 1,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })
  })

  it("returns cancelled when the parent aborts before clipboard writing rejects", async () => {
    const controller = new AbortController()
    let failClipboardWrite: ((reason?: unknown) => void) | undefined
    clipboardWriteTextMock.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failClipboardWrite = reject
        }),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("clipboard-rejected-after-cancel")],
      format: "raw",
      signal: controller.signal,
    })
    await vi.waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1)
    })
    controller.abort()
    failClipboardWrite?.(
      new DOMException("Clipboard access denied", "NotAllowedError"),
    )

    await expect(copyPromise).resolves.toEqual({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      payload: "https://invite.example.invalid/clipboard-rejected-after-cancel",
      selectedCount: 1,
      itemCount: 1,
      successCount: 1,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })
  })

  it("times out one slow request without delaying successful concurrent work", async () => {
    vi.useFakeTimers()
    let resolveSlowFetch: ((value: string) => void) | undefined
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (
        account: { id: string },
        options: {
          abortSignal?: AbortSignal
          requestTimeoutMs?: number
        },
      ) =>
        runAbortableTask(
          async () => {
            if (account.id === "slow") {
              return await new Promise<string>((resolve) => {
                resolveSlowFetch = resolve
              })
            }
            return `https://invite.example.invalid/${account.id}`
          },
          {
            signals: [options.abortSignal],
            timeoutMs: options.requestTimeoutMs,
          },
        ),
    )

    try {
      const copyPromise = runInviteLinkCopyWorkflow({
        accounts: [buildAccount("slow"), buildAccount("successful")],
        format: "raw",
        requestTimeoutMs: 1_000,
      })

      await vi.advanceTimersByTimeAsync(1_000)
      const startedCountAfterTimeout =
        fetchDisplayAccountInviteLinkMock.mock.calls.length
      resolveSlowFetch?.("https://invite.example.invalid/late")

      await expect(copyPromise).resolves.toEqual({
        result: INVITE_LINK_COPY_RESULTS.PartialSuccess,
        payload: "https://invite.example.invalid/successful",
        selectedCount: 2,
        itemCount: 2,
        successCount: 1,
        failureCount: 1,
        failureReasonCounts: {
          [INVITE_LINK_FAILURE_REASONS.Timeout]: 1,
        },
        unsupportedCount: 0,
        skippedCount: 0,
      })
      expect(startedCountAfterTimeout).toBe(2)
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "https://invite.example.invalid/successful",
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops every unresolved request at the batch deadline while keeping successes", async () => {
    vi.useFakeTimers()
    const startedAccountIds: string[] = []
    const requestSignals: Array<{ accountId: string; signal: AbortSignal }> = []
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      (account: { id: string }, options: { abortSignal?: AbortSignal }) => {
        startedAccountIds.push(account.id)
        if (options.abortSignal) {
          requestSignals.push({
            accountId: account.id,
            signal: options.abortSignal,
          })
        }
        if (account.id === "successful") {
          return Promise.resolve("https://invite.example.invalid/successful")
        }
        return new Promise<string>(() => {})
      },
    )

    try {
      const copyPromise = runInviteLinkCopyWorkflow({
        accounts: [
          buildAccount("successful"),
          buildAccount("active-one"),
          buildAccount("active-two"),
          buildAccount("active-three"),
          buildAccount("active-four"),
        ],
        format: "raw",
        batchTimeoutMs: 2_000,
      })

      await vi.advanceTimersByTimeAsync(2_000)

      await expect(copyPromise).resolves.toEqual({
        result: INVITE_LINK_COPY_RESULTS.PartialSuccess,
        payload: "https://invite.example.invalid/successful",
        selectedCount: 5,
        itemCount: 5,
        successCount: 1,
        failureCount: 4,
        failureReasonCounts: {
          [INVITE_LINK_FAILURE_REASONS.Timeout]: 4,
        },
        unsupportedCount: 0,
        skippedCount: 0,
      })
      expect(startedAccountIds).toHaveLength(5)
      expect(requestSignals).toHaveLength(5)
      expect(
        requestSignals
          .filter(({ accountId }) => accountId.startsWith("active-"))
          .every(({ signal }) => signal.aborted),
      ).toBe(true)
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "https://invite.example.invalid/successful",
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("prioritizes parent cancellation over request and batch timeouts", async () => {
    const controller = new AbortController()
    fetchDisplayAccountInviteLinkMock.mockImplementation(
      () => new Promise<string>(() => {}),
    )

    const copyPromise = runInviteLinkCopyWorkflow({
      accounts: [buildAccount("active-one"), buildAccount("active-two")],
      format: "raw",
      signal: controller.signal,
      requestTimeoutMs: 8_000,
      batchTimeoutMs: 20_000,
    })
    await vi.waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
    })

    controller.abort()

    await expect(copyPromise).resolves.toEqual({
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      selectedCount: 2,
      itemCount: 2,
      successCount: 0,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })
    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(2)
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("keeps single-account requests alive beyond the bulk deadlines", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
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
        signal: controller.signal,
      })
      await vi.advanceTimersByTimeAsync(25_000)

      expect(requestSignal).toBeDefined()
      expect(requestSignal?.aborted).toBe(false)
      resolveFetch?.("https://invite.example.invalid/slow")

      await expect(copyPromise).resolves.toMatchObject({
        result: INVITE_LINK_COPY_RESULTS.Success,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
