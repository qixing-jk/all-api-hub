import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { loadCommunityWechatImage } from "~/features/OptionsMenu/communityWechatImage"
import { useCommunityWechatImage } from "~/features/OptionsMenu/useCommunityWechatImage"
import { mockCommunityImageBrowserApis } from "~~/tests/test-utils/communityResourceCache"

vi.mock("~/features/OptionsMenu/communityWechatImage", () => ({
  loadCommunityWechatImage: vi.fn(),
}))

type LoadedImage = Awaited<ReturnType<typeof loadCommunityWechatImage>>

describe("useCommunityWechatImage", () => {
  beforeEach(() => {
    vi.mocked(loadCommunityWechatImage).mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reports an unavailable image when the browser cannot create its object URL", async () => {
    const { createObjectURL, revokeObjectURL } = mockCommunityImageBrowserApis()
    createObjectURL.mockImplementation(() => {
      throw new Error("Object URL allocation failed")
    })
    let finish!: (image: LoadedImage) => void
    vi.mocked(loadCommunityWechatImage).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    )
    const { result, unmount } = renderHook(() =>
      useCommunityWechatImage({ url: "https://example.com/qr.png" }),
    )

    await act(async () =>
      finish({
        source: "remote",
        blob: new Blob(["image"], { type: "image/png" }),
      }),
    )

    expect(result.current).toEqual({ status: "error" })
    unmount()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it.each(["resolve", "reject"] as const)(
    "ignores a replaced request that settles late with %s",
    async (outcome) => {
      const { createObjectURL, revokeObjectURL } =
        mockCommunityImageBrowserApis()
      const blob = new Blob(["current-image"], { type: "image/png" })
      let finishOld!: () => void
      let finishCurrent!: (image: LoadedImage) => void
      vi.mocked(loadCommunityWechatImage)
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              finishOld = () =>
                outcome === "resolve"
                  ? resolve({ source: "remote", blob })
                  : reject(new Error("Cancelled image finished late"))
            }),
        )
        .mockImplementationOnce(
          () => new Promise((resolve) => (finishCurrent = resolve)),
        )
      const { result, rerender, unmount } = renderHook(
        ({ url }) => useCommunityWechatImage({ url }),
        { initialProps: { url: "https://example.com/old.png" } },
      )
      const oldSignal = vi.mocked(loadCommunityWechatImage).mock.calls[0]![1]
      rerender({ url: "https://example.com/current.png" })
      expect(oldSignal.aborted).toBe(true)
      await act(async () => finishCurrent({ source: "remote", blob }))
      const currentImage = result.current
      expect(currentImage).toMatchObject({
        status: "ready",
        src: "blob:community-wechat",
      })

      await act(async () => finishOld())

      expect(result.current).toBe(currentImage)
      expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      unmount()
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
        "blob:community-wechat",
      )
    },
  )
})
