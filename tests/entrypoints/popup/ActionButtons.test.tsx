import { afterEach, describe, expect, it, vi } from "vitest"

import { fireEvent, render, screen } from "~/tests/test-utils/render"

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: vi.fn(),
  }),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("popup ActionButtons", () => {
  it("opens auto check-in page and triggers run when quick check-in button clicked", async () => {
    vi.resetModules()
    const navigation = await import("~/utils/navigation")
    const openAutoCheckinPageSpy = vi
      .spyOn(navigation, "openAutoCheckinPage")
      .mockImplementation(vi.fn() as any)

    const { default: ActionButtons } = await import(
      "~/entrypoints/popup/components/ActionButtons"
    )
    render(<ActionButtons />)

    const quickCheckinButton = await screen.findByRole("button", {
      name: "navigation.autoCheckinRunNow",
    })

    fireEvent.click(quickCheckinButton)

    expect(openAutoCheckinPageSpy).toHaveBeenCalledWith({ runNow: "true" })
  })
})
