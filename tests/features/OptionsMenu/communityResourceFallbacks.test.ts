import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  acceptCommunityResourceResponse,
  readCommunityResourceCache,
} from "~/features/OptionsMenu/communityResourceCache"
import { resolveCommunityResources } from "~/features/OptionsMenu/communityResources"
import { loadCommunityWechatImage } from "~/features/OptionsMenu/communityWechatImage"
import bundledCatalog from "~~/public/community-resources.v1.json"
import bundledImage from "~~/resources/wechat_group.png"
import {
  communityImageResponse,
  mockCommunityResourceCache,
} from "~~/tests/test-utils/communityResourceCache"

const signal = () => new AbortController().signal
const channels = [{ id: "telegram", url: "https://t.me/updated" }]
const directoryResponse = () =>
  new Response(JSON.stringify({ schemaVersion: 1, channels }))

describe("community resource fallbacks", () => {
  let cache: ReturnType<typeof mockCommunityResourceCache>
  beforeEach(() => {
    cache = mockCommunityResourceCache()
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close: vi.fn() })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("persists successful invitations, uses them on failure, and accepts a later empty directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => directoryResponse()),
    )
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "remote",
      channels,
    })
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "cached",
      channels,
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 1, channels: [] })),
    )
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "remote",
      channels: [],
    })
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "cached",
      channels: [],
    })
  })

  it("falls back to bundled invitations when both the network and persisted data are unusable", async () => {
    await acceptCommunityResourceResponse(
      "catalog",
      new Response("corrupt"),
      1,
      signal(),
    )
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "bundled",
      channels: bundledCatalog.channels,
    })
  })

  it("keeps valid cached invitations when a remote response has an unsupported schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => directoryResponse()),
    )
    await resolveCommunityResources(signal())
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 2, channels: [] })),
    )
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "cached",
      channels,
    })
  })

  it("does not overwrite unknown cache state after a failed read, but still displays fresh remote data", async () => {
    cache.match.mockRejectedValue(new Error("storage unavailable"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => directoryResponse()),
    )
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "remote",
      channels,
    })
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("still works without Cache Storage and when writes exceed quota", async () => {
    cache.put.mockRejectedValue(new Error("quota"))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => directoryResponse()),
    )
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "remote",
      channels,
    })
    vi.stubGlobal("caches", undefined)
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    expect(await resolveCommunityResources(signal())).toEqual({
      source: "bundled",
      channels: bundledCatalog.channels,
    })
  })

  it("stores the image bytes and can display them after the remote URL changes and goes offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => communityImageResponse()),
    )
    const remote = await loadCommunityWechatImage(
      { url: "https://example.com/qr.png", expiresAt: "2026-10-15T00:00:00Z" },
      signal(),
    )
    expect(remote.source).toBe("remote")
    expect(remote.expiresAt).toBe("2026-10-15T00:00:00Z")
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    const cached = await loadCommunityWechatImage(
      {
        url: "https://example.com/new-qr.png",
        expiresAt: "2026-10-20T00:00:00Z",
      },
      signal(),
    )
    expect(cached.source).toBe("cached")
    expect(cached.expiresAt).toBe("2026-10-15T00:00:00Z")
    if (cached.source === "bundled")
      throw new Error("Expected cached image bytes")
    expect(await cached.blob.text()).toBe("qr-image-bytes")
  })

  it("uses a bundled image on the first offline preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(
      await loadCommunityWechatImage(
        {
          url: "https://example.com/qr.png",
          expiresAt: "2099-01-01T00:00:00Z",
        },
        signal(),
      ),
    ).toEqual({
      source: "bundled",
      url: bundledImage,
      expiresAt: bundledCatalog.channels.find(({ id }) => id === "wechat")
        ?.qrCode?.expiresAt,
    })
  })

  it.each(["http", "mime", "decode", "size"])(
    "does not replace usable image bytes after a remote %s failure",
    async (failure) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => communityImageResponse()),
      )
      await loadCommunityWechatImage(
        { url: "https://example.com/qr.png" },
        signal(),
      )
      if (failure === "http")
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response("missing", { status: 404 }),
        )
      if (failure === "mime")
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response("<html>error</html>"),
        )
      if (failure === "decode")
        vi.mocked(createImageBitmap).mockRejectedValueOnce(
          new Error("invalid image"),
        )
      if (failure === "size")
        vi.mocked(fetch).mockResolvedValueOnce(
          new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
            headers: { "Content-Type": "image/png" },
          }),
        )
      expect(
        (
          await loadCommunityWechatImage(
            { url: "https://example.com/qr.png" },
            signal(),
          )
        ).source,
      ).toBe("cached")
      expect(cache.put).toHaveBeenCalledTimes(1)
    },
  )

  it("falls back to the bundled image if the persisted bytes cannot be decoded", async () => {
    await acceptCommunityResourceResponse(
      "image",
      communityImageResponse(),
      1,
      signal(),
    )
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    vi.mocked(createImageBitmap).mockRejectedValue(new Error("corrupt cache"))
    expect(
      (
        await loadCommunityWechatImage(
          { url: "https://example.com/qr.png" },
          signal(),
        )
      ).source,
    ).toBe("bundled")
  })

  it("times out a stalled image body and does not cache its late response", async () => {
    vi.useFakeTimers()
    let resolveBody!: (blob: Blob) => void
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () =>
          new Promise<Blob>((resolve) => {
            resolveBody = resolve
          }),
      }),
    )
    const pending = loadCommunityWechatImage(
      { url: "https://example.com/qr.png" },
      signal(),
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await pending).source).toBe("bundled")
    resolveBody(new Blob(["late"], { type: "image/png" }))
    await vi.advanceTimersByTimeAsync(0)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("prevents older successful requests and aborted admissions from replacing the newer cache", async () => {
    await acceptCommunityResourceResponse(
      "catalog",
      new Response("new"),
      20,
      signal(),
    )
    await acceptCommunityResourceResponse(
      "catalog",
      new Response("old"),
      10,
      signal(),
    )
    const controller = new AbortController()
    controller.abort()
    await acceptCommunityResourceResponse(
      "catalog",
      new Response("cancelled"),
      30,
      controller.signal,
    )
    expect(await (await readCommunityResourceCache("catalog"))?.text()).toBe(
      "new",
    )
  })
})
