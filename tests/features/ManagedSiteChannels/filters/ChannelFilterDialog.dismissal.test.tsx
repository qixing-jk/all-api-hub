import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ChannelFilterDialog from "~/features/ManagedSiteChannels/filters/ChannelFilterDialog"
import {
  fetchChannelFilterSettings,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/filters/channelFilters"
import toast from "~/lib/notify"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/features/ManagedSiteChannels/filters/channelFilters", () => ({
  fetchChannelFilterSettings: vi.fn(),
  saveChannelFilters: vi.fn(),
}))
vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const channel = {
  name: "Excluded channel",
  type: "midjourney",
  resourceRef: createManagedUpstreamResourceRef({
    managedSiteType: "axonhub",
    scopeKey: "https://admin.example.invalid",
    resourceId: "provider/native-id",
  }),
}

describe("channel rule editor dismissal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchChannelFilterSettings).mockResolvedValue({
      filters: [],
      modelSyncExcluded: false,
    })
  })

  it.each(["Escape", "close button"])(
    "discards an unsaved exclusion through %s",
    async (action) => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ChannelFilterDialog channel={channel} open onClose={onClose} />)
      const toggle = await screen.findByRole("switch")
      await waitFor(() => expect(toggle).toBeEnabled())
      await user.click(toggle)
      expect(toggle).toBeChecked()

      if (action === "Escape") await user.keyboard("{Escape}")
      else
        await user.click(
          screen.getByRole("button", { name: "common:actions.close" }),
        )

      expect(onClose).toHaveBeenCalledOnce()
      expect(saveChannelFilters).not.toHaveBeenCalled()
    },
  )

  it("blocks dismissal during saving and allows it again after a failed save", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const saving = createDeferred<void>()
    vi.mocked(saveChannelFilters).mockReturnValueOnce(saving.promise)
    render(<ChannelFilterDialog channel={channel} open onClose={onClose} />)
    const toggle = await screen.findByRole("switch")
    await waitFor(() => expect(toggle).toBeEnabled())
    await user.click(toggle)
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:filters.actions.save",
      }),
    )

    expect(toggle).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.close" }),
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeVisible()

    await act(async () => saving.reject(new Error("write failed")))
    expect(toast.error).toHaveBeenCalled()
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "common:actions.close" }),
    ).toBeVisible()
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })
})
