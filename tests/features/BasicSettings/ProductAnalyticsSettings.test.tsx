import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ProductAnalyticsSettings from "~/features/BasicSettings/components/tabs/General/ProductAnalyticsSettings"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const {
  preferenceMocks,
  trackActionStartedMock,
  trackMock,
  showUpdateToastMock,
} = vi.hoisted(() => ({
  preferenceMocks: {
    isEnabled: vi.fn(),
    setEnabled: vi.fn(),
  },
  trackActionStartedMock: vi.fn(),
  trackMock: vi.fn(),
  showUpdateToastMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/preferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/preferences")
    >()
  return {
    ...actual,
    productAnalyticsPreferences: {
      ...actual.productAnalyticsPreferences,
      ...preferenceMocks,
    },
  }
})

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()
  return {
    ...actual,
    trackProductAnalyticsEvent: trackMock,
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackActionStartedMock,
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: showUpdateToastMock,
}))

async function findLoadedSwitch(checked: boolean) {
  const switchControl = await screen.findByRole("switch")

  await waitFor(() => {
    expect(switchControl).toBeEnabled()
    expect(switchControl).toHaveAttribute("aria-checked", String(checked))
  })

  return switchControl
}

describe("ProductAnalyticsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferenceMocks.isEnabled.mockResolvedValue(true)
    preferenceMocks.setEnabled.mockResolvedValue(true)
    trackActionStartedMock.mockResolvedValue(undefined)
    trackMock.mockResolvedValue({ success: true })
  })

  it("renders the opt-out copy and current enabled state", async () => {
    render(<ProductAnalyticsSettings />)

    expect(
      await screen.findByText("settings:productAnalytics.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("settings:productAnalytics.description"),
    ).toBeInTheDocument()
    await findLoadedSwitch(true)
  })

  it("persists disabled state immediately and does not track setting_changed after disabling", async () => {
    render(<ProductAnalyticsSettings />)

    const switchControl = await findLoadedSwitch(true)
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(preferenceMocks.setEnabled).toHaveBeenCalledWith(false)
    })
    expect(trackMock).not.toHaveBeenCalled()
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:productAnalytics.enableLabel",
    )
  })

  it("reverts disabled state, shows a failure toast, and does not track when disabling persistence fails", async () => {
    preferenceMocks.setEnabled.mockResolvedValue(false)
    render(<ProductAnalyticsSettings />)

    const switchControl = await findLoadedSwitch(true)
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(preferenceMocks.setEnabled).toHaveBeenCalledWith(false)
    })
    await waitFor(() => {
      expect(switchControl).toBeEnabled()
      expect(switchControl).toHaveAttribute("aria-checked", "true")
    })
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      false,
      "settings:productAnalytics.enableLabel",
    )
    expect(trackMock).not.toHaveBeenCalled()
  })

  it("keeps the switch usable when the initial preference read rejects", async () => {
    preferenceMocks.isEnabled.mockRejectedValue(new Error("storage failed"))

    render(<ProductAnalyticsSettings />)

    const switchControl = await screen.findByRole("switch")

    await waitFor(() => {
      expect(switchControl).toBeEnabled()
      expect(switchControl).toHaveAttribute("aria-checked", "false")
    })
  })

  it("reverts state and shows a failure toast when preference persistence throws", async () => {
    preferenceMocks.setEnabled.mockRejectedValue(new Error("storage failed"))
    render(<ProductAnalyticsSettings />)

    const switchControl = await findLoadedSwitch(true)
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(preferenceMocks.setEnabled).toHaveBeenCalledWith(false)
    })
    await waitFor(() => {
      expect(switchControl).toBeEnabled()
      expect(switchControl).toHaveAttribute("aria-checked", "true")
    })
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      false,
      "settings:productAnalytics.enableLabel",
    )
    expect(trackMock).not.toHaveBeenCalled()
  })

  it("prevents overlapping preference writes while a save is pending", async () => {
    let resolveSetEnabled: (success: boolean) => void = () => {}
    preferenceMocks.setEnabled.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSetEnabled = resolve
      }),
    )
    render(<ProductAnalyticsSettings />)

    const switchControl = await findLoadedSwitch(true)
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(preferenceMocks.setEnabled).toHaveBeenCalledWith(false)
    })
    await waitFor(() => {
      expect(switchControl).toBeDisabled()
    })

    fireEvent.click(switchControl)
    expect(preferenceMocks.setEnabled).toHaveBeenCalledTimes(1)

    resolveSetEnabled(true)
    await waitFor(() => {
      expect(switchControl).toBeEnabled()
      expect(switchControl).toHaveAttribute("aria-checked", "false")
    })
    expect(trackMock).not.toHaveBeenCalled()
  })

  it("tracks setting_changed when enabling analytics", async () => {
    preferenceMocks.isEnabled.mockResolvedValue(false)
    render(<ProductAnalyticsSettings />)

    const switchControl = await findLoadedSwitch(false)
    fireEvent.click(switchControl)

    await waitFor(() => {
      expect(preferenceMocks.setEnabled).toHaveBeenCalledWith(true)
    })
    expect(trackActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableProductAnalytics,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackMock).toHaveBeenCalledWith("setting_changed", {
      setting_id: "product_analytics_enabled",
      enabled: true,
      entrypoint: "options",
    })
  })
})
