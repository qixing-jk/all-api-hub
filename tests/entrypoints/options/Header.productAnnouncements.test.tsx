import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import Header from "~/entrypoints/options/components/Header"
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}))

vi.mock("~/entrypoints/options/components/HeaderThemeSwitcher", () => ({
  default: () => <div data-testid="theme-switcher" />,
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

describe("options Header product announcements", () => {
  it("renders the product announcement button in the header utility group", () => {
    render(
      <Header
        onSearchOpen={vi.fn()}
        onTitleClick={vi.fn()}
        onMenuToggle={vi.fn()}
        isMobileSidebarOpen={false}
      />,
      { withReleaseUpdateStatusProvider: false },
    )

    expect(screen.getByTestId("product-announcement-button")).toHaveAttribute(
      "data-surface",
      "options-header",
    )
    expect(ProductAnnouncementButton).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "options-header" }),
      undefined,
    )
  })
})
