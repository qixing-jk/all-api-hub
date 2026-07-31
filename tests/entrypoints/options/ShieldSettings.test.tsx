import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import ShieldSettings from "~/features/BasicSettings/components/tabs/Refresh/ShieldSettings"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const {
  canUseTempWindowFetchMock,
  getProtectionBypassUiVariantMock,
  isProtectionBypassFirefoxEnvMock,
  openSettingsTabMock,
  useUserPreferencesContextMock,
} = vi.hoisted(() => ({
  canUseTempWindowFetchMock: vi.fn(),
  getProtectionBypassUiVariantMock: vi.fn(),
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
}))

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
    getProtectionBypassUiVariantMock.mockReturnValue(
      "tempWindowWithCookieInterceptor",
    )
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
        name: "settings:refresh.shieldMethodTab",
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
      name: "settings:refresh.shieldMethodTab",
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
      name: "settings:refresh.shieldMethodTab",
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

  it("lets shield method buttons wrap inside narrow settings cards", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const tabModeButton = await screen.findByRole("button", {
      name: "settings:refresh.shieldMethodTab",
    })
    const methodGroup = tabModeButton.parentElement

    expect(methodGroup).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
    expect(tabModeButton).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )
  })
})
