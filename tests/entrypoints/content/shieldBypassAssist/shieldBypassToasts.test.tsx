import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

type ShieldBypassPromptToastProps = {
  onDismiss: () => void
  onOpenSettings: () => Promise<void> | void
}

const {
  toastCustomMock,
  toastDismissMock,
  ensureRedemptionToastUiMock,
  sendRuntimeMessageMock,
  loggerErrorMock,
  trackCompletedMock,
} = vi.hoisted(() => ({
  toastCustomMock: vi.fn(),
  toastDismissMock: vi.fn(),
  ensureRedemptionToastUiMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  trackCompletedMock: vi.fn(),
}))

vi.mock("react-hot-toast/headless", () => ({
  default: {
    custom: toastCustomMock,
    dismiss: toastDismissMock,
  },
}))

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  ensureRedemptionToastUi: ensureRedemptionToastUiMock,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: trackCompletedMock,
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}))

describe("shieldBypassToasts", () => {
  const originalUrl = `${window.location.pathname}${window.location.search}`
  const originalTitle = document.title

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    window.history.replaceState({}, "", originalUrl)
    document.title = originalTitle
    ensureRedemptionToastUiMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    window.history.replaceState({}, "", originalUrl)
    document.title = originalTitle
  })

  it("renders the shield-bypass prompt toast with a fixed id and wires dismiss/settings actions", async () => {
    toastCustomMock.mockReturnValue("shield-toast-id")
    sendRuntimeMessageMock.mockResolvedValue({ success: true })

    const { showShieldBypassPromptToast } = await import(
      "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
    )

    await showShieldBypassPromptToast()

    expect(ensureRedemptionToastUiMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).toHaveBeenCalledWith(expect.any(Function), {
      id: "shield-bypass-helper",
      duration: Infinity,
    })

    const renderer = toastCustomMock.mock
      .calls[0]?.[0] as () => React.ReactElement<ShieldBypassPromptToastProps>
    const element = renderer()

    expect(React.isValidElement(element)).toBe(true)

    const props = element.props
    props.onDismiss()

    expect(toastDismissMock).toHaveBeenCalledWith("shield-bypass-helper")

    await props.onOpenSettings()

    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      action: RuntimeActionIds.OpenSettingsShieldBypass,
    })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("tracks shield prompt exposure without host-page details", async () => {
    window.history.replaceState({}, "", "/private-shield?token=secret")
    document.title = "Private Challenge Title"
    toastCustomMock.mockReturnValue("shield-toast-id")

    const { showShieldBypassPromptToast } = await import(
      "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
    )

    await showShieldBypassPromptToast()

    expect(trackCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowShieldBypassPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentShieldBypassPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
    })

    const analyticsPayloads = JSON.stringify(trackCompletedMock.mock.calls)
    expect(analyticsPayloads).not.toContain("private-shield")
    expect(analyticsPayloads).not.toContain("secret")
    expect(analyticsPayloads).not.toContain("Private Challenge Title")
  })

  it("logs a settings-open failure without throwing from the toast action", async () => {
    sendRuntimeMessageMock.mockRejectedValue(new Error("settings failed"))

    const { showShieldBypassPromptToast } = await import(
      "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
    )

    await showShieldBypassPromptToast()

    const renderer = toastCustomMock.mock
      .calls[0]?.[0] as () => React.ReactElement<ShieldBypassPromptToastProps>
    const element = renderer()

    await expect(element.props.onOpenSettings()).resolves.toBeUndefined()

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to open settings page",
      expect.any(Error),
    )
  })
})
