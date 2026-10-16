import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SPONSOR_WORKFLOW_KINDS } from "~/features/AccountManagement/sponsors/constants"
import {
  sponsorWorkflowChannel,
  type SponsorWorkflowIntent,
} from "~/features/AccountManagement/sponsors/sponsorWorkflowIntent"

describe("sponsor handoff validation", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
  })
  afterEach(() => vi.restoreAllMocks())
  it.each([
    { kind: SPONSOR_WORKFLOW_KINDS.Account, prefill: {} },
    { kind: "invalid", prefill: { name: "Sponsor" } },
    {
      kind: SPONSOR_WORKFLOW_KINDS.Bookmark,
      prefill: { name: "Sponsor", url: "javascript:invalid" },
    },
  ])(
    "rejects invalid workflow payloads before persistence: %j",
    async (intent) => {
      await expect(
        sponsorWorkflowChannel.prepare(intent as SponsorWorkflowIntent, 2),
      ).rejects.toThrow("Invalid UI handoff")
      expect(await browser.storage.session.get(null)).toEqual({})
    },
  )
  it("omits unsafe optional API-key links and malformed hints", async () => {
    const id = await sponsorWorkflowChannel.prepare(
      {
        kind: SPONSOR_WORKFLOW_KINDS.ApiCredential,
        prefill: {
          name: "Sponsor",
          baseUrl: "https://sponsor.example/v1",
          apiKeyCreateUrl: "javascript:invalid",
          apiKeyCreateHint: 42 as unknown as string,
        },
      },
      2,
    )
    const accept = vi.fn(() => true)
    expect(await sponsorWorkflowChannel.receive(id, accept)).toBe(true)
    expect(accept).toHaveBeenCalledExactlyOnceWith({
      kind: SPONSOR_WORKFLOW_KINDS.ApiCredential,
      prefill: { name: "Sponsor", baseUrl: "https://sponsor.example/v1" },
    })
  })
})
