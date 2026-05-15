import { waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RedemptionAccountSelectToastProps } from "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast"
import type {
  RedemptionBatchResultItem,
  RedemptionBatchResultToastProps,
} from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import type {
  RedemptionPromptCodeItem,
  RedemptionPromptResult,
} from "~/entrypoints/content/redemptionAssist/components/RedemptionPromptToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

type LoadingToastProps = {
  message: string
}

type PromptToastProps = {
  message: string
  codes: RedemptionPromptCodeItem[]
  onAction: (result: RedemptionPromptResult) => void
}

type ToastInstance = {
  id: string
}

const {
  toastCustomMock,
  toastSuccessMock,
  toastErrorMock,
  toastDismissMock,
  ensureRedemptionToastUiMock,
  trackCompletedMock,
} = vi.hoisted(() => ({
  toastCustomMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastDismissMock: vi.fn(),
  ensureRedemptionToastUiMock: vi.fn(),
  trackCompletedMock: vi.fn(),
}))

vi.mock("react-hot-toast/headless", () => ({
  default: {
    custom: toastCustomMock,
    success: toastSuccessMock,
    error: toastErrorMock,
    dismiss: toastDismissMock,
  },
}))

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  ensureRedemptionToastUi: ensureRedemptionToastUiMock,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: trackCompletedMock,
}))

vi.mock(
  "~/entrypoints/content/redemptionAssist/components/RedemptionAccountSelectToast",
  () => ({
    RedemptionAccountSelectToast: (props: RedemptionAccountSelectToastProps) =>
      React.createElement("mock-account-select-toast", props as any),
  }),
)

vi.mock(
  "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast",
  () => ({
    RedemptionBatchResultToast: (props: RedemptionBatchResultToastProps) =>
      React.createElement("mock-batch-result-toast", props as any),
  }),
)

vi.mock(
  "~/entrypoints/content/redemptionAssist/components/RedemptionLoadingToast",
  () => ({
    RedemptionLoadingToast: (props: LoadingToastProps) =>
      React.createElement("mock-loading-toast", props as any),
  }),
)

vi.mock(
  "~/entrypoints/content/redemptionAssist/components/RedemptionPromptToast",
  () => ({
    RedemptionPromptToast: (props: PromptToastProps) =>
      React.createElement("mock-prompt-toast", props as any),
  }),
)

describe("redemptionToasts", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    ensureRedemptionToastUiMock.mockResolvedValue(undefined)
  })

  it("shows the loading toast through the shared UI root with an indefinite duration", async () => {
    toastCustomMock.mockReturnValue("loading-toast-id")

    const { showRedeemLoadingToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    await expect(showRedeemLoadingToast("Redeeming now")).resolves.toBe(
      "loading-toast-id",
    )

    expect(ensureRedemptionToastUiMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).toHaveBeenCalledWith(expect.any(Function), {
      duration: Infinity,
    })

    const loadingRenderer = toastCustomMock.mock
      .calls[0]?.[0] as () => React.ReactElement<LoadingToastProps>
    const loadingElement = loadingRenderer()

    expect(React.isValidElement(loadingElement)).toBe(true)
    expect(loadingElement.props.message).toBe("Redeeming now")
  })

  it("passes toast ids through to dismissToast", async () => {
    const { dismissToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    dismissToast("toast-123")
    dismissToast()

    expect(toastDismissMock).toHaveBeenNthCalledWith(1, "toast-123")
    expect(toastDismissMock).toHaveBeenNthCalledWith(2, undefined)
  })

  it("skips blank result toasts and routes non-blank messages to success or error", async () => {
    const { showRedeemResultToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    await showRedeemResultToast(true, "")

    expect(ensureRedemptionToastUiMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()

    await showRedeemResultToast(true, "Redeemed")
    await showRedeemResultToast(false, "Failed")

    expect(ensureRedemptionToastUiMock).toHaveBeenCalledTimes(2)
    expect(toastSuccessMock).toHaveBeenCalledWith("Redeemed")
    expect(toastErrorMock).toHaveBeenCalledWith("Failed")
  })

  it("resolves account selection exactly once and dismisses the owning toast", async () => {
    let renderedElement: React.ReactElement<RedemptionAccountSelectToastProps> | null =
      null

    toastCustomMock.mockImplementation(
      (
        renderer: (
          toastInstance: ToastInstance,
        ) => React.ReactElement<RedemptionAccountSelectToastProps>,
      ) => {
        const element = renderer({ id: "account-toast-id" })
        expect(React.isValidElement(element)).toBe(true)
        renderedElement = element
        expect(renderedElement.props.title).toBe("Pick account")
        expect(renderedElement.props.message).toBe("Choose one")
        return "account-toast-return"
      },
    )

    const { showAccountSelectToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    const chosenAccount = { id: "account-a", siteName: "Alpha" } as any
    const ignoredAccount = { id: "account-b", siteName: "Beta" } as any

    const selectionPromise = showAccountSelectToast([chosenAccount], {
      title: "Pick account",
      message: "Choose one",
    })

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
      expect(renderedElement).toBeTruthy()
    })

    renderedElement!.props.onSelect(chosenAccount)
    renderedElement!.props.onSelect(ignoredAccount)

    await expect(selectionPromise).resolves.toBe(chosenAccount)
    expect(toastDismissMock).toHaveBeenCalledTimes(1)
    expect(toastDismissMock).toHaveBeenCalledWith("account-toast-id")
  })

  it("tracks account-select exposure with only account count insight", async () => {
    toastCustomMock.mockReturnValue("account-toast-return")

    const { showAccountSelectToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    void showAccountSelectToast(
      [
        {
          id: "secret-account-id",
          name: "Private Account",
          siteName: "Private Site",
          baseUrl: "https://private.example.com",
        } as any,
      ],
      { title: "Pick account" },
    )

    await waitFor(() => {
      expect(trackCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionAccountSelect,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: 1,
        },
      })
    })

    const analyticsPayloads = JSON.stringify(trackCompletedMock.mock.calls)
    expect(analyticsPayloads).not.toContain("secret-account-id")
    expect(analyticsPayloads).not.toContain("Private Account")
    expect(analyticsPayloads).not.toContain("Private Site")
    expect(analyticsPayloads).not.toContain("https://private.example.com")
  })

  it("resolves the redemption prompt exactly once and preserves the first action payload", async () => {
    toastCustomMock.mockReturnValue("prompt-toast-return")

    const { showRedemptionPromptToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    const promptPromise = showRedemptionPromptToast("Prompt message", [
      { code: "code-a", preview: "AA**" },
      { code: "code-b", preview: "BB**" },
    ])

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const promptRenderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<PromptToastProps>
    const promptElement = promptRenderer({ id: "prompt-toast-id" })
    const firstResult: RedemptionPromptResult = {
      action: "auto",
      selectedCodes: ["code-a"],
    }

    expect(promptElement.props.message).toBe("Prompt message")
    expect(promptElement.props.codes).toEqual([
      { code: "code-a", preview: "AA**" },
      { code: "code-b", preview: "BB**" },
    ])
    promptElement.props.onAction(firstResult)
    promptElement.props.onAction({
      action: "cancel",
      selectedCodes: [],
    })

    await expect(promptPromise).resolves.toEqual(firstResult)
    expect(toastDismissMock).toHaveBeenCalledTimes(1)
    expect(toastDismissMock).toHaveBeenCalledWith("prompt-toast-id")
  })

  it("tracks redemption prompt exposure with item count only", async () => {
    toastCustomMock.mockReturnValue("prompt-toast-return")

    const { showRedemptionPromptToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    void showRedemptionPromptToast("Prompt message", [
      { code: "secret-code-a", preview: "AA**" },
      { code: "secret-code-b", preview: "BB**" },
    ])

    await waitFor(() => {
      expect(trackCompletedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionPrompt,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: 2,
        },
      })
    })

    const analyticsPayloads = JSON.stringify(trackCompletedMock.mock.calls)
    expect(analyticsPayloads).not.toContain("secret-code-a")
    expect(analyticsPayloads).not.toContain("secret-code-b")
    expect(analyticsPayloads).not.toContain("AA**")
    expect(analyticsPayloads).not.toContain("BB**")
  })

  it("renders the batch result toast with an indefinite duration and dismisses on close", async () => {
    toastCustomMock.mockReturnValue("batch-toast-return")

    const { showRedeemBatchResultToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    const results: RedemptionBatchResultItem[] = [
      {
        code: "code-a",
        preview: "AA**",
        success: false,
        message: "Failed",
      },
    ]
    const onRetry =
      vi.fn<(code: string) => Promise<RedemptionBatchResultItem>>()

    await expect(showRedeemBatchResultToast(results, onRetry)).resolves.toBe(
      "batch-toast-return",
    )

    expect(ensureRedemptionToastUiMock).toHaveBeenCalledTimes(1)
    expect(toastCustomMock).toHaveBeenCalledWith(expect.any(Function), {
      duration: Infinity,
    })

    await waitFor(() => {
      expect(toastCustomMock).toHaveBeenCalledTimes(1)
    })

    const batchRenderer = toastCustomMock.mock.calls[0]?.[0] as (
      toastInstance: ToastInstance,
    ) => React.ReactElement<RedemptionBatchResultToastProps>
    const batchElement = batchRenderer({ id: "batch-toast-id" })

    expect(batchElement.props.results).toEqual(results)
    expect(batchElement.props.onRetry).toBe(onRetry)
    batchElement.props.onClose()

    expect(toastDismissMock).toHaveBeenCalledWith("batch-toast-id")
  })

  it("tracks batch-result exposure with aggregate result counts only", async () => {
    toastCustomMock.mockReturnValue("batch-toast-return")

    const { showRedeemBatchResultToast } = await import(
      "~/entrypoints/content/redemptionAssist/utils/redemptionToasts"
    )

    await showRedeemBatchResultToast(
      [
        {
          code: "secret-code-a",
          preview: "AA**",
          success: true,
          message: "Redeemed at https://private.example.com",
        },
        {
          code: "secret-code-b",
          preview: "BB**",
          success: false,
          message: "Failed for Private Account",
        },
      ],
      vi.fn(),
    )

    expect(trackCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionBatchResult,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        itemCount: 2,
        successCount: 1,
        failureCount: 1,
        skippedCount: 0,
      },
    })

    const analyticsPayloads = JSON.stringify(trackCompletedMock.mock.calls)
    expect(analyticsPayloads).not.toContain("secret-code-a")
    expect(analyticsPayloads).not.toContain("secret-code-b")
    expect(analyticsPayloads).not.toContain("AA**")
    expect(analyticsPayloads).not.toContain("BB**")
    expect(analyticsPayloads).not.toContain("https://private.example.com")
    expect(analyticsPayloads).not.toContain("Private Account")
  })
})
