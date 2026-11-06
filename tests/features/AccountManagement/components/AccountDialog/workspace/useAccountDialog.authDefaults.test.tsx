import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/workspace/useAccountDialog"
import toast from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { AuthTypeEnum } from "~/types"
import {
  buildCheckInConfig,
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

vi.mock("~/features/ManagedSiteChannels/editor/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openWithAccount: vi.fn(),
    openDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(() => ({
    complete: vi.fn(),
  })),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => ({
      warnOnDuplicateAccountAdd: true,
      managedSiteType: "new-api",
      autoFillCurrentSiteUrlOnAccountAdd: true,
      autoProvisionKeyOnAccountAdd: false,
    }),
  }
})

vi.mock("~/utils/browser/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/tabs")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
  }
})
vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()
  return { ...actual, sendRuntimeMessage: vi.fn() }
})

describe("useAccountDialog auth defaults", () => {
  const renderAccountDialogHook = (
    props: Parameters<typeof useAccountDialog>[0],
  ) =>
    renderHook(() => useAccountDialog(props), {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(["github", "linuxdo"] as const)(
    "loads canonical %s login independently of check-in",
    async (methodId) => {
      const getAccountSpy = vi
        .spyOn(accountQueries, "getAccountById")
        .mockResolvedValue(
          buildSiteAccount({
            id: "edit-login",
            site_type: SITE_TYPES.NEW_API,
            site_url: "https://agentrouter.org",
            login: { methodId },
          }),
        )
      try {
        const { result } = renderAccountDialogHook({
          mode: DIALOG_MODES.EDIT,
          account: buildDisplaySiteData({ id: "edit-login" }),
          isOpen: true,
          onClose: vi.fn(),
        })
        await waitFor(() => {
          expect(result.current.state.login).toEqual({ methodId })
          expect(result.current.state.checkIn.loginCheckIn).toBeUndefined()
        })
      } finally {
        getAccountSpy.mockRestore()
      }
    },
  )

  it("keeps an edit draft loading until the stored account is hydrated", async () => {
    const deferred =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockReturnValue(deferred.promise)
    const props = {
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData({ id: "deferred-edit" }),
      isOpen: true,
      onClose: vi.fn(),
    } satisfies Parameters<typeof useAccountDialog>[0]
    const loadingSnapshots: boolean[] = []
    const { result } = renderHook(
      () => {
        const dialog = useAccountDialog(props)
        loadingSnapshots.push(dialog.state.isLoadingAccount)
        return dialog
      },
      {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    expect(loadingSnapshots[0]).toBe(true)
    await waitFor(() => {
      expect(getAccountSpy).toHaveBeenCalledWith("deferred-edit")
    })
    expect(result.current.state.isLoadingAccount).toBe(true)
    expect(result.current.state.accessToken).toBe("")

    await act(async () => {
      deferred.resolve(
        buildSiteAccount({
          id: "deferred-edit",
          account_info: {
            ...buildSiteAccount().account_info,
            access_token: "loaded-access-token",
          },
        }),
      )
    })

    await waitFor(() => {
      expect(result.current.state.isLoadingAccount).toBe(false)
      expect(result.current.state.accessToken).toBe("loaded-access-token")
    })
    getAccountSpy.mockRestore()
  })

  it.each([
    ["a rejected read", "reject"],
    ["a missing account", "missing"],
  ] as const)("ends edit loading after %s", async (_description, outcome) => {
    const deferred =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockReturnValue(deferred.promise)
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData({ id: `edit-${outcome}` }),
      isOpen: true,
      onClose: vi.fn(),
    })

    await waitFor(() => {
      expect(getAccountSpy).toHaveBeenCalledWith(`edit-${outcome}`)
    })
    expect(result.current.state.isLoadingAccount).toBe(true)

    await act(async () => {
      if (outcome === "reject") deferred.reject(new Error("read failed"))
      else deferred.resolve(null)
      await deferred.promise.catch(() => undefined)
    })

    await waitFor(() => {
      expect(result.current.state.isLoadingAccount).toBe(false)
      expect(result.current.state.accountLoadError).toBe(true)
    })
    getAccountSpy.mockRestore()
  })

  it("retries a failed edit hydration and clears the error after success", async () => {
    const firstRead =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const retryRead =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(retryRead.promise)
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData({ id: "retry-edit" }),
      isOpen: true,
      onClose: vi.fn(),
    })

    await waitFor(() => expect(getAccountSpy).toHaveBeenCalledTimes(1))
    await act(async () => {
      firstRead.reject(new Error("initial read failed"))
      await firstRead.promise.catch(() => undefined)
    })
    await waitFor(() => {
      expect(result.current.state.isLoadingAccount).toBe(false)
      expect(result.current.state.accountLoadError).toBe(true)
    })

    const retry = result.current.handlers.retryAccountLoad
    await act(async () => retry())
    expect(getAccountSpy).toHaveBeenCalledTimes(2)
    expect(result.current.handlers.retryAccountLoad).toBe(retry)
    expect(result.current.state.isLoadingAccount).toBe(true)
    expect(result.current.state.accountLoadError).toBe(false)

    await act(async () => {
      retryRead.resolve(
        buildSiteAccount({
          id: "retry-edit",
          account_info: {
            ...buildSiteAccount().account_info,
            access_token: "retry-access-token",
          },
        }),
      )
    })
    await waitFor(() => {
      expect(result.current.state.isLoadingAccount).toBe(false)
      expect(result.current.state.accountLoadError).toBe(false)
      expect(result.current.state.accessToken).toBe("retry-access-token")
    })
    getAccountSpy.mockRestore()
  })

  it("ignores an edit read that rejects after the dialog closes", async () => {
    const deferred =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockReturnValue(deferred.promise)
    const errorSpy = vi.spyOn(toast, "error")
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData({ id: "closed-edit" }),
      isOpen: true,
      onClose: vi.fn(),
    })

    await waitFor(() =>
      expect(getAccountSpy).toHaveBeenCalledWith("closed-edit"),
    )
    await act(async () => result.current.handlers.handleClose())
    await act(async () => {
      deferred.reject(new Error("late read failure"))
      await deferred.promise.catch(() => undefined)
    })

    expect(errorSpy).not.toHaveBeenCalled()
    expect(result.current.state.isLoadingAccount).toBe(true)
    expect(result.current.state.accountLoadError).toBe(false)
    getAccountSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("does not retry account hydration while the editor is closed", async () => {
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockResolvedValue(null)
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.EDIT,
      account: buildDisplaySiteData({ id: "closed-retry-edit" }),
      isOpen: false,
      onClose: vi.fn(),
    })

    await act(async () => result.current.handlers.retryAccountLoad())

    expect(getAccountSpy).not.toHaveBeenCalled()
    getAccountSpy.mockRestore()
  })

  it("keeps the newer account draft when an older edit read resolves late", async () => {
    const olderRead =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const newerRead =
      createDeferred<
        Awaited<ReturnType<typeof accountQueries.getAccountById>>
      >()
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockImplementation((id) =>
        id === "older-edit" ? olderRead.promise : newerRead.promise,
      )
    const olderAccount = buildDisplaySiteData({ id: "older-edit" })
    const newerAccount = buildDisplaySiteData({ id: "newer-edit" })
    const dialogProps = {
      mode: DIALOG_MODES.EDIT,
      account: olderAccount,
      isOpen: true,
      onClose: vi.fn(),
    } satisfies Parameters<typeof useAccountDialog>[0]
    const { result, rerender } = renderHook(
      (props: typeof dialogProps) => useAccountDialog(props),
      {
        initialProps: dialogProps,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    await waitFor(() =>
      expect(getAccountSpy).toHaveBeenCalledWith("older-edit"),
    )
    rerender({ ...dialogProps, account: newerAccount })
    await waitFor(() =>
      expect(getAccountSpy).toHaveBeenCalledWith("newer-edit"),
    )
    await act(async () => {
      newerRead.resolve(
        buildSiteAccount({
          id: "newer-edit",
          account_info: {
            ...buildSiteAccount().account_info,
            access_token: "newer-access-token",
          },
        }),
      )
    })
    await waitFor(() =>
      expect(result.current.state.accessToken).toBe("newer-access-token"),
    )
    await act(async () => {
      olderRead.resolve(
        buildSiteAccount({
          id: "older-edit",
          account_info: {
            ...buildSiteAccount().account_info,
            access_token: "stale-access-token",
          },
        }),
      )
    })

    expect(result.current.state.accessToken).toBe("newer-access-token")
    getAccountSpy.mockRestore()
  })

  it.each([
    "https://api.laozhang.ai",
    "https://api2.laozhang.ai",
    "https://api-vip.laozhang.ai",
    "https://api-cf.laozhang.ai",
  ])(
    "defaults LaoZhang %s to Access Token and keeps an explicit Cookie choice",
    async (siteUrl) => {
      const { result } = renderAccountDialogHook({
        mode: DIALOG_MODES.ADD,
        isOpen: true,
        onClose: vi.fn(),
      })
      await act(async () => {
        result.current.handlers.handleUrlChange(siteUrl)
      })
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
      await act(async () => {
        result.current.setters.setAuthType(AuthTypeEnum.Cookie)
      })
      await act(async () => {
        result.current.handlers.handleUrlChange(`${siteUrl}/account/profile`)
      })
      expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
    },
  )

  it("starts an unknown new-account draft with automatic check-in disabled", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
      expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(false)
    })
  })

  it("uses access-token auth when a sponsor prefill omits auth type and URL has no known default", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.example.com",
        siteType: SITE_TYPES.ANYROUTER,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
    expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)
  })

  it("lets sponsor auth prefill override the local AnyRouter default", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      prefill: {
        siteUrl: "https://anyrouter.example.com",
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.AccessToken,
        source: "sponsor",
        sponsorId: "anyrouter",
      },
    })

    await waitFor(() => {
      expect(result.current.state.siteType).toBe(SITE_TYPES.ANYROUTER)
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
  })

  it("does not change auth when only site type changes before detection", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.ANYROUTER)
    })

    await waitFor(() => {
      expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
    })
  })

  it("keeps manual site type candidates unselected until detection confirms support", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })

    expect(result.current.state.checkIn.selection).toEqual({
      mode: "automatic",
    })
    expect(result.current.state.checkIn.methodKnowledge.methods).toEqual({})

    const { result: unsupportedResult } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      unsupportedResult.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    expect(unsupportedResult.current.state.checkIn.selection).toEqual({
      mode: "automatic",
    })
    expect(
      unsupportedResult.current.state.checkIn.methodKnowledge.methods,
    ).toEqual({})
  })

  it("rebuilds compatibility check-in state on every add-mode site type change", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })
    const customCheckIn = {
      url: "https://check-in.example.invalid",
      isCheckedInToday: true,
    }

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })
    await act(async () => {
      result.current.setters.setCheckIn({
        ...result.current.state.checkIn,
        automaticExecutionEnabled: false,
        customCheckIn,
      })
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.VELOERA)
    })
    const supportedSwitch = result.current.state.checkIn

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })
    const discoveryRequiredSwitch = result.current.state.checkIn

    expect({
      supported: {
        automaticExecutionEnabled: supportedSwitch.automaticExecutionEnabled,
        customCheckIn: supportedSwitch.customCheckIn,
        methodIds: Object.keys(supportedSwitch.methodKnowledge.methods),
        selection: supportedSwitch.selection,
      },
      discoveryRequired: {
        automaticExecutionEnabled:
          discoveryRequiredSwitch.automaticExecutionEnabled,
        customCheckIn: discoveryRequiredSwitch.customCheckIn,
        methodIds: Object.keys(discoveryRequiredSwitch.methodKnowledge.methods),
        selection: discoveryRequiredSwitch.selection,
      },
    }).toEqual({
      supported: {
        automaticExecutionEnabled: false,
        customCheckIn,
        methodIds: [],
        selection: {
          mode: "automatic",
        },
      },
      discoveryRequired: {
        automaticExecutionEnabled: false,
        customCheckIn,
        methodIds: [],
        selection: { mode: "automatic" },
      },
    })
  })

  it("uses candidate-provider availability for untouched add-mode defaults", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })
    expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })
    expect(result.current.state.checkIn.automaticExecutionEnabled).toBe(true)

    await act(async () => {
      result.current.setters.setSiteType(SITE_TYPES.VELOERA)
    })
    expect(result.current.state.checkIn).toMatchObject({
      automaticExecutionEnabled: true,
      selection: {
        mode: "automatic",
      },
    })
  })

  it("does not rewrite persisted automatic execution intent when edit mode changes site type", async () => {
    const persistedCheckIn = buildCheckInConfig({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
            detection: {
              outcome: "matched",
              evidence: { source: "compatibility_registration" },
            },
          },
        },
      },
      selection: {
        mode: "manual",
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      },
    })
    const getAccountSpy = vi
      .spyOn(accountQueries, "getAccountById")
      .mockResolvedValue(
        buildSiteAccount({
          id: "edit-account",
          site_type: SITE_TYPES.NEW_API,
          checkIn: persistedCheckIn,
        }),
      )

    try {
      const { result } = renderAccountDialogHook({
        mode: DIALOG_MODES.EDIT,
        account: buildDisplaySiteData({ id: "edit-account" }),
        isOpen: true,
        onClose: vi.fn(),
        onSuccess: vi.fn(),
      })

      await waitFor(() => {
        expect(result.current.state.siteType).toBe(SITE_TYPES.NEW_API)
      })

      await act(async () => {
        result.current.setters.setSiteType(SITE_TYPES.SUB2API)
      })

      expect(result.current.state.checkIn).toMatchObject({
        automaticExecutionEnabled: true,
        methodKnowledge: persistedCheckIn.methodKnowledge,
        selection: persistedCheckIn.selection,
      })
    } finally {
      getAccountSpy.mockRestore()
    }
  })

  it("does not overwrite an explicit user auth selection when site type changes", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setAuthType(AuthTypeEnum.AccessToken)
      result.current.setters.setSiteType(SITE_TYPES.ANYROUTER)
    })

    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
  })

  it("uses Cookie auth when an AnyRouter URL is entered before site type is known", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://anyrouter.top/console")
    })

    expect(result.current.state.url).toBe("https://anyrouter.top")
    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
  })

  it("uses Cookie auth when a SharedChat URL is entered before site type is known", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.handlers.handleUrlChange("https://new.sharedchat.cc/list")
    })

    expect(result.current.state.url).toBe("https://new.sharedchat.cc")
    expect(result.current.state.siteType).toBe(SITE_TYPES.UNKNOWN)
    expect(result.current.state.authType).toBe(AuthTypeEnum.Cookie)
  })

  it("does not overwrite explicit auth when an AnyRouter URL is entered", async () => {
    const { result } = renderAccountDialogHook({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    })

    await act(async () => {
      result.current.setters.setAuthType(AuthTypeEnum.AccessToken)
      result.current.handlers.handleUrlChange("https://anyrouter.top/console")
    })

    expect(result.current.state.authType).toBe(AuthTypeEnum.AccessToken)
  })
})
