import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { useApiCheckTags } from "~/features/WebAiApiCheck/content/profiles/useApiCheckTags"
import { sendWebAiApiCheckMessage } from "~/services/verification/webAiApiCheck/messaging"

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (original) => ({
    ...(await original<
      typeof import("~/services/verification/webAiApiCheck/messaging")
    >()),
    sendWebAiApiCheckMessage: vi.fn(),
  }),
)
beforeEach(() => vi.resetAllMocks())
const original = { id: "one", name: "Original", createdAt: 1, updatedAt: 1 }
const other = { ...original, id: "two", name: "Other" }

it("loads, replaces a duplicate creation and renames a tag while retaining other tags", async () => {
  const created = { ...original, name: "Created" }
  const renamed = { ...created, name: "Renamed" }
  vi.mocked(sendWebAiApiCheckMessage)
    .mockResolvedValueOnce({ success: true, tags: [original, other] } as never)
    .mockResolvedValueOnce({ success: true, tag: created } as never)
    .mockResolvedValueOnce({ success: true, tag: renamed } as never)
  const { result } = renderHook(() => useApiCheckTags())
  await act(() => result.current.loadTags())
  expect(result.current.tags).toEqual([original, other])
  await act(async () =>
    expect(await result.current.createTag("Created")).toEqual(created),
  )
  expect(result.current.tags).toEqual([other, created])
  await act(async () =>
    expect(await result.current.renameTag("one", "Renamed")).toEqual(renamed),
  )
  expect(result.current.tags).toEqual([other, renamed])
})

it.each([undefined, "Tag unavailable"])(
  "preserves edit failure messages and the loaded catalogue: %s",
  async (error) => {
    vi.mocked(sendWebAiApiCheckMessage)
      .mockResolvedValueOnce({ success: true, tags: [original] } as never)
      .mockResolvedValue({ success: false, error } as never)
    const { result } = renderHook(() => useApiCheckTags())
    await act(() => result.current.loadTags())
    await act(async () => {
      await expect(result.current.createTag("New")).rejects.toThrow(
        error || "Failed to create tag",
      )
      await expect(result.current.renameTag("one", "New")).rejects.toThrow(
        error || "Failed to rename tag",
      )
    })
    expect(result.current.tags).toEqual([original])
  },
)
