import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ShieldBypassPromptToast } from "~/entrypoints/content/shieldBypassAssist/components/ShieldBypassPromptToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen } from "~~/tests/test-utils/render"

const {
  translationMap,
  trackStartedMock,
  recordDismissedMock,
  recordSettingsVisitedMock,
} = vi.hoisted(() => ({
  translationMap: {
    titlePrefix: "Shield Mode",
    "toast.title": "Shield Prompt",
    "toast.body": "Complete the browser verification first.",
    "toast.actions.dismiss": "Dismiss",
    "toast.actions.openSettings": "Open settings",
  } as Record<string, string>,
  trackStartedMock: vi.fn(),
  recordDismissedMock: vi.fn(),
  recordSettingsVisitedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

vi.mock("~/services/productAnalytics/shieldBypassSummary", () => ({
  recordShieldBypassPromptDismissed: recordDismissedMock,
  recordShieldBypassSettingsVisited: recordSettingsVisitedMock,
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => translationMap[key] ?? key,
    }),
  }
})

describe("ShieldBypassPromptToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
    translationMap.titlePrefix = "Shield Mode"
    translationMap["toast.title"] = "Shield Prompt"
    translationMap["toast.body"] = "Complete the browser verification first."
    translationMap["toast.actions.dismiss"] = "Dismiss"
    translationMap["toast.actions.openSettings"] = "Open settings"
  })

  it("prefixes and keeps the document title in sync with host-page updates, then restores the base title on cleanup", async () => {
    document.title = "Original Title"

    const { unmount } = render(
      <ShieldBypassPromptToast onDismiss={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    await waitFor(() => {
      expect(document.title).toBe("Shield Mode · Original Title")
    })

    document.title = "Host Changed Title"

    await waitFor(() => {
      expect(document.title).toBe("Shield Mode · Host Changed Title")
    })

    unmount()

    expect(document.title).toBe("Host Changed Title")
  })

  it("yields the document title after two corrections when the host keeps restoring its title", async () => {
    document.title = "Host Owned Title"

    const titleElement = document.querySelector("title")
    expect(titleElement).not.toBeNull()

    let hostRestoreCount = 0
    const hostObserver = new MutationObserver(() => {
      if (document.title.startsWith("Shield Mode") && hostRestoreCount < 5) {
        hostRestoreCount += 1
        document.title = "Host Owned Title"
      }
    })
    hostObserver.observe(titleElement!, { childList: true, subtree: true })

    try {
      const { unmount } = render(
        <ShieldBypassPromptToast
          onDismiss={vi.fn()}
          onOpenSettings={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(hostRestoreCount).toBeGreaterThan(0)
      })

      await new Promise((resolve) => window.setTimeout(resolve, 0))

      expect(hostRestoreCount).toBe(3)
      expect(document.title).toBe("Host Owned Title")

      hostObserver.disconnect()
      await new Promise((resolve) => window.setTimeout(resolve, 1100))

      expect(document.title).toBe("Host Owned Title")
      expect(screen.getByText("Shield Prompt")).toBeVisible()
      expect(
        screen.getByRole("button", { name: "Open settings" }),
      ).toBeEnabled()

      unmount()

      expect(document.title).toBe("Host Owned Title")
    } finally {
      hostObserver.disconnect()
    }
  })

  it("normalizes an already-prefixed title and wires the dismiss/settings actions", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    const onOpenSettings = vi.fn()

    document.title = "Shield Mode Existing Title"

    const { unmount } = render(
      <ShieldBypassPromptToast
        onDismiss={onDismiss}
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(await screen.findByText("Shield Prompt")).toBeInTheDocument()
    expect(
      screen.getByText("Complete the browser verification first."),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(document.title).toBe("Shield Mode · Existing Title")
    })

    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    await user.click(screen.getByRole("button", { name: "Open settings" }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(recordDismissedMock).toHaveBeenCalledTimes(1)
    expect(recordSettingsVisitedMock).toHaveBeenCalledTimes(1)
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShieldBypassPromptDismissed,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentShieldBypassPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShieldBypassSettingsVisited,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentShieldBypassPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })

    unmount()

    expect(document.title).toBe("Existing Title")
  })

  it("uses the prefix alone when the page starts without a title and restores the empty title on cleanup", async () => {
    document.title = ""

    const { unmount } = render(
      <ShieldBypassPromptToast onDismiss={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    await waitFor(() => {
      expect(document.title).toBe("Shield Mode")
    })

    unmount()

    expect(document.title).toBe("")
  })

  it("does not modify the document title when the translated prefix is blank", async () => {
    translationMap.titlePrefix = "   "
    document.title = "Unchanged Title"

    const { unmount } = render(
      <ShieldBypassPromptToast onDismiss={vi.fn()} onOpenSettings={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.getByText("Shield Prompt")).toBeInTheDocument()
    })
    expect(document.title).toBe("Unchanged Title")

    unmount()

    expect(document.title).toBe("Unchanged Title")
  })
})
