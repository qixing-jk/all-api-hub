import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog"
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum } from "~/types"
import {
  buildCheckInConfig,
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/components/dialogs/ChannelDialog", () => ({
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

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getActiveTabs: vi.fn(async () => []),
    getAllTabs: vi.fn(async () => []),
    onTabActivated: vi.fn(() => () => {}),
    onTabUpdated: vi.fn(() => () => {}),
    sendRuntimeMessage: vi.fn(),
  }
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

  it("creates a compatibility check-in selection only for supported manual site types", async () => {
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
      methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
    })
    expect(
      result.current.state.checkIn.methodKnowledge.methods[
        AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
      ]?.detection,
    ).toEqual({
      outcome: "matched",
      evidence: { source: "compatibility_registration" },
    })

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
        methodIds: [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn],
        selection: {
          mode: "automatic",
          methodId: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
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
        methodId: AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn,
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
      .spyOn(accountStorage, "getAccountById")
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
