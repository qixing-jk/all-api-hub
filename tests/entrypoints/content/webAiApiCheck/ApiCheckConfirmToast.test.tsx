import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCheckConfirmToast } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const map: Record<string, string> = {
          "webAiApiCheck:confirmToast.title": "AI API URL and API Key Detected",
          "webAiApiCheck:confirmToast.body":
            "Do you want to open the AI API test Panel to check and test the AI API's availability?",
          "webAiApiCheck:confirmToast.open": "Open",
          "webAiApiCheck:confirmToast.settings": "Settings",
          "webAiApiCheck:confirmToast.feedback": "Report issue",
          "webAiApiCheck:confirmToast.enhancedInfo":
            "Triggered by enhanced auto-detect. If this looks wrong, report it or turn off enhanced auto-detect in settings.",
          "common:actions.cancel": "Cancel",
        }
        return map[key] ?? key
      },
    }),
  }
})

describe("ApiCheckConfirmToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("renders the confirmation copy and emits cancel and confirm actions without bubbling clicks", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const parentClick = vi.fn()

    render(
      <div onClick={parentClick}>
        <ApiCheckConfirmToast onAction={onAction} />
      </div>,
    )

    expect(
      screen.getByText("AI API URL and API Key Detected"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Do you want to open the AI API test Panel to check and test the AI API's availability?",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(
      screen.getByRole("button", {
        name: "Open",
      }),
    )

    expect(onAction).toHaveBeenNthCalledWith(1, "cancel")
    expect(onAction).toHaveBeenNthCalledWith(2, "confirm")
    expect(parentClick).not.toHaveBeenCalled()
  })

  it("does not show enhanced auto-detect info for standard matches", () => {
    render(<ApiCheckConfirmToast onAction={vi.fn()} />)

    expect(
      screen.queryByText(
        "Triggered by enhanced auto-detect. If this looks wrong, report it or turn off enhanced auto-detect in settings.",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Report issue" }),
    ).not.toBeInTheDocument()
  })

  it("shows enhanced auto-detect info with feedback and settings shortcuts", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<ApiCheckConfirmToast onAction={onAction} usesEnhancedResult />)

    expect(
      screen.getByText(
        "Triggered by enhanced auto-detect. If this looks wrong, report it or turn off enhanced auto-detect in settings.",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Report issue" }))
    await user.click(screen.getByRole("button", { name: "Settings" }))

    expect(onAction).toHaveBeenNthCalledWith(1, "feedback")
    expect(onAction).toHaveBeenNthCalledWith(2, "settings")
  })

  it("emits settings actions without closing the confirmation flow", async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<ApiCheckConfirmToast onAction={onAction} usesEnhancedResult />)

    await user.click(screen.getByRole("button", { name: "Settings" }))

    expect(onAction).toHaveBeenCalledExactlyOnceWith("settings")
  })

  it("tracks fixed analytics metadata for confirmation actions", async () => {
    const user = userEvent.setup()
    render(<ApiCheckConfirmToast onAction={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "Open" }))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialCheckDismissed,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialReviewStarted,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })
})
