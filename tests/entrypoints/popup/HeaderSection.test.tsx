import { beforeEach, describe, expect, it, vi } from "vitest"

import HeaderSection from "~/src/entrypoints/popup/components/HeaderSection"
import { isExtensionSidePanel } from "~/src/utils/browser"
import { render, screen } from "~/tests/test-utils/render"

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/src/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: vi.fn().mockReturnValue(false),
  }
})

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  }),
}))

const mockedIsExtensionSidePanel = vi.mocked(isExtensionSidePanel)

describe("popup HeaderSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionSidePanel.mockReturnValue(false)
  })

  it("shows open side panel button in popup", async () => {
    render(<HeaderSection />)

    expect(
      await screen.findByRole("button", {
        name: "common:actions.openSidePanel",
      }),
    ).toBeInTheDocument()
  })

  it("hides open side panel button inside side panel", async () => {
    mockedIsExtensionSidePanel.mockReturnValue(true)
    render(<HeaderSection />)

    expect(
      screen.queryByRole("button", { name: "common:actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })
})
