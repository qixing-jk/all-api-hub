import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import { useDevPagesSection } from "~/features/DevPanel/sections/miscSections"
import { navigateWithinOptionsPage } from "~/utils/navigation"
import { render } from "~~/tests/test-utils/render"

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

function SectionHarness() {
  const section = useDevPagesSection()

  return (
    <div>
      {section.actions.map((action) => (
        <button key={action.id} type="button" onClick={() => void action.run()}>
          {action.label}
        </button>
      ))}
    </div>
  )
}

const RENDER_OPTIONS = {
  withReleaseUpdateStatusProvider: false,
  withUserPreferencesProvider: false,
  withThemeProvider: false,
} as const

describe("dev pages section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(navigateWithinOptionsPage).mockResolvedValue(undefined)
  })

  it("navigates to the mesh gradient lab route", async () => {
    render(<SectionHarness />, RENDER_OPTIONS)

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
    render(<SectionHarness />, RENDER_OPTIONS)

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
