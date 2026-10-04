import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"

vi.mock("~/entrypoints/options/pages/BrowserApiLab", () => ({
  default: () => <div>Browser API Lab route</div>,
}))
vi.mock("~/entrypoints/options/pages/BasicSettings", () => ({
  default: () => <div>Settings</div>,
}))
vi.mock("~/utils/core/devMode", () => ({ isDevUnlocked: () => true }))

describe("unlocked Browser API Lab route", () => {
  it("mounts the lazy lab page from the developer menu", async () => {
    const { menuItems } = await import("~/entrypoints/options/constants")
    const Lab = menuItems.find(
      (item) => item.id === DEV_MENU_ITEM_IDS.BROWSER_API_LAB,
    )!.component
    render(<Lab />)
    expect(await screen.findByText("Browser API Lab route")).toBeVisible()
  })
})
