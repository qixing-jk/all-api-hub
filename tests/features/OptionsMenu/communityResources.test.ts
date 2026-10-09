import { afterEach, describe, expect, it, vi } from "vitest"

import { loadCommunityResources } from "~/features/OptionsMenu/communityResources"
import publishedCatalog from "~~/public/community-resources.v1.json"

/** Exercises the untrusted remote boundary using real response decoding and validation. */
function loadPayload(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
  )
  return loadCommunityResources(new AbortController().signal)
}

describe("community resources", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the maintained publication and preserves channel order", async () => {
    expect(await loadPayload(publishedCatalog)).toEqual(
      publishedCatalog.channels,
    )
  })

  it("accepts a remote QR image without expiration metadata and an empty directory", async () => {
    const channels = [
      {
        id: "wechat",
        qrCode: { url: "https://example.com/contact.png" },
      },
    ]
    expect(await loadPayload({ schemaVersion: 1, channels })).toEqual(channels)
    expect(await loadPayload({ schemaVersion: 1, channels: [] })).toEqual([])
  })

  it("preserves the optional group expiry with its explicit timezone", async () => {
    const channels = [
      {
        id: "wechat",
        qrCode: {
          url: "https://example.com/qr.png",
          expiresAt: "2026-10-15T00:00:00+08:00",
        },
      },
    ]
    expect(await loadPayload({ schemaVersion: 1, channels })).toEqual(channels)
  })

  it.each([
    "not-a-date",
    "2026-10-15",
    "2026-10-15T00:00:00",
    "2026-02-30T00:00:00Z",
  ])("rejects an ambiguous or invalid expiry: %s", async (expiresAt) => {
    await expect(
      loadPayload({
        schemaVersion: 1,
        channels: [
          {
            id: "wechat",
            qrCode: { url: "https://example.com/qr.png", expiresAt },
          },
        ],
      }),
    ).rejects.toThrow()
  })

  it.each([
    { schemaVersion: 2, channels: [] },
    {
      schemaVersion: 1,
      channels: [{ id: "unknown", url: "https://example.com" }],
    },
    {
      schemaVersion: 1,
      channels: [{ id: "telegram", url: "javascript:alert(1)" }],
    },
    {
      schemaVersion: 1,
      channels: [{ id: "qq", url: "https://user:password@example.com" }],
    },
    {
      schemaVersion: 1,
      channels: [
        {
          id: "wechat",
          qrCode: { url: "http://example.com/qr.png", expiresAt: null },
        },
      ],
    },
    {
      schemaVersion: 1,
      channels: [
        { id: "qq", url: "https://example.com/1" },
        { id: "qq", url: "https://example.com/2" },
      ],
    },
  ])("rejects malformed or unsafe invitation data: %j", async (payload) => {
    await expect(loadPayload(payload)).rejects.toThrow()
  })

  it("rejects unsuccessful HTTP responses and invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    )
    await expect(
      loadCommunityResources(new AbortController().signal),
    ).rejects.toThrow("HTTP 404")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")))
    await expect(
      loadCommunityResources(new AbortController().signal),
    ).rejects.toThrow()
  })
})
