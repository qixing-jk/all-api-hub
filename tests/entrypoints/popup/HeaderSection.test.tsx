import { beforeEach, describe, expect, it, vi } from "vitest"

import { render, screen } from "~/tests/test-utils/render"
import { isExtensionSidePanel } from "~/utils/browser"
import { supportsSidePanel } from "~/utils/browserApi"

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: vi.fn().mockReturnValue(false),
  }
})

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    supportsSidePanel: vi.fn().mockReturnValue(true),
  }
})

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  }),
}))

const mockedIsExtensionSidePanel = vi.mocked(isExtensionSidePanel)
const mockedSupportsSidePanel = vi.mocked(supportsSidePanel)

describe("popup HeaderSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionSidePanel.mockReturnValue(false)
    mockedSupportsSidePanel.mockReturnValue(true)
  })

  it("shows open side panel button in popup", async () => {
    const { default: HeaderSection } = await import(
      "~/entrypoints/popup/components/HeaderSection"
    )
    render(<HeaderSection />)

    expect(
      await screen.findByRole("button", { name: "actions.openSidePanel" }),
    ).toBeInTheDocument()
  })

  it("hides open side panel button inside side panel", async () => {
    mockedIsExtensionSidePanel.mockReturnValue(true)

    const { default: HeaderSection } = await import(
      "~/entrypoints/popup/components/HeaderSection"
    )
    render(<HeaderSection />)

    expect(
      screen.queryByRole("button", { name: "actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })

  it("hides open side panel button when side panel is unsupported", async () => {
    mockedSupportsSidePanel.mockReturnValue(false)

    const { default: HeaderSection } = await import(
      "~/entrypoints/popup/components/HeaderSection"
    )
    render(<HeaderSection />)

    expect(
      screen.queryByRole("button", { name: "actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })
})
