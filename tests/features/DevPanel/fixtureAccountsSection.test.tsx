import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useFixtureAccountsDevSection } from "~/features/DevPanel/sections/fixtureAccountsSection"
import toast from "~/lib/notify"
import { renderDevPanelSection } from "~~/tests/test-utils/devPanelSection"

const {
  addDevFixtureAccountsMock,
  clearDevFixtureAccountsMock,
  countDevFixtureAccountsMock,
} = vi.hoisted(() => ({
  addDevFixtureAccountsMock: vi.fn(),
  clearDevFixtureAccountsMock: vi.fn(),
  countDevFixtureAccountsMock: vi.fn(),
}))

vi.mock("~/features/DevPanel/fixtureAccounts", () => ({
  addDevFixtureAccounts: addDevFixtureAccountsMock,
  clearDevFixtureAccounts: clearDevFixtureAccountsMock,
  countDevFixtureAccounts: countDevFixtureAccountsMock,
}))

vi.mock("~/lib/notify", () => {
  const toastMock = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toastMock }
})

describe("fixture accounts dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countDevFixtureAccountsMock.mockResolvedValue(0)
    addDevFixtureAccountsMock.mockResolvedValue(5)
    clearDevFixtureAccountsMock.mockResolvedValue(0)
  })

  it("adds fixtures, reports the count, and refreshes the label", async () => {
    renderDevPanelSection(() => useFixtureAccountsDevSection(true))

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dev: Add 5 fixture accounts",
      }),
    )

    await waitFor(() => {
      expect(addDevFixtureAccountsMock).toHaveBeenCalledWith(5)
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "Dev: added 5 fixture account(s)",
    )
    // The count re-reads so the clear action reflects the new total.
    expect(countDevFixtureAccountsMock).toHaveBeenCalled()
  })

  it("adds a single fixture account", async () => {
    addDevFixtureAccountsMock.mockResolvedValue(1)

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dev: Add 1 fixture account",
      }),
    )

    await waitFor(() => {
      expect(addDevFixtureAccountsMock).toHaveBeenCalledWith(1)
    })
  })

  it("reports the error message when adding fixtures fails", async () => {
    addDevFixtureAccountsMock.mockRejectedValue(new Error("storage full"))

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dev: Add 5 fixture accounts",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Dev: failed to add fixture accounts: storage full",
      )
    })
  })

  it("reports non-Error rejections when adding fixtures fails", async () => {
    addDevFixtureAccountsMock.mockRejectedValue("plain failure")

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dev: Add 5 fixture accounts",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Dev: failed to add fixture accounts: plain failure",
      )
    })
  })

  it("clears fixtures and reports how many were removed", async () => {
    countDevFixtureAccountsMock.mockResolvedValue(3)
    clearDevFixtureAccountsMock.mockResolvedValue(3)

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))

    const clearButton = await screen.findByRole("button", {
      name: /^Dev: Clear fixture accounts/,
    })
    await waitFor(() => expect(clearButton).toBeEnabled())
    fireEvent.click(clearButton)

    await waitFor(() => {
      expect(clearDevFixtureAccountsMock).toHaveBeenCalled()
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      "Dev: removed 3 fixture account(s)",
    )
  })

  it("reports the error message when clearing fixtures fails", async () => {
    countDevFixtureAccountsMock.mockResolvedValue(2)
    clearDevFixtureAccountsMock.mockRejectedValue(new Error("locked"))

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))

    const clearButton = await screen.findByRole("button", {
      name: /^Dev: Clear fixture accounts/,
    })
    await waitFor(() => expect(clearButton).toBeEnabled())
    fireEvent.click(clearButton)

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Dev: failed to clear fixture accounts: locked",
      )
    })
  })

  it("reports non-Error rejections when clearing fixtures fails", async () => {
    countDevFixtureAccountsMock.mockResolvedValue(2)
    clearDevFixtureAccountsMock.mockRejectedValue("plain failure")

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))

    const clearButton = await screen.findByRole("button", {
      name: /^Dev: Clear fixture accounts/,
    })
    await waitFor(() => expect(clearButton).toBeEnabled())
    fireEvent.click(clearButton)

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Dev: failed to clear fixture accounts: plain failure",
      )
    })
  })

  it("disables clearing while no fixtures exist", async () => {
    countDevFixtureAccountsMock.mockResolvedValue(0)

    renderDevPanelSection(() => useFixtureAccountsDevSection(true))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Dev: Clear fixture accounts/ }),
      ).toBeDisabled()
    })
  })
})
