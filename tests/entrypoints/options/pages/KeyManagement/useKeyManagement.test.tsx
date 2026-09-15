import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useKeyManagement } from "~/features/KeyManagement/hooks/useKeyManagement"
import { useAccountData } from "~/hooks/useAccountData"
import toast from "~/lib/notify"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { testI18n } from "~~/tests/test-utils/i18n"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

const { complete, fetchCredential, rotateCredential } = vi.hoisted(() => ({
  complete: vi.fn(),
  fetchCredential: vi.fn(),
  rotateCredential: vi.fn(),
}))
vi.mock("~/hooks/useAccountData", () => ({ useAccountData: vi.fn() }))
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: vi.fn(),
}))
vi.mock("~/services/productAnalytics/actions", async (original) => ({
  ...(await original<typeof import("~/services/productAnalytics/actions")>()),
  startProductAnalyticsAction: () => ({ complete }),
}))
vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const credential = (
  key = "private-service-secret",
): AccountServiceCredential => ({
  kind: "singleton_service_key",
  service: "codex",
  label: "Codex",
  key,
  isAuthenticated: true,
  baseUrl: "https://runtime.example",
})
const account = createAccount({
  id: "service-a",
  siteType: SITE_TYPES.SHAREDCHAT,
})
const other = createAccount({
  id: "service-b",
  siteType: SITE_TYPES.SHAREDCHAT,
})
const native = createAccount({ id: "native", siteType: SITE_TYPES.NEW_API })
const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
)
const setAccounts = (accounts: ReturnType<typeof createAccount>[]) =>
  vi
    .mocked(useAccountData)
    .mockReturnValue({ enabledDisplayData: accounts } as never)
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const renderSelected = (accountId = account.id) =>
  renderHook(() => useKeyManagement({ accountId }), { wrapper })

describe("useKeyManagement singleton credentials and selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    complete.mockResolvedValue(undefined)
    fetchCredential.mockReset().mockResolvedValue(credential())
    rotateCredential.mockReset().mockResolvedValue(credential("rotated-secret"))
    setAccounts([account, other, native])
    vi.mocked(getSiteTypeCapabilities).mockImplementation(
      (siteType) =>
        ({
          siteType,
          account:
            siteType === SITE_TYPES.SHAREDCHAT
              ? {
                  serviceCredential: {
                    fetch: fetchCredential,
                    rotate: rotateCredential,
                  },
                }
              : siteType === SITE_TYPES.NEW_API
                ? { keyResourceManagement: { openSession: vi.fn() } }
                : {},
        }) as never,
    )
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it("leaves native inventory and progress to its controller", async () => {
    const { result } = renderSelected(native.id)
    await waitFor(() => expect(result.current.selectedAccount).toBe(native.id))
    expect(result.current.entries).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.currentAccountUnsupportedKeyManagement).toBe(false)
    expect(fetchCredential).not.toHaveBeenCalled()
  })

  it("loads a singleton credential with automatic protection context", async () => {
    const { result } = renderSelected()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.entries[0].runtimeKey).toMatchObject({
      source: "service_credential",
      accountId: account.id,
      secret: "private-service-secret",
    })
    expect(fetchCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        protectionBypassExecution: expect.objectContaining({
          kind: "automatic",
        }),
      }),
    )
  })

  it("filters by public label and never by the plaintext secret", async () => {
    const { result } = renderSelected()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    act(() => result.current.setSearchTerm("private-service"))
    expect(result.current.filteredEntries).toEqual([])
    act(() => result.current.setSearchTerm(" cOdEx "))
    expect(result.current.filteredEntries).toHaveLength(1)
  })

  it("marks unsupported accounts explicitly", async () => {
    const unsupported = createAccount({
      id: "unsupported",
      siteType: SITE_TYPES.UNKNOWN,
    })
    setAccounts([unsupported])
    const { result } = renderSelected(unsupported.id)
    await waitFor(() =>
      expect(result.current.currentAccountUnsupportedKeyManagement).toBe(true),
    )
    expect(fetchCredential).not.toHaveBeenCalled()
  })

  it("waits for routed accounts and rejects missing or disabled selections", async () => {
    setAccounts([])
    const { result, rerender } = renderSelected()
    expect(result.current.selectedAccount).toBe("")
    setAccounts([account])
    rerender()
    await waitFor(() => expect(result.current.selectedAccount).toBe(account.id))
    act(() => result.current.setSelectedAccount("disabled"))
    await waitFor(() => expect(result.current.selectedAccount).toBe(""))
  })

  it("clears route selection when the route is removed", async () => {
    const { result, rerender } = renderHook(
      ({ route }) => useKeyManagement(route),
      {
        initialProps: {
          route: { accountId: account.id } as Record<string, string>,
        },
        wrapper,
      },
    )
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    rerender({ route: {} })
    expect(result.current.selectedAccount).toBe("")
    expect(result.current.serviceCredentials).toEqual({})
  })

  it("keeps all-account selection while accounts remain and prunes account filters", async () => {
    const { result, rerender } = renderSelected("all")
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    act(() => result.current.setAllAccountsFilterAccountIds([other.id]))
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.filteredEntries).toHaveLength(1)
    expect(result.current.accountSummaryItems).toHaveLength(2)
    setAccounts([account, native])
    rerender()
    await waitFor(() =>
      expect(result.current.allAccountsFilterAccountIds).toEqual([]),
    )
    expect(result.current.selectedAccount).toBe("all")
    setAccounts([])
    rerender()
    expect(result.current.selectedAccount).toBe("")
  })

  it("resets all-account filters on single-account navigation", async () => {
    const { result } = renderHook(() => useKeyManagement(), { wrapper })
    act(() => result.current.setSelectedAccount("all"))
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    act(() => result.current.setAllAccountsFilterAccountIds([other.id]))
    act(() => result.current.setSelectedAccount(account.id))
    expect(result.current.allAccountsFilterAccountIds).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it("starts distinct origins concurrently and serializes accounts at the same origin", async () => {
    const first = deferred<AccountServiceCredential>()
    const remote = createAccount({
      id: "remote",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://other.example",
    })
    setAccounts([account, other, remote])
    fetchCredential.mockImplementation((request) =>
      request.baseUrl === account.baseUrl
        ? first.promise
        : Promise.resolve(credential("remote-secret")),
    )
    const { result } = renderSelected("all")
    await waitFor(() => expect(fetchCredential).toHaveBeenCalledTimes(2))
    expect(result.current.tokenLoadProgress).toMatchObject({
      total: 3,
      loaded: 1,
      loading: 2,
    })
    await act(async () => first.resolve(credential()))
    await waitFor(() => expect(fetchCredential).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it("isolates failures and retries only failed service accounts", async () => {
    fetchCredential.mockRejectedValueOnce(new Error("upstream unavailable"))
    const { result } = renderSelected("all")
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.failedAccounts.map((item) => item.accountId)).toEqual(
      [account.id],
    )
    expect(result.current.tokenLoadProgress).toEqual({
      total: 2,
      loaded: 1,
      loading: 0,
      error: 1,
    })
    expect(
      result.current.accountSummaryItems.find(
        (item) => item.accountId === account.id,
      ),
    ).toMatchObject({
      count: null,
      errorType: "load-failed",
    })
    await act(async () => {
      await result.current.retryFailedAccounts()
    })
    expect(fetchCredential).toHaveBeenCalledTimes(3)
    expect(result.current.failedAccounts).toEqual([])
    expect(complete).toHaveBeenCalledWith(
      "success",
      expect.objectContaining({
        insights: {
          mode: "retry_failed",
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      }),
    )
    expect(JSON.stringify(complete.mock.calls)).not.toContain(
      "private-service-secret",
    )
  })

  it("does not let an old queued refresh supersede a newer refresh", async () => {
    const initial = deferred<AccountServiceCredential>()
    fetchCredential.mockReturnValueOnce(initial.promise)
    const { result } = renderSelected("all")
    await waitFor(() => expect(fetchCredential).toHaveBeenCalledTimes(1))
    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.refreshServiceCredentials()
    })
    fetchCredential.mockResolvedValue(credential("fresh-secret"))
    await act(async () => {
      initial.resolve(credential("stale-secret"))
      await refresh
    })
    expect(fetchCredential).toHaveBeenCalledTimes(3)
    expect(
      result.current.entries.every(
        (entry) => entry.runtimeKey.secret === "fresh-secret",
      ),
    ).toBe(true)
  })

  it("invalidates pending reads and removes plaintext on an auth change", async () => {
    const pending = deferred<AccountServiceCredential>()
    fetchCredential.mockReturnValueOnce(pending.promise)
    const { result, rerender } = renderSelected()
    await waitFor(() => expect(fetchCredential).toHaveBeenCalledTimes(1))
    const signal = fetchCredential.mock.calls[0][0].abortSignal as AbortSignal
    setAccounts([{ ...account, token: "new-access-token" }])
    rerender()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    await act(async () => pending.resolve(credential("stale-secret")))
    expect(signal.aborted).toBe(true)
    expect(result.current.entries[0].runtimeKey.secret).toBe(
      "private-service-secret",
    )
    await act(async () => result.current.copyServiceCredential(account))
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it("survives StrictMode replay without accepting an aborted read", async () => {
    const { result, unmount } = renderHook(
      () => useKeyManagement({ accountId: account.id }),
      {
        wrapper,
        reactStrictMode: true,
      },
    )
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    const signal = fetchCredential.mock.calls.at(-1)![0]
      .abortSignal as AbortSignal
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it("marks a refresh superseded by navigation as skipped", async () => {
    const { result } = renderHook(() => useKeyManagement(), { wrapper })
    act(() => result.current.setSelectedAccount(account.id))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    const pending = deferred<AccountServiceCredential>()
    fetchCredential.mockReturnValueOnce(pending.promise)
    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.refreshServiceCredentials()
    })
    await waitFor(() => expect(fetchCredential).toHaveBeenCalledTimes(2))
    act(() => result.current.setSelectedAccount(native.id))
    await act(async () => {
      pending.resolve(credential("stale-secret"))
      await refresh
    })
    expect(complete).toHaveBeenLastCalledWith("skipped", expect.any(Object))
    expect(result.current.serviceCredentials).toEqual({})
  })

  it("does not fail a successful refresh when telemetry rejects", async () => {
    const { result } = renderSelected()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    complete.mockRejectedValueOnce(new Error("analytics unavailable"))
    await act(async () => {
      await result.current.refreshServiceCredentials()
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.currentAccountLoadError).toBeNull()
  })

  it("copies and rotates a loaded singleton without creating a resource", async () => {
    const { result } = renderSelected()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    await act(async () => {
      await result.current.copyServiceCredential(account)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "private-service-secret",
    )
    await act(async () => {
      await result.current.rotateServiceCredential(account)
    })
    expect(rotateCredential).toHaveBeenCalledTimes(1)
    expect(result.current.entries[0].runtimeKey.secret).toBe("rotated-secret")
  })

  it("keeps rotation failures explicit and never retries the mutation on refresh", async () => {
    const { result } = renderSelected()
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    rotateCredential.mockRejectedValueOnce(new Error())
    await act(async () => {
      await result.current.rotateServiceCredential(account)
    })
    expect(result.current.currentAccountLoadError).toBe(
      "keyManagement:messages.serviceCredentialRotateFailed",
    )
    expect(result.current.serviceCredentials[account.id].credential?.key).toBe(
      "private-service-secret",
    )
    await act(async () => {
      await result.current.refreshServiceCredentials()
    })
    expect(rotateCredential).toHaveBeenCalledTimes(1)
  })

  it("does not replay concurrent rotations or display late rotation feedback", async () => {
    const { result } = renderHook(() => useKeyManagement(), { wrapper })
    act(() => result.current.setSelectedAccount(account.id))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    const pending = deferred<AccountServiceCredential>()
    rotateCredential.mockReturnValueOnce(pending.promise)
    let rotation!: Promise<void>
    act(() => {
      rotation = result.current.rotateServiceCredential(account)
    })
    await act(async () => {
      await result.current.rotateServiceCredential(account)
    })
    expect(rotateCredential).toHaveBeenCalledTimes(1)
    act(() => result.current.setSelectedAccount(native.id))
    await act(async () => {
      pending.resolve(credential("late-secret"))
      await rotation
    })
    expect(result.current.serviceCredentials).toEqual({})
    expect(toast.success).not.toHaveBeenCalledWith(
      "keyManagement:messages.serviceCredentialRotated",
    )
  })

  it("keeps clipboard failures generic and ignores stale completion feedback", async () => {
    const { result } = renderHook(() => useKeyManagement(), { wrapper })
    act(() => result.current.setSelectedAccount(account.id))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("private-service-secret"),
    )
    await act(async () => {
      await result.current.copyServiceCredential(account)
    })
    expect(toast.error).toHaveBeenCalledWith(
      "keyManagement:messages.copyFailed",
    )
    const pending = deferred<void>()
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(
      pending.promise,
    )
    let copying!: Promise<void>
    act(() => {
      copying = result.current.copyServiceCredential(account)
    })
    act(() => result.current.setSelectedAccount(native.id))
    await act(async () => {
      pending.resolve()
      await copying
    })
    expect(toast.success).not.toHaveBeenCalled()
  })
})
