import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useRuntimeKeyDisclosure } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyDisclosure"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

const { resolveSecret, writeText, success, error, complete } = vi.hoisted(
  () => ({
    resolveSecret: vi.fn(),
    writeText: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    complete: vi.fn(),
  }),
)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountRuntimeKeySecret: resolveSecret,
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete }),
}))
vi.mock("~/lib/notify", () => ({ default: { success, error } }))

const account = createAccount({ id: "source" })
const key = buildAccountKeyResourceRuntimeKey(account, {
  ref: {
    accountId: account.id,
    siteType: account.siteType,
    scopeKey: "account",
    resourceId: "opaque-id",
  },
  label: "Key",
  secret: "",
})
const renderDisclosure = () =>
  renderHook(({ account }) => useRuntimeKeyDisclosure(account, key), {
    initialProps: { account },
  })

describe("native runtime key disclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveSecret
      .mockReset()
      .mockResolvedValue({ ...key, secret: "resolved-private-key" })
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
  })

  it("resolves only after user intent and keeps copied plaintext out of rendered state", async () => {
    const view = renderDisclosure()
    expect(resolveSecret).not.toHaveBeenCalled()
    await act(async () => view.result.current.copy())
    expect(writeText).toHaveBeenCalledWith("resolved-private-key")
    expect(view.result.current.secret).toBeNull()
    expect(success).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledWith("success")
    expect(JSON.stringify(complete.mock.calls)).not.toContain(
      "resolved-private-key",
    )
  })

  it("reveals, hides and reopens a current secret, but clears it after authentication changes", async () => {
    const view = renderDisclosure()
    await act(async () => view.result.current.toggle())
    expect(view.result.current.secret).toBe("resolved-private-key")
    await act(async () => view.result.current.toggle())
    expect(view.result.current.secret).toBeNull()
    await act(async () => view.result.current.toggle())
    expect(resolveSecret).toHaveBeenCalledTimes(1)
    view.rerender({ account: { ...account, token: "replacement-auth" } })
    expect(view.result.current.secret).toBeNull()
    expect(view.result.current.visible).toBe(false)
  })

  it.each(["change", "unmount"])(
    "ignores pending plaintext after source %s and prevents duplicate reads",
    async (event) => {
      const pending = createDeferred<typeof key>()
      resolveSecret.mockReturnValueOnce(pending.promise)
      const view = renderDisclosure()
      let action: Promise<void>
      act(() => {
        action = view.result.current.copy()
      })
      await act(async () => view.result.current.copy())
      expect(resolveSecret).toHaveBeenCalledTimes(1)
      const signal = resolveSecret.mock.calls[0][2].abortSignal as AbortSignal
      if (event === "unmount") view.unmount()
      else
        view.rerender({
          account: { ...account, baseUrl: "https://replacement.example" },
        })
      expect(signal.aborted).toBe(true)
      await act(async () => {
        pending.resolve({ ...key, secret: "stale-private-key" })
        await action
      })
      expect(writeText).not.toHaveBeenCalled()
      expect(success).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalledWith("cancelled")
    },
  )

  it.each(["change", "unmount"])(
    "completes cancellation after pending clipboard write and source %s",
    async (event) => {
      const pending = createDeferred<void>()
      writeText.mockReturnValueOnce(pending.promise)
      const view = renderDisclosure()
      let action!: Promise<void>
      await act(async () => {
        action = view.result.current.copy()
      })
      expect(writeText).toHaveBeenCalledOnce()
      if (event === "unmount") view.unmount()
      else view.rerender({ account: { ...account, token: "changed" } })
      await act(async () => {
        pending.resolve()
        await action
      })
      expect(complete).toHaveBeenCalledExactlyOnceWith("cancelled")
      expect(success).not.toHaveBeenCalled()
    },
  )

  it("reports reveal failure without calling it a copy", async () => {
    resolveSecret.mockRejectedValueOnce(new Error("denied"))
    const view = renderDisclosure()
    await act(async () => view.result.current.toggle())
    expect(error).toHaveBeenCalledWith("messages.revealFailed")
    expect(writeText).not.toHaveBeenCalled()
  })

  it("reports a failed clipboard operation without exposing the resolved secret", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"))
    const view = renderDisclosure()
    await act(async () => view.result.current.copy())
    expect(error).toHaveBeenCalledWith("messages.copyFailed")
    expect(success).not.toHaveBeenCalled()
    expect(view.result.current.secret).toBeNull()
  })
})
