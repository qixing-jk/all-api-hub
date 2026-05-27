import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

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
  recordPromptShownMock,
} = vi.hoisted(() => ({
  toastCustomMock: vi.fn(),
  toastDismissMock: vi.fn(),
  ensureRedemptionToastUiMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  recordPromptShownMock: vi.fn(),
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

vi.mock("~/services/productAnalytics/shieldBypassSummary", () => ({
  recordShieldBypassPromptShown: recordPromptShownMock,
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

  it("records shield prompt exposure locally without host-page details", async () => {
    window.history.replaceState({}, "", "/private-shield?token=secret")
    document.title = "Private Challenge Title"
    toastCustomMock.mockReturnValue("shield-toast-id")

    const { showShieldBypassPromptToast } = await import(
      "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
    )

    await showShieldBypassPromptToast()

    expect(recordPromptShownMock).toHaveBeenCalledTimes(1)

    const analyticsPayloads = JSON.stringify(recordPromptShownMock.mock.calls)
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
