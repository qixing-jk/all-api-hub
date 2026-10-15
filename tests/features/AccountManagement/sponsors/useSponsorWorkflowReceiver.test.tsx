import { renderHook, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import { useSponsorWorkflowReceiver } from "~/features/AccountManagement/sponsors/useSponsorWorkflowReceiver"
import { UI_HANDOFF_RECEIVE_RESULTS } from "~/hooks/useUiHandoffReceiver"
import { stageSponsorWorkflow } from "~~/tests/test-utils/sponsorWorkflow"

describe("sponsor workflow receiver", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 7, windowId: 2 } as browser.tabs.Tab,
    ])
  })

  afterEach(() => vi.restoreAllMocks())

  it("receives a handoff staged before the panel mounts exactly once", async () => {
    const intent = {
      kind: SPONSOR_WORKFLOW_KINDS.Bookmark,
      prefill: { name: "Sponsor", url: "https://sponsor.example/" },
    }
    await stageSponsorWorkflow(intent)
    const receive = vi.fn(() => UI_HANDOFF_RECEIVE_RESULTS.Accepted)
    const { rerender } = renderHook(
      () => useSponsorWorkflowReceiver(true, receive),
      { wrapper: StrictMode },
    )
    await waitFor(() => expect(receive).toHaveBeenCalledWith(intent))
    rerender()
    expect(receive).toHaveBeenCalledOnce()
  })

  it("receives a handoff in an already mounted panel", async () => {
    const receive = vi.fn(() => UI_HANDOFF_RECEIVE_RESULTS.Accepted)
    renderHook(() => useSponsorWorkflowReceiver(true, receive))
    const intent = {
      kind: SPONSOR_WORKFLOW_KINDS.ApiCredential,
      prefill: { name: "Sponsor", baseUrl: "https://sponsor.example/v1" },
    }
    await stageSponsorWorkflow(intent)
    await waitFor(() => expect(receive).toHaveBeenCalledWith(intent))
    expect(receive).toHaveBeenCalledOnce()
  })
})
