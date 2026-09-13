import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  LinkedChannelCleanupOption,
  LinkedChannelCleanupPending,
} from "~/features/KeyManagement/components/LinkedChannelCleanup"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  pending: vi.fn(),
  run: vi.fn(),
  watch: vi.fn(),
  unwatch: vi.fn(),
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    watch = mocks.watch
    unwatch = mocks.unwatch
  },
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getManagedSiteCapabilities: () => ({ config: { get: mocks.config } }),
}))
vi.mock("~/services/managedSites/runtimeConfig", () => ({
  getCurrentManagedSiteType: async () => "new-api",
}))
vi.mock("~/services/managedSites/linkedChannelCleanup", () => ({
  getPendingLinkedChannelCleanupTasks: mocks.pending,
  runLinkedChannelCleanup: mocks.run,
}))

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.config.mockResolvedValue({})
  mocks.pending.mockResolvedValue([])
})

describe("linked cleanup controls", () => {
  it("lets users deselect the available cleanup option", async () => {
    function Option() {
      const [checked, setChecked] = useState(false)
      return (
        <LinkedChannelCleanupOption
          checked={checked}
          onCheckedChange={setChecked}
        />
      )
    }
    render(<Option />)
    const checkbox = await screen.findByRole("checkbox")
    expect(checkbox).toBeChecked()
    await userEvent.setup().click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it("hides cleanup when configuration cannot be loaded", async () => {
    mocks.config.mockRejectedValue(new Error("unavailable"))
    const change = vi.fn()
    render(<LinkedChannelCleanupOption checked onCheckedChange={change} />)
    await waitFor(() => expect(change).toHaveBeenCalledWith(false))
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("hides active retries and restores only unfinished work after an error", async () => {
    const task = {
      id: "pending",
      siteType: "new-api",
      targets: [{ name: "Pending channel", ref: { resourceId: "1" } }],
    }
    mocks.pending.mockResolvedValue([task])
    let reject!: (reason: Error) => void
    mocks.run.mockImplementation(
      () =>
        new Promise((_resolve, rejectRun) => {
          reject = rejectRun
        }),
    )
    const { unmount } = render(<LinkedChannelCleanupPending />)
    const button = await screen.findByRole("button")
    expect(screen.getByText(/Pending channel/)).toBeInTheDocument()
    await userEvent.setup().click(button)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    await act(async () => reject(new Error("offline")))
    await screen.findByRole("button")
    expect(mocks.run).toHaveBeenCalledWith(task)
    mocks.run.mockResolvedValue(undefined)
    mocks.pending.mockResolvedValue([])
    await userEvent.setup().click(screen.getByRole("button"))
    await waitFor(() =>
      expect(screen.queryByText(/Pending channel/)).not.toBeInTheDocument(),
    )
    unmount()
    expect(mocks.unwatch).toHaveBeenCalledOnce()
  })
})
