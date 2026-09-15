import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useManagedSiteKeyStatuses } from "~/features/KeyManagement/hooks/useManagedSiteKeyStatuses"
import {
  buildAccountKeyResourceRuntimeKey,
  buildServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { buildUserPreferences } from "~~/tests/test-utils/factories"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

const { check, resolveSecret, verifyKey, analytics, complete } = vi.hoisted(
  () => ({
    check: vi.fn(),
    resolveSecret: vi.fn(),
    verifyKey: vi.fn(),
    analytics: vi.fn(),
    complete: vi.fn(),
  }),
)
let preferences = buildUserPreferences({
  newApi: {
    baseUrl: "https://managed.example",
    adminToken: "admin",
    userId: "1",
  },
})
let supported = true
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences,
    managedSiteType: SITE_TYPES.NEW_API,
  }),
}))
vi.mock("~/services/managedSites/utils/managedSite", () => ({
  supportsManagedSiteBaseUrlChannelLookup: () => supported,
}))
vi.mock("~/services/managedSites/tokenChannelStatus", async (original) => ({
  ...(await original<
    typeof import("~/services/managedSites/tokenChannelStatus")
  >()),
  getManagedSiteTokenChannelStatus: check,
  resolveManagedSiteTokenChannelStatusWithVerifiedKey: verifyKey,
}))
vi.mock("~/services/accounts/utils/apiServiceRequest", async (original) => ({
  ...(await original<
    typeof import("~/services/accounts/utils/apiServiceRequest")
  >()),
  resolveDisplayAccountRuntimeKeySecret: resolveSecret,
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: analytics,
}))

/** Hold a provider response until the test changes its owning source. */
function deferred<T = any>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const account = createAccount({
  id: "account-example",
  siteType: SITE_TYPES.NEW_API,
})
const key = (id = "opaque-key"): AccountRuntimeKey =>
  buildAccountKeyResourceRuntimeKey(account, {
    ref: {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "account",
      resourceId: id,
    },
    label: id,
    secret: "",
  })
const renderStatuses = (keys: AccountRuntimeKey[]) =>
  renderHook(({ keys }) => useManagedSiteKeyStatuses(keys), {
    initialProps: { keys },
  })

describe("managed-site status for runtime keys", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    check.mockReset().mockResolvedValue({ status: "not-added" })
    resolveSecret.mockReset().mockImplementation(async (_account, value) => ({
      ...value,
      secret: "resolved-secret",
    }))
    verifyKey.mockReset().mockReturnValue({ status: "added" })
    analytics.mockReturnValue({ complete })
    preferences = buildUserPreferences({
      newApi: {
        baseUrl: "https://managed.example",
        adminToken: "admin",
        userId: "1",
      },
    })
    supported = true
  })

  it("checks native and singleton sources, caches results and keeps channel plaintext out of state", async () => {
    const native = key()
    const service = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })
    check.mockResolvedValue({
      status: "not-added",
      resolvedChannelKeysByResourceKey: { channel: "private-channel-secret" },
    })
    const view = renderStatuses([native, service])
    await waitFor(() =>
      expect(
        Object.values(view.result.current.states).every(
          (value) => !value.isChecking,
        ),
      ).toBe(true),
    )
    expect(check).toHaveBeenCalledTimes(2)
    expect(check.mock.calls.map(([input]) => input.runtimeKey)).toEqual([
      native,
      service,
    ])
    expect(JSON.stringify(view.result.current.states)).not.toContain(
      "private-channel-secret",
    )
    view.rerender({ keys: [native, service] })
    expect(check).toHaveBeenCalledTimes(2)
    expect(analytics).not.toHaveBeenCalled()
  })

  it("keeps unchanged in-flight requests when another account finishes loading", async () => {
    const pending = deferred()
    check.mockReturnValueOnce(pending.promise)
    const first = key("first")
    const second = key("second")
    const view = renderStatuses([first])
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
    const signal = check.mock.calls[0][0].signal as AbortSignal
    view.rerender({ keys: [first, second] })
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
    expect(signal.aborted).toBe(false)
    expect(check.mock.calls[0][0].operationContext).not.toBe(
      check.mock.calls[1][0].operationContext,
    )
    await act(async () => pending.resolve({ status: "added" }))
    expect(view.result.current.states[first.id].result?.status).toBe("added")
  })

  it.each(["credentials", "endpoint", "models"])(
    "invalidates the same identity when its %s change",
    async (change) => {
      const pending = deferred()
      check.mockReturnValueOnce(pending.promise)
      const before = key()
      const view = renderStatuses([before])
      await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
      const signal = check.mock.calls[0][0].signal as AbortSignal
      const after = {
        ...before,
        ...(change === "models"
          ? {
              modelAccess: {
                groups: ["new"],
                allowedModelIds: null,
                suggestedModelIds: [],
              },
            }
          : {
              account: {
                ...before.account,
                ...(change === "credentials"
                  ? { token: "new-account-auth" }
                  : { baseUrl: "https://changed.example" }),
              },
            }),
      }
      view.rerender({ keys: [after] })
      await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
      expect(signal.aborted).toBe(true)
      await act(async () => pending.resolve({ status: "added" }))
      expect(view.result.current.states[before.id].result?.status).toBe(
        "not-added",
      )
    },
  )

  it("invalidates private evidence on target configuration changes and ignores stale results", async () => {
    const pending = deferred()
    check.mockReturnValueOnce(pending.promise)
    const source = key()
    const view = renderStatuses([source])
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
    const signal = check.mock.calls[0][0].signal as AbortSignal
    preferences = {
      ...preferences,
      newApi: { ...preferences.newApi, adminToken: "rotated-admin" },
    }
    view.rerender({ keys: [source] })
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
    expect(signal.aborted).toBe(true)
    await act(async () =>
      pending.resolve({
        status: "added",
        resolvedChannelKeysByResourceKey: { channel: "stale-secret" },
      }),
    )
    expect(view.result.current.states[source.id].result?.status).toBe(
      "not-added",
    )
    await act(async () => view.result.current.refreshKey(source))
    expect(
      check.mock.lastCall?.[0].resolvedChannelKeysByResourceKey,
    ).toBeUndefined()
  })

  it("forces only the requested key and discards its superseded result", async () => {
    const firstResponse = deferred()
    const otherResponse = deferred()
    check
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(otherResponse.promise)
    const first = key("first")
    const other = key("other")
    const view = renderStatuses([first, other])
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
    const firstSignal = check.mock.calls[0][0].signal as AbortSignal
    const otherSignal = check.mock.calls[1][0].signal as AbortSignal
    await act(async () =>
      view.result.current.refreshKey(first, {
        resolvedChannelKeysByResourceKey: { channel: "verified-key" },
      }),
    )
    expect(firstSignal.aborted).toBe(true)
    expect(otherSignal.aborted).toBe(false)
    expect(check.mock.lastCall?.[0].resolvedChannelKeysByResourceKey).toEqual({
      channel: "verified-key",
    })
    await act(async () => {
      firstResponse.resolve({ status: "added" })
      otherResponse.resolve({ status: "added" })
    })
    expect(view.result.current.states[first.id].result?.status).toBe(
      "not-added",
    )
    expect(view.result.current.states[other.id].result?.status).toBe("added")
  })

  it("removes disappeared keys and does not reuse their evidence on return", async () => {
    const source = key()
    check.mockResolvedValueOnce({
      status: "added",
      resolvedChannelKeysByResourceKey: { channel: "old" },
    })
    const view = renderStatuses([source])
    await waitFor(() =>
      expect(view.result.current.states[source.id]?.result?.status).toBe(
        "added",
      ),
    )
    view.rerender({ keys: [] })
    expect(view.result.current.states).toEqual({})
    view.rerender({ keys: [source] })
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2))
    expect(
      check.mock.lastCall?.[0].resolvedChannelKeysByResourceKey,
    ).toBeUndefined()
  })

  it("settles thrown checks and allows a manual retry", async () => {
    const source = key()
    check.mockRejectedValueOnce(new Error("provider request failed"))
    const view = renderStatuses([source])
    await waitFor(() =>
      expect(view.result.current.states[source.id]?.isChecking).toBe(false),
    )
    expect(view.result.current.states[source.id].result?.status).toBe("unknown")
    await act(async () => view.result.current.refresh())
    expect(view.result.current.states[source.id].result?.status).toBe(
      "not-added",
    )
    expect(analytics).toHaveBeenCalledTimes(1)
  })

  it("confirms an opaque source with a verified channel key without reloading inventory", async () => {
    const source = key()
    const view = renderStatuses([source])
    await waitFor(() =>
      expect(view.result.current.states[source.id]?.isChecking).toBe(false),
    )
    const resourceRef = matchingResourceRef("channel-1")
    await act(async () =>
      view.result.current.confirm(
        source,
        { status: "unknown", reason: "exact-verification-unavailable" },
        { resourceRef, channelKey: "verified-secret" },
      ),
    )
    expect(verifyKey).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenKey: "resolved-secret",
        resourceRef,
        channelKey: "verified-secret",
      }),
    )
    expect(check).toHaveBeenCalledTimes(1)
    expect(view.result.current.states[source.id].result?.status).toBe("added")
  })

  it("cannot overwrite a newer check after delayed secret confirmation", async () => {
    const source = key()
    const pending = deferred()
    resolveSecret.mockReturnValueOnce(pending.promise)
    const view = renderStatuses([source])
    await waitFor(() =>
      expect(view.result.current.states[source.id]?.isChecking).toBe(false),
    )
    let confirmation: Promise<unknown>
    act(() => {
      confirmation = view.result.current.confirm(
        source,
        { status: "unknown", reason: "exact-verification-unavailable" },
        {
          resourceRef: matchingResourceRef("channel-1"),
          channelKey: "verified",
        },
      )
    })
    await act(async () => view.result.current.refreshKey(source))
    await act(async () => {
      pending.resolve({ ...source, secret: "late" })
      await confirmation
    })
    expect(verifyKey).not.toHaveBeenCalled()
    expect(view.result.current.states[source.id].result?.status).toBe(
      "not-added",
    )
  })

  it("aborts on unmount and restarts checks during StrictMode remount", async () => {
    const source = key()
    const pending = deferred()
    check.mockReturnValueOnce(pending.promise)
    const view = renderHook(() => useManagedSiteKeyStatuses([source]), {
      reactStrictMode: true,
    })
    await waitFor(() =>
      expect(view.result.current.states[source.id]?.result?.status).toBe(
        "not-added",
      ),
    )
    expect((check.mock.calls[0][0].signal as AbortSignal).aborted).toBe(true)
    view.unmount()
    await act(async () => pending.resolve({ status: "added" }))
  })

  it("does no provider work when matching is unsupported", async () => {
    supported = false
    const source = key()
    const view = renderStatuses([source])
    await act(async () => view.result.current.refresh())
    expect(check).not.toHaveBeenCalled()
    expect(view.result.current.states).toEqual({})
  })

  it("limits a batch to four checks and never dispatches removed queued targets", async () => {
    const pending = Array.from({ length: 4 }, () => deferred())
    for (const response of pending) check.mockReturnValueOnce(response.promise)
    const keys = Array.from({ length: 6 }, (_, index) => key(`key-${index}`))
    const view = renderStatuses(keys)
    await waitFor(() => expect(check).toHaveBeenCalledTimes(4))
    view.rerender({ keys: keys.filter((_, index) => index !== 4) })
    await act(async () => pending[0].resolve({ status: "added" }))
    await waitFor(() => expect(check).toHaveBeenCalledTimes(5))
    expect(check.mock.lastCall?.[0].runtimeKey.id).toBe(keys[5].id)
    expect(view.result.current.states[keys[4].id]).toBeUndefined()
    await act(async () => {
      for (const response of pending.slice(1))
        response.resolve({ status: "added" })
    })
    expect(
      Object.values(view.result.current.states).every(
        (state) => !state.isChecking,
      ),
    ).toBe(true)
  })
})
