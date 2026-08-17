import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useApiCredentialProfileLinks } from "~/hooks/useApiCredentialProfileLinks"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"

const { listLinks, subscribeToChanges } = vi.hoisted(() => ({
  listLinks: vi.fn(),
  subscribeToChanges: vi.fn(),
}))

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: { list: listLinks },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    subscribeToApiCredentialProfilesChanges: subscribeToChanges,
  }),
)

const link = { id: "association-example" } as ApiCredentialProfileLink

describe("useApiCredentialProfileLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscribeToChanges.mockReturnValue(vi.fn())
  })

  it("distinguishes loading from a loaded empty or populated result", async () => {
    let resolveLinks!: (links: ApiCredentialProfileLink[]) => void
    listLinks.mockReturnValueOnce(
      new Promise<ApiCredentialProfileLink[]>((resolve) => {
        resolveLinks = resolve
      }),
    )

    const { result } = renderHook(() => useApiCredentialProfileLinks())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.links).toEqual([])
    expect(result.current.error).toBeNull()

    await act(async () => resolveLinks([link]))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.links).toEqual([link])
  })

  it("exposes load errors and reloads after profile storage changes", async () => {
    const loadError = new Error("storage unavailable")
    listLinks.mockRejectedValueOnce(loadError).mockResolvedValueOnce([link])

    const { result } = renderHook(() => useApiCredentialProfileLinks())

    await waitFor(() => expect(result.current.error).toBe(loadError))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.links).toEqual([])

    const onStorageChange = subscribeToChanges.mock.calls[0][0]
    await act(async () => onStorageChange())

    await waitFor(() => expect(result.current.links).toEqual([link]))
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it("keeps the last known links when a reload fails", async () => {
    const loadError = new Error("storage unavailable")
    listLinks.mockResolvedValueOnce([link]).mockRejectedValueOnce(loadError)

    const { result } = renderHook(() => useApiCredentialProfileLinks())

    await waitFor(() => expect(result.current.links).toEqual([link]))
    await act(async () => result.current.reload())

    expect(result.current.error).toBe(loadError)
    expect(result.current.links).toEqual([link])
    expect(result.current.isLoading).toBe(false)
  })

  it("ignores an older load that finishes after a newer reload", async () => {
    let resolveInitial!: (links: ApiCredentialProfileLink[]) => void
    listLinks
      .mockReturnValueOnce(
        new Promise<ApiCredentialProfileLink[]>((resolve) => {
          resolveInitial = resolve
        }),
      )
      .mockResolvedValueOnce([link])

    const { result } = renderHook(() => useApiCredentialProfileLinks())
    await act(async () => result.current.reload())
    expect(result.current.links).toEqual([link])

    await act(async () => resolveInitial([]))
    expect(result.current.links).toEqual([link])
    expect(result.current.isLoading).toBe(false)
  })
})
