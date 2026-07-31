import userEvent from "@testing-library/user-event"
import type { TFunction } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import {
  getShieldDevTriggerPreset,
  SHIELD_DEV_TRIGGER_PRESET_IDS,
} from "~/features/BasicSettings/components/tabs/Refresh/automaticFeatureSettings"
import { getShieldDevTriggerPresetLabel } from "~/features/BasicSettings/components/tabs/Refresh/ProtectionBypassDevTrigger"
import {
  executeShieldDevTrigger,
  parseShieldDevTriggerDelay,
} from "~/features/BasicSettings/components/tabs/Refresh/protectionBypassDevTriggerRuntime"
import ShieldSettings from "~/features/BasicSettings/components/tabs/Refresh/ShieldSettings"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { testI18n } from "~~/tests/test-utils/i18n"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  canUseTempWindowFetchMock,
  executeProtectionBypassTaskMock,
  getProtectionBypassUiVariantMock,
  isDevelopmentModeMock,
  isProtectionBypassFirefoxEnvMock,
  openSettingsTabMock,
  useUserPreferencesContextMock,
} = vi.hoisted(() => ({
  canUseTempWindowFetchMock: vi.fn(),
  executeProtectionBypassTaskMock: vi.fn(),
  getProtectionBypassUiVariantMock: vi.fn(),
  isDevelopmentModeMock: vi.fn(),
  isProtectionBypassFirefoxEnvMock: vi.fn(),
  openSettingsTabMock: vi.fn(),
  useUserPreferencesContextMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

vi.mock("~/utils/browser/protectionBypass", () => ({
  ProtectionBypassUiVariants: {
    TempWindowOnly: "tempWindowOnly",
    TempWindowWithCookieInterceptor: "tempWindowWithCookieInterceptor",
  },
  getProtectionBypassUiVariant: () => getProtectionBypassUiVariantMock(),
  isProtectionBypassFirefoxEnv: () => isProtectionBypassFirefoxEnvMock(),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  canUseTempWindowFetch: () => canUseTempWindowFetchMock(),
  executeProtectionBypassTask: (...args: unknown[]) =>
    executeProtectionBypassTaskMock(...args),
}))

vi.mock("~/utils/core/environment", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/environment")>()

  return {
    ...actual,
    isDevelopmentMode: () => isDevelopmentModeMock(),
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openSettingsTab: (...args: unknown[]) => openSettingsTabMock(...args),
  }
})

const completeExternalAutomaticFeatureBypass = {
  account_refresh: true,
  balance_history: false,
  checkin: true,
  redemption_assist: false,
  ldoh_site_lookup: true,
  key_management: false,
  managed_site_channels: true,
  managed_site_model_sync: false,
}

const automaticFeatureCheckboxNames = {
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh]:
    "settings:refresh.shieldAutomaticFeatureAccountRefresh",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory]:
    "settings:refresh.shieldAutomaticFeatureBalanceHistory",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin]:
    "settings:refresh.shieldAutomaticFeatureCheckin",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist]:
    "settings:refresh.shieldAutomaticFeatureRedemptionAssist",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup]:
    "settings:refresh.shieldAutomaticFeatureLdohSiteLookup",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement]:
    "settings:refresh.shieldAutomaticFeatureKeyManagement",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels]:
    "settings:refresh.shieldAutomaticFeatureManagedSiteChannels",
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync]:
    "settings:refresh.shieldAutomaticFeatureManagedSiteModelSync",
} as const satisfies Record<ProtectionBypassAutomaticFeature, string>

function getAutomaticFeatureCheckbox(
  feature: ProtectionBypassAutomaticFeature,
) {
  return screen.getByRole("checkbox", {
    name: automaticFeatureCheckboxNames[feature],
  })
}

function expectAutomaticFeatureCheckboxStates(
  expected: Record<ProtectionBypassAutomaticFeature, boolean>,
) {
  for (const [feature, checked] of Object.entries(expected) as [
    ProtectionBypassAutomaticFeature,
    boolean,
  ][]) {
    const checkbox = getAutomaticFeatureCheckbox(feature)
    if (checked) {
      expect(checkbox).toBeChecked()
    } else {
      expect(checkbox).not.toBeChecked()
    }
  }
}

describe("ShieldSettings", () => {
  const updateTempWindowFallback = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateTempWindowFallback.mockResolvedValue({ ok: true })
    canUseTempWindowFetchMock.mockResolvedValue(true)
    executeProtectionBypassTaskMock.mockResolvedValue({
      success: true,
      status: 200,
      data: "ok",
    })
    getProtectionBypassUiVariantMock.mockReturnValue(
      "tempWindowWithCookieInterceptor",
    )
    isDevelopmentModeMock.mockReturnValue(false)
    isProtectionBypassFirefoxEnvMock.mockReturnValue(false)
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })
  })

  it("shows the permission warning when temp-window access is unavailable", async () => {
    canUseTempWindowFetchMock.mockResolvedValue(false)

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("settings:refresh.shieldPermissionWarningTitle"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldPermissionAction",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:permissions.actions.refresh",
      }),
    )

    expect(openSettingsTabMock).toHaveBeenCalledWith("permissions", {
      preserveHistory: true,
    })
    expect(canUseTempWindowFetchMock).toHaveBeenCalledTimes(2)

    expect(screen.getByRole("switch")).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: /^settings:refresh\.shieldMethodTab/,
      }),
    ).toBeEnabled()
    for (const feature of Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES)) {
      expect(getAutomaticFeatureCheckbox(feature)).toBeEnabled()
    }
  })

  it("keeps manual policy controls editable when automatic bypass is off", async () => {
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: false,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const method = await screen.findByRole("button", {
      name: /^settings:refresh\.shieldMethodTab/,
    })
    expect(method).toBeEnabled()
    for (const feature of Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES)) {
      expect(getAutomaticFeatureCheckbox(feature)).toBeEnabled()
    }
  })

  it("updates fallback methods and complete automatic feature maps", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const tabModeButton = screen.getByRole("button", {
      name: /^settings:refresh\.shieldMethodTab/,
    })
    await waitFor(() => {
      expect(tabModeButton).toBeEnabled()
    })

    fireEvent.click(tabModeButton)

    const accountRefreshCheckbox = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )

    await waitFor(() => {
      expect(accountRefreshCheckbox).toBeEnabled()
    })

    fireEvent.click(accountRefreshCheckbox)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledWith({
        tempContextMode: "tab",
      })
    })
    expect(updateTempWindowFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        automaticFeatureBypass: expect.objectContaining({
          account_refresh: false,
        }),
      }),
    )
  })

  it("updates the automatic bypass master switch", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getByRole("switch"))

    expect(updateTempWindowFallback).toHaveBeenCalledWith({ enabled: false })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })
  })

  it.each([
    [TEMP_CONTEXT_MODES.Window, "settings:refresh.shieldMethodHintWindow"],
    [TEMP_CONTEXT_MODES.Tab, "settings:refresh.shieldMethodHintTab"],
  ] as const)(
    "shows the %s temporary-context method hint",
    async (mode, hint) => {
      useUserPreferencesContextMock.mockReturnValue({
        tempWindowFallback: {
          enabled: true,
          automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
          tempContextMode: mode,
        },
        updateTempWindowFallback,
      })

      render(<ShieldSettings />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      expect(screen.getByText(hint)).toBeInTheDocument()
      await waitFor(() => {
        expect(
          screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
        ).not.toBeInTheDocument()
      })
    },
  )

  it("exposes only the selected temporary-context hint to assistive technology", async () => {
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
        tempContextMode: TEMP_CONTEXT_MODES.Composite,
      },
      updateTempWindowFallback,
    })

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const selectedHint = screen.getByText(
      "settings:refresh.shieldMethodHintComposite",
    )
    const inactiveHints = [
      screen.getByText("settings:refresh.shieldMethodHintTab"),
      screen.getByText("settings:refresh.shieldMethodHintWindow"),
    ]

    expect(selectedHint).not.toHaveAttribute("aria-hidden")
    for (const inactiveHint of inactiveHints) {
      expect(inactiveHint).toHaveAttribute("aria-hidden", "true")
    }

    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })
  })

  it("accepts a pending feature write before synchronizing a later external update", async () => {
    const context = {
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
        tempContextMode: TEMP_CONTEXT_MODES.Composite,
      },
      updateTempWindowFallback,
    }
    useUserPreferencesContextMock.mockImplementation(() => context)
    const { rerender } = render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const accountRefresh = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )

    fireEvent.click(accountRefresh)
    await waitFor(() => expect(accountRefresh).not.toBeChecked())

    context.tempWindowFallback = {
      ...context.tempWindowFallback,
      automaticFeatureBypass: { ...completeExternalAutomaticFeatureBypass },
    }
    rerender(<ShieldSettings />)
    expect(accountRefresh).not.toBeChecked()

    context.tempWindowFallback = {
      ...context.tempWindowFallback,
      automaticFeatureBypass: {
        ...completeExternalAutomaticFeatureBypass,
        account_refresh: false,
      },
    }
    rerender(<ShieldSettings />)

    context.tempWindowFallback = {
      ...context.tempWindowFallback,
      automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
    }
    rerender(<ShieldSettings />)

    await waitFor(() => expect(accountRefresh).toBeChecked())
  })

  it("keeps rapid automatic-feature changes in the latest complete map", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const accountRefresh = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )
    const balanceHistory = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
    )
    fireEvent.click(accountRefresh)
    fireEvent.click(balanceHistory)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledTimes(2)
    })
    expect(updateTempWindowFallback).toHaveBeenLastCalledWith({
      automaticFeatureBypass: expect.objectContaining({
        account_refresh: false,
        balance_history: false,
      }),
    })
  })

  it("restores the complete external feature map when the latest write returns false", async () => {
    const latestWrite = createDeferred<{ ok: boolean }>()
    updateTempWindowFallback.mockReturnValueOnce(latestWrite.promise)
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const accountRefresh = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )
    fireEvent.click(accountRefresh)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledWith({
        automaticFeatureBypass: {
          ...completeExternalAutomaticFeatureBypass,
          account_refresh: false,
        },
      })
    })
    expect(accountRefresh).not.toBeChecked()

    await act(async () => {
      latestWrite.resolve({ ok: false })
      await latestWrite.promise
    })

    expect(accountRefresh).toBeChecked()
    expectAutomaticFeatureCheckboxStates(completeExternalAutomaticFeatureBypass)
  })

  it("restores the complete external feature map when the latest write rejects", async () => {
    const latestWrite = createDeferred<{ ok: boolean }>()
    updateTempWindowFallback.mockReturnValueOnce(latestWrite.promise)
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: completeExternalAutomaticFeatureBypass,
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const accountRefresh = getAutomaticFeatureCheckbox(
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )
    fireEvent.click(accountRefresh)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledWith({
        automaticFeatureBypass: {
          ...completeExternalAutomaticFeatureBypass,
          account_refresh: false,
        },
      })
    })
    expect(accountRefresh).not.toBeChecked()

    await act(async () => {
      latestWrite.reject(new Error("write rejected"))
      await latestWrite.promise.catch(() => undefined)
    })

    expect(accountRefresh).toBeChecked()
    expectAutomaticFeatureCheckboxStates(completeExternalAutomaticFeatureBypass)
  })

  it.each([
    {
      name: "returns false",
      settleOlderWrite: (
        write: ReturnType<typeof createDeferred<{ ok: boolean }>>,
      ) => write.resolve({ ok: false }),
    },
    {
      name: "rejects",
      settleOlderWrite: (
        write: ReturnType<typeof createDeferred<{ ok: boolean }>>,
      ) => write.reject(new Error("older write rejected")),
    },
  ])(
    "keeps newer confirmed feature choices when an older write $name",
    async ({ settleOlderWrite }) => {
      const olderWrite = createDeferred<{ ok: boolean }>()
      const newerWrite = createDeferred<{ ok: boolean }>()
      updateTempWindowFallback
        .mockReturnValueOnce(olderWrite.promise)
        .mockReturnValueOnce(newerWrite.promise)

      render(<ShieldSettings />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      const accountRefresh = getAutomaticFeatureCheckbox(
        PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
      )
      const balanceHistory = getAutomaticFeatureCheckbox(
        PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
      )
      fireEvent.click(accountRefresh)
      fireEvent.click(balanceHistory)

      await waitFor(() => {
        expect(updateTempWindowFallback).toHaveBeenCalledTimes(2)
      })
      expect(balanceHistory).not.toBeChecked()

      await act(async () => {
        newerWrite.resolve({ ok: true })
        await newerWrite.promise
      })
      await act(async () => {
        settleOlderWrite(olderWrite)
        await olderWrite.promise.catch(() => undefined)
      })

      expect(accountRefresh).not.toBeChecked()
      expect(balanceHistory).not.toBeChecked()
    },
  )

  it("puts the recommended current-window method first", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const methodGroup = screen.getByRole("group", {
      name: "settings:refresh.shieldMethodTitle",
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })
    expect(within(methodGroup).getAllByRole("button")).toEqual([
      screen.getByRole("button", {
        name: "settings:refresh.shieldMethodTab settings:refresh.shieldMethodRecommended",
      }),
      screen.getByRole("button", {
        name: "settings:refresh.shieldMethodComposite",
      }),
      screen.getByRole("button", {
        name: "settings:refresh.shieldMethodWindow",
      }),
    ])
  })

  it("gives the recommended opening method an accessible text equivalent", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.getByRole("button", {
        name: "settings:refresh.shieldMethodTab settings:refresh.shieldMethodRecommended",
      }),
    ).toBeInTheDocument()
  })

  it("blocks development-trigger execution outside development mode", async () => {
    await expect(
      executeShieldDevTrigger({
        presetId: SHIELD_DEV_TRIGGER_PRESET_IDS.AccountRefreshScheduled,
        url: "https://example.invalid/protected",
      }),
    ).rejects.toThrow(/development mode/i)

    expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()
  })

  it("rejects an unexpected development-trigger preset label", () => {
    expect(() =>
      getShieldDevTriggerPresetLabel(
        vi.fn() as unknown as TFunction,
        "future-preset" as never,
      ),
    ).toThrow("Unexpected development trigger preset: future-preset")
  })

  it("falls back to the default development-trigger preset for unknown input", () => {
    expect(getShieldDevTriggerPreset("future-preset" as never).id).toBe(
      SHIELD_DEV_TRIGGER_PRESET_IDS.AccountRefreshScheduled,
    )
  })

  it("rejects fractional development-trigger delays", () => {
    expect(parseShieldDevTriggerDelay("1.5")).toBeNull()
  })

  it("prefills the development trigger URL", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.getByRole("textbox", {
        name: "settings:refresh.shieldDevTriggerUrlLabel",
      }),
    ).toHaveValue("https://example.com/")
  })

  it("delays a development preset before submitting its real protected task", async () => {
    isDevelopmentModeMock.mockReturnValue(true)

    try {
      render(<ShieldSettings />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      await waitFor(() => {
        expect(
          screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
        ).not.toBeInTheDocument()
      })
      vi.useFakeTimers()

      fireEvent.change(
        screen.getByRole("textbox", {
          name: "settings:refresh.shieldDevTriggerUrlLabel",
        }),
        { target: { value: "https://example.invalid/protected" } },
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: "settings:refresh.shieldDevTriggerStart",
        }),
      )

      expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_999)
      })
      expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith({
        execution: {
          version: 2,
          kind: "automatic",
          feature: "account_refresh",
          trigger: "scheduled",
          surface: "background",
        },
        task: {
          kind: "api_fallback_fetch",
          params: {
            originUrl: "https://example.invalid/protected",
            fetchUrl: "https://example.invalid/protected",
            fetchOptions: {
              credentials: "include",
              method: "GET",
            },
            requestId: expect.any(String),
            responseType: "text",
          },
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses locale-controlled singular wording for the countdown", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    testI18n.addResourceBundle(
      "en",
      "settings",
      {
        refresh: {
          shieldDevTriggerCountdown_one: "Triggers in {{count}} second",
          shieldDevTriggerCountdown_other: "Triggers in {{count}} seconds",
        },
      },
      true,
      true,
    )

    try {
      render(<ShieldSettings />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      await waitFor(() => {
        expect(
          screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
        ).not.toBeInTheDocument()
      })
      vi.useFakeTimers()

      fireEvent.change(
        screen.getByRole("spinbutton", {
          name: "settings:refresh.shieldDevTriggerDelayLabel",
        }),
        { target: { value: "1" } },
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: "settings:refresh.shieldDevTriggerStart",
        }),
      )

      expect(screen.getByText("Triggers in 1 second")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      testI18n.removeResourceBundle("en", "settings")
    }
  })

  it("rejects an empty development-trigger delay instead of treating it as immediate", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "settings:refresh.shieldDevTriggerUrlLabel",
      }),
      { target: { value: "https://example.invalid/protected" } },
    )
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "settings:refresh.shieldDevTriggerDelayLabel",
      }),
      { target: { value: "" } },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldDevTriggerStart",
      }),
    )

    expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()
    expect(
      screen.getByText("settings:refresh.shieldDevTriggerInvalidDelay"),
    ).toHaveAttribute("role", "alert")
  })

  it("rejects a non-HTTP development-trigger URL", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "settings:refresh.shieldDevTriggerUrlLabel",
      }),
      { target: { value: "file:///protected" } },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldDevTriggerStart",
      }),
    )

    expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()
    expect(
      screen.getByText("settings:refresh.shieldDevTriggerInvalidUrl"),
    ).toHaveAttribute("role", "alert")
  })

  it("preserves a useful development-trigger failure message", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    executeProtectionBypassTaskMock.mockResolvedValueOnce({
      success: false,
      error: "Request rejected by the target",
    })
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "settings:refresh.shieldDevTriggerDelayLabel",
      }),
      { target: { value: "0" } },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldDevTriggerStart",
      }),
    )

    expect(
      await screen.findByText("Request rejected by the target"),
    ).toHaveAttribute("role", "alert")
  })

  it("uses localized fallback copy for a blank thrown error", async () => {
    isDevelopmentModeMock.mockReturnValue(true)
    executeProtectionBypassTaskMock.mockRejectedValueOnce(new Error("   "))
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await waitFor(() => {
      expect(
        screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
      ).not.toBeInTheDocument()
    })

    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "settings:refresh.shieldDevTriggerDelayLabel",
      }),
      { target: { value: "0" } },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldDevTriggerStart",
      }),
    )

    expect(
      await screen.findByText(
        "settings:refresh.shieldDevTriggerFailureFallback",
      ),
    ).toHaveAttribute("role", "alert")
  })

  it("cancels a waiting development trigger", async () => {
    isDevelopmentModeMock.mockReturnValue(true)

    try {
      render(<ShieldSettings />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })
      await waitFor(() => {
        expect(
          screen.queryByText("settings:refresh.shieldPermissionWarningTitle"),
        ).not.toBeInTheDocument()
      })
      vi.useFakeTimers()

      fireEvent.change(
        screen.getByRole("textbox", {
          name: "settings:refresh.shieldDevTriggerUrlLabel",
        }),
        { target: { value: "https://example.invalid/protected" } },
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: "settings:refresh.shieldDevTriggerStart",
        }),
      )
      fireEvent.click(
        screen.getByRole("button", {
          name: "settings:refresh.shieldDevTriggerCancel",
        }),
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })

      expect(executeProtectionBypassTaskMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses the selected existing behavior preset", async () => {
    const user = userEvent.setup()
    isDevelopmentModeMock.mockReturnValue(true)
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await user.click(
      screen.getByRole("combobox", {
        name: "settings:refresh.shieldDevTriggerPresetLabel",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "settings:refresh.shieldDevTriggerPresetCheckinScheduled",
      }),
    )
    await user.type(
      screen.getByRole("textbox", {
        name: "settings:refresh.shieldDevTriggerUrlLabel",
      }),
      "https://example.invalid/protected",
    )
    fireEvent.change(
      screen.getByRole("spinbutton", {
        name: "settings:refresh.shieldDevTriggerDelayLabel",
      }),
      { target: { value: "0" } },
    )
    await user.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldDevTriggerStart",
      }),
    )

    await waitFor(() => {
      expect(executeProtectionBypassTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          execution: expect.objectContaining({
            feature: "checkin",
            trigger: "scheduled",
            surface: "background",
          }),
        }),
      )
    })
  })
})
