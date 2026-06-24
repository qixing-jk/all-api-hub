import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { RedemptionPromptToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionPromptToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const {
  loggerErrorMock,
  sendRuntimeMessageMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const labels: Record<string, string> = {
          "redemptionAssist:messages.promptTitle": "Redeem codes",
          "redemptionAssist:messages.selectAll": "Select all",
          "redemptionAssist:messages.promptSource": "Need to adjust settings?",
          "redemptionAssist:messages.promptSettingsLink": "Open settings",
          "redemptionAssist:actions.autoRedeem": "Auto redeem",
          "common:actions.cancel": "Cancel",
        }

        return labels[key] ?? key
      },
    }),
  }
})

vi.mock("~/components/ui", () => ({
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Button: ({
    analyticsAction,
    children,
    disabled,
    onClick,
    variant,
  }: {
    children: React.ReactNode
    analyticsAction?: unknown
    disabled?: boolean
    onClick?: (event: React.MouseEvent) => void
    variant?: string
  }) => (
    <button
      type="button"
      data-variant={variant}
      data-analytics-action={analyticsAction ? "present" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Caption: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Card: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Heading3: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  Link: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode
    href: string
    onClick?: (event: React.MouseEvent) => void
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: (...args: unknown[]) => sendRuntimeMessageMock(...args),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: unknown[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

describe("RedemptionPromptToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("supports partial selection, select-all recovery, and auto redeeming only the checked codes", async () => {
    const onAction = vi.fn()

    render(
      <RedemptionPromptToast
        message="Select which codes to redeem."
        codes={[
          { code: "code-1", preview: "ABCD***1" },
          { code: "code-2", preview: "ABCD***2" },
        ]}
        onAction={onAction}
      />,
    )

    const [selectAllCheckbox, codeOneCheckbox, codeTwoCheckbox] =
      screen.getAllByRole("checkbox")
    const autoRedeemButton = screen.getByRole("button", { name: "Auto redeem" })

    expect(selectAllCheckbox).toBeChecked()
    expect(autoRedeemButton).toBeEnabled()

    fireEvent.click(codeOneCheckbox)

    await waitFor(() => {
      expect(selectAllCheckbox).not.toBeChecked()
      expect((selectAllCheckbox as HTMLInputElement).indeterminate).toBe(true)
    })

    fireEvent.click(codeTwoCheckbox)

    expect(autoRedeemButton).toBeDisabled()

    fireEvent.click(selectAllCheckbox)

    expect(codeOneCheckbox).toBeChecked()
    expect(codeTwoCheckbox).toBeChecked()
    expect(autoRedeemButton).toBeEnabled()

    fireEvent.click(autoRedeemButton)

    expect(onAction).toHaveBeenCalledWith({
      action: "auto",
      selectedCodes: ["code-1", "code-2"],
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })

  it("hides the select-all control for a single code and returns a cancel action", () => {
    const onAction = vi.fn()

    render(
      <RedemptionPromptToast
        message="Single-code flow"
        codes={[{ code: "code-1", preview: "ONLY***1" }]}
        onAction={onAction}
      />,
    )

    expect(
      screen.queryByRole("checkbox", { name: "Select all" }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onAction).toHaveBeenCalledWith({
      action: "cancel",
      selectedCodes: [],
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })

  it("opens the redeem settings page and logs a failure when the runtime request rejects", async () => {
    const runtimeError = new Error("runtime unavailable")
    sendRuntimeMessageMock.mockRejectedValueOnce(runtimeError)

    render(
      <RedemptionPromptToast
        message="Need settings"
        codes={[{ code: "code-1", preview: "ONLY***1" }]}
        onAction={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("link", { name: "Open settings" }))

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.OpenSettingsCheckinRedeem,
      })
    })
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to open settings page",
      runtimeError,
    )
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.VisitRedemptionAssistSettingsFromPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })
})
