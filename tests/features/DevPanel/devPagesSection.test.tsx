import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import { useDevPagesSection } from "~/features/DevPanel/sections/miscSections"
import { navigateWithinOptionsPage } from "~/utils/navigation"
import { renderDevPanelSection } from "~~/tests/test-utils/devPanelSection"

const { navigateWithinOptionsPageMock } = vi.hoisted(() => ({
  navigateWithinOptionsPageMock: vi.fn(),
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    navigateWithinOptionsPage: navigateWithinOptionsPageMock,
  }
})

describe("dev pages section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(navigateWithinOptionsPage).mockResolvedValue(undefined)
  })

  it("navigates to the mesh gradient lab route", async () => {
    renderDevPanelSection(useDevPagesSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Open Mesh Gradient Lab" }),
    )

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        `#${DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB}`,
      )
    })
  })

  it("navigates to the unified API guidance preview route", async () => {
    renderDevPanelSection(useDevPagesSection)

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Unified API Guidance preview",
      }),
    )

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        `#${DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW}`,
      )
    })
  })
})
