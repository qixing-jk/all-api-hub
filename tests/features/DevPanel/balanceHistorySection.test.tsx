import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useBalanceHistoryDevSection } from "~/features/DevPanel/sections/miscSections"
import toast from "~/lib/notify"
import { renderDevPanelSection } from "~~/tests/test-utils/devPanelSection"

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/lib/notify", () => {
  const toastMock = Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
  })
  return { default: toastMock }
})

describe("balance history dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("seeds estimated-income snapshots through the runtime action", async () => {
    sendRuntimeMessageMock.mockResolvedValue({
      success: true,
      data: { seeded: 2, skipped: 1 },
    })

    renderDevPanelSection(useBalanceHistoryDevSection)

    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed estimate snapshots" }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      })
    })
    expect(vi.mocked(toast.success)).toHaveBeenCalled()
  })

  it("reports the backend message when seeding fails", async () => {
    sendRuntimeMessageMock.mockResolvedValue({
      success: false,
      error: "seed unavailable",
    })

    renderDevPanelSection(useBalanceHistoryDevSection)
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed estimate snapshots" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("seed unavailable", {
        id: "toast-id",
      })
    })
  })

  it("reports exception details when seeding throws", async () => {
    sendRuntimeMessageMock.mockRejectedValue(new Error("runtime closed"))

    renderDevPanelSection(useBalanceHistoryDevSection)
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed estimate snapshots" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("runtime closed", {
        id: "toast-id",
      })
    })
  })
  it("falls back to a generic message when the failure omits an error", async () => {
    sendRuntimeMessageMock.mockResolvedValue({ success: false })

    renderDevPanelSection(useBalanceHistoryDevSection)
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed estimate snapshots" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Failed to seed test snapshots",
        { id: "toast-id" },
      )
    })
  })

  it("reports zero counts when a successful seed omits the payload", async () => {
    sendRuntimeMessageMock.mockResolvedValue({ success: true })

    renderDevPanelSection(useBalanceHistoryDevSection)
    fireEvent.click(
      screen.getByRole("button", { name: "Dev: Seed estimate snapshots" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "Seeded 0 account(s), skipped 0. Check Popup stats or Balance History metrics.",
        { id: "toast-id" },
      )
    })
  })
})
