import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCommunityResources } from "~/features/OptionsMenu/useCommunityResources"
import bundledCatalog from "~~/public/community-resources.v1.json"
import { mockCommunityResourceCache } from "~~/tests/test-utils/communityResourceCache"

describe("useCommunityResources", () => {
  beforeEach(() => mockCommunityResourceCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("abandons a hanging request after the deadline and ignores its late response", async () => {
    vi.useFakeTimers()
    let resolveRequest!: (value: Response) => void
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        requestSignal = options.signal
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve
        })
      }),
    )
    const { result } = renderHook(() => useCommunityResources(true))
    expect(result.current.status).toBe("loading")
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(requestSignal?.aborted).toBe(true)
    expect(result.current).toEqual({
      status: "ready",
      source: "bundled",
      channels: bundledCatalog.channels,
    })
    await act(async () =>
      resolveRequest(
        new Response(JSON.stringify({ schemaVersion: 1, channels: [] })),
      ),
    )
    expect(result.current).toEqual({
      status: "ready",
      source: "bundled",
      channels: bundledCatalog.channels,
    })
  })

  it("aborts when disabled and prevents an older request from replacing the current directory", async () => {
    let resolveOld!: (value: Response) => void
    let oldSignal: AbortSignal | undefined
    const channels = [{ id: "qq", url: "https://example.com/new" }]
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce((_url, options) => {
          oldSignal = options.signal
          return new Promise<Response>((resolve) => {
            resolveOld = resolve
          })
        })
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ schemaVersion: 1, channels })),
        ),
    )
    const { result, rerender } = renderHook(
      ({ enabled }) => useCommunityResources(enabled),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(oldSignal).toBeDefined())
    rerender({ enabled: false })
    expect(oldSignal?.aborted).toBe(true)
    rerender({ enabled: true })
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        channels,
        source: "remote",
      }),
    )
    await act(async () =>
      resolveOld(
        new Response(JSON.stringify({ schemaVersion: 1, channels: [] })),
      ),
    )
    expect(result.current).toEqual({
      status: "ready",
      channels,
      source: "remote",
    })
  })

  it("shares a pending preload across opens and closes, then aborts when unmounted", async () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        requestSignal = options.signal
        return new Promise<Response>(() => {})
      }),
    )
    const { rerender, unmount } = renderHook(
      ({ open }) => useCommunityResources(true, open),
      { initialProps: { open: false } },
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    rerender({ open: true })
    rerender({ open: false })
    rerender({ open: true })
    expect(fetch).toHaveBeenCalledOnce()
    expect(requestSignal?.aborted).toBe(false)
    unmount()
    expect(requestSignal?.aborted).toBe(true)
  })

  it("keeps the preloaded directory usable while refreshing on open", async () => {
    const channels = [{ id: "qq", url: "https://example.com/current" }]
    let finishRefresh!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ schemaVersion: 1, channels })),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishRefresh = resolve
            }),
        ),
    )
    const { result, rerender } = renderHook(
      ({ open }) => useCommunityResources(true, open),
      { initialProps: { open: false } },
    )
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        source: "remote",
        channels,
      }),
    )
    rerender({ open: true })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(result.current).toEqual({
      status: "ready",
      source: "remote",
      channels,
    })
    await act(async () =>
      finishRefresh(
        new Response(JSON.stringify({ schemaVersion: 1, channels: [] })),
      ),
    )
    expect(result.current).toEqual({
      status: "ready",
      source: "remote",
      channels: [],
    })
  })
})
