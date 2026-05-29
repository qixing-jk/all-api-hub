import { waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { ApiCheckConfirmToastAction } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast"

type ApiCheckConfirmToastProps = {
  onAction: (action: ApiCheckConfirmToastAction) => void
  usesEnhancedResult?: boolean
}

type ToastInstance = {
  id: string
}

const {
  toastCustomMock,
  toastDismissMock,
  ensureRedemptionToastUiMock,
  sendRuntimeMessageMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  toastCustomMock: vi.fn(),
  toastDismissMock: vi.fn(),
  ensureRedemptionToastUiMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loggerErrorMock: vi.fn(),
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

vi.mock(
  "~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast",
  () => ({
    ApiCheckConfirmToast: (props: ApiCheckConfirmToastProps) =>
      React.createElement("mock-api-check-confirm-toast", props as any),
  }),
)

describe("apiCheckToasts", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    ensureRedemptionToastUiMock.mockResolvedValue(undefined)
    sendRuntimeMessageMock.mockResolvedValue({ success: true })
  })

  it("shows the confirm toast with infinite duration and resolves true only once for confirm actions", async () => {
    let renderedElement: React.ReactElement<ApiCheckConfirmToastProps> | null =
      null

    toastCustomMock.mockImplementation(
      (
        renderer: (
          toastInstance: ToastInstance,
        ) => React.ReactElement<ApiCheckConfirmToastProps>,
      ) => {
        const element = renderer({ id: "api-check-toast-id" })
        renderedElement = element
        return "api-check-toast-return"
      },
    )

    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast()

    await waitFor(() => {
      expect(ensureRedemptionToastUiMock).toHaveBeenCalledTimes(1)
      expect(toastCustomMock).toHaveBeenCalledWith(expect.any(Function), {
        duration: Infinity,
      })
      expect(renderedElement).toBeTruthy()
    })

    renderedElement!.props.onAction("confirm")
    renderedElement!.props.onAction("cancel")

    await expect(toastPromise).resolves.toBe(true)
    expect(toastDismissMock).toHaveBeenCalledTimes(1)
    expect(toastDismissMock).toHaveBeenCalledWith("api-check-toast-id")
    expect(renderedElement!.props).toEqual(
      expect.objectContaining({ usesEnhancedResult: false }),
    )
  })

  it("passes enhanced-result state to the confirmation toast", async () => {
    let renderedElement: React.ReactElement<ApiCheckConfirmToastProps> | null =
      null

    toastCustomMock.mockImplementation(
      (
        renderer: (
          toastInstance: ToastInstance,
        ) => React.ReactElement<ApiCheckConfirmToastProps>,
      ) => {
        renderedElement = renderer({ id: "api-check-toast-id" })
        return "api-check-toast-return"
      },
    )

    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast({ usesEnhancedResult: true })

    await waitFor(() => {
      expect(renderedElement).toBeTruthy()
      expect(renderedElement!.props).toEqual(
        expect.objectContaining({ usesEnhancedResult: true }),
      )
    })

    renderedElement!.props.onAction("confirm")
    await expect(toastPromise).resolves.toBe(true)
  })

  it("resolves false for cancel actions and still dismisses the owning toast once", async () => {
    toastCustomMock.mockReturnValue("api-check-toast-return")

    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast()

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const renderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<ApiCheckConfirmToastProps>
    const element = renderer({ id: "api-check-toast-id" })

    element.props.onAction("cancel")
    element.props.onAction("confirm")

    await expect(toastPromise).resolves.toBe(false)
    expect(toastDismissMock).toHaveBeenCalledTimes(1)
    expect(toastDismissMock).toHaveBeenCalledWith("api-check-toast-id")
  })

  it("opens Web AI API Check settings without resolving or dismissing the confirmation toast", async () => {
    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast()

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const renderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<ApiCheckConfirmToastProps>
    const element = renderer({ id: "api-check-toast-id" })

    element.props.onAction("settings")

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.OpenSettingsWebAiApiCheck,
      })
    })
    expect(toastDismissMock).not.toHaveBeenCalled()

    element.props.onAction("confirm")
    await expect(toastPromise).resolves.toBe(true)
  })

  it("opens issue feedback without resolving or dismissing the confirmation toast", async () => {
    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast({ usesEnhancedResult: true })

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const renderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<ApiCheckConfirmToastProps>
    const element = renderer({ id: "api-check-toast-id" })

    element.props.onAction("feedback")

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.OpenFeedbackBugReport,
      })
    })
    expect(toastDismissMock).not.toHaveBeenCalled()

    element.props.onAction("cancel")
    await expect(toastPromise).resolves.toBe(false)
  })

  it("logs settings-open failures without dismissing the confirmation toast", async () => {
    const settingsError = new Error("settings failed")
    sendRuntimeMessageMock.mockRejectedValue(settingsError)

    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast()

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const renderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<ApiCheckConfirmToastProps>
    const element = renderer({ id: "api-check-toast-id" })

    element.props.onAction("settings")

    await waitFor(() => {
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Failed to open Web AI API Check settings page",
        settingsError,
      )
    })
    expect(toastDismissMock).not.toHaveBeenCalled()

    element.props.onAction("cancel")
    await expect(toastPromise).resolves.toBe(false)
  })

  it("logs feedback-open failures without dismissing the confirmation toast", async () => {
    const feedbackError = new Error("feedback failed")
    sendRuntimeMessageMock.mockRejectedValue(feedbackError)

    const { showApiCheckConfirmToast } = await import(
      "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
    )

    const toastPromise = showApiCheckConfirmToast({ usesEnhancedResult: true })

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const renderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<ApiCheckConfirmToastProps>
    const element = renderer({ id: "api-check-toast-id" })

    element.props.onAction("feedback")

    await waitFor(() => {
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Failed to open Web AI API Check feedback page",
        feedbackError,
      )
    })
    expect(toastDismissMock).not.toHaveBeenCalled()

    element.props.onAction("confirm")
    await expect(toastPromise).resolves.toBe(true)
  })
})
