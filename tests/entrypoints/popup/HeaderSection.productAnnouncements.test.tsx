import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import HeaderSection from "~/entrypoints/popup/components/HeaderSection"
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
  }
})

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  useReleaseUpdateStatus: () => ({
    status: null,
    isLoading: false,
    isChecking: false,
    error: null,
    refresh: vi.fn(),
    checkNow: vi.fn(),
  }),
}))

vi.mock("~/components/dialogs/UpdateLogDialog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/components/dialogs/UpdateLogDialog")
    >()

  return {
    ...actual,
    useUpdateLogDialogContext: () => ({
      state: { isOpen: false, version: null },
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
    }),
  }
})

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: vi.fn().mockReturnValue(false),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getSidePanelSupport: vi.fn().mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    }),
  }
})

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(() => ({
    complete: vi.fn().mockResolvedValue(undefined),
  })),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock("~/features/ProductAnnouncements/ProductAnnouncementButton", () => ({
  ProductAnnouncementButton: vi.fn(
    ({
      surface,
      onlyWhenRisk,
    }: {
      surface: string
      onlyWhenRisk?: boolean
    }) => (
      <div
        data-testid="product-announcement-button"
        data-surface={surface}
        data-only-when-risk={onlyWhenRisk ? "true" : "false"}
      />
    ),
  ),
}))

describe("popup HeaderSection product announcements", () => {
  it("renders the risk-only product announcement button in the popup header", () => {
    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    expect(screen.getByTestId("product-announcement-button")).toHaveAttribute(
      "data-surface",
      "popup-header",
    )
    expect(screen.getByTestId("product-announcement-button")).toHaveAttribute(
      "data-only-when-risk",
      "true",
    )
    expect(ProductAnnouncementButton).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "popup-header",
        onlyWhenRisk: true,
      }),
      undefined,
    )
  })
})
