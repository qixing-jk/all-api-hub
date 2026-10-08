import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createDeferred } from "~~/tests/test-utils/deferred"

const {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  subscribe,
  logError,
} = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  subscribe: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("~/services/apiCredentialProfiles/storage/profiles", () => ({
  apiCredentialProfilesStorage: {
    listProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
  },
  subscribeToApiCredentialProfilesChanges: subscribe,
}))
vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ error: logError }),
}))

const oldProfile = { id: "old" } as ApiCredentialProfile
const newProfile = { id: "new" } as ApiCredentialProfile
const input = {
  name: "new",
  apiType: API_TYPES.OPENAI,
  baseUrl: "https://example.com",
  apiKey: "key",
}

describe("useApiCredentialProfiles", () => {
  let notifyChange: () => void
  const unsubscribe = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    subscribe.mockImplementation((callback: () => void) => {
      notifyChange = callback
      return unsubscribe
    })
  })

  it.each(["success", "failure"])(
    "ignores an older %s after a newer list has loaded",
    async (outcome) => {
      const oldLoad = createDeferred<ApiCredentialProfile[]>()
      listProfiles
        .mockReturnValueOnce(oldLoad.promise)
        .mockResolvedValueOnce([newProfile])
      const { result } = renderHook(() => useApiCredentialProfiles())
      await act(async () => result.current.reload())
      await act(async () => {
        if (outcome === "success") oldLoad.resolve([oldProfile])
        else oldLoad.reject(new Error("obsolete read"))
      })
      expect(result.current.profiles).toEqual([newProfile])
      expect(result.current.isLoading).toBe(false)
      expect(logError).not.toHaveBeenCalled()
    },
  )

  it.each(["success", "failure"])(
    "keeps newer loading active when an older %s settles",
    async (outcome) => {
      const oldLoad = createDeferred<ApiCredentialProfile[]>()
      const newLoad = createDeferred<ApiCredentialProfile[]>()
      listProfiles
        .mockReturnValueOnce(oldLoad.promise)
        .mockReturnValueOnce(newLoad.promise)
      const { result } = renderHook(() => useApiCredentialProfiles())
      let loading!: Promise<void>
      act(() => {
        loading = result.current.reload()
      })
      await act(async () => {
        if (outcome === "success") oldLoad.resolve([oldProfile])
        else oldLoad.reject(new Error("obsolete read"))
      })
      expect(result.current.isLoading).toBe(true)
      expect(result.current.profiles).toEqual([])
      await act(async () => {
        newLoad.resolve([newProfile])
        await loading
      })
      expect(result.current.isLoading).toBe(false)
      expect(result.current.profiles).toEqual([newProfile])
    },
  )

  it("retains current failure behavior and permits a storage notification to recover", async () => {
    listProfiles
      .mockRejectedValueOnce(new Error("current read"))
      .mockResolvedValueOnce([newProfile])
    const { result } = renderHook(() => useApiCredentialProfiles())
    await act(async () => {})
    expect(result.current.profiles).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(logError).toHaveBeenCalledOnce()
    await act(async () => notifyChange())
    expect(result.current.profiles).toEqual([newProfile])
  })

  it("accepts the latest reload when mutation completion overlaps storage notifications", async () => {
    const initial = createDeferred<ApiCredentialProfile[]>()
    const notification = createDeferred<ApiCredentialProfile[]>()
    const afterMutation = createDeferred<ApiCredentialProfile[]>()
    const mutation = createDeferred<ApiCredentialProfile>()
    listProfiles
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(notification.promise)
      .mockReturnValueOnce(afterMutation.promise)
    createProfile.mockReturnValueOnce(mutation.promise)
    const { result } = renderHook(() => useApiCredentialProfiles())
    let saving!: Promise<ApiCredentialProfile>
    act(() => {
      saving = result.current.createProfile(input)
      notifyChange()
    })
    await act(async () => mutation.resolve(newProfile))
    expect(listProfiles).toHaveBeenCalledTimes(3)
    await act(async () => {
      afterMutation.resolve([newProfile])
      expect(await saving).toBe(newProfile)
    })
    await act(async () => {
      notification.resolve([oldProfile])
      initial.resolve([])
    })
    expect(result.current.profiles).toEqual([newProfile])
    expect(result.current.isLoading).toBe(false)
  })

  it("invalidates a pending read and stops retained reload callbacks after unmount", async () => {
    const pending = createDeferred<ApiCredentialProfile[]>()
    listProfiles.mockReturnValueOnce(pending.promise)
    const { result, unmount } = renderHook(() => useApiCredentialProfiles())
    const reload = result.current.reload
    unmount()
    await act(async () => {
      pending.reject(new Error("unmounted read"))
      await reload()
      notifyChange()
    })
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(listProfiles).toHaveBeenCalledOnce()
    expect(logError).not.toHaveBeenCalled()
  })

  it.each(["create", "update", "delete"])(
    "returns an admitted %s receipt after unmount without starting a read",
    async (kind) => {
      listProfiles.mockResolvedValueOnce([oldProfile])
      const pending = createDeferred<ApiCredentialProfile | boolean>()
      const storageMutation =
        kind === "create"
          ? createProfile
          : kind === "update"
            ? updateProfile
            : deleteProfile
      storageMutation.mockReturnValueOnce(pending.promise)
      const { result, unmount } = renderHook(() => useApiCredentialProfiles())
      await act(async () => {})
      let mutation!: Promise<ApiCredentialProfile | boolean | null>
      act(() => {
        mutation =
          kind === "create"
            ? result.current.createProfile(input)
            : kind === "update"
              ? result.current.updateProfile(oldProfile.id, input)
              : result.current.deleteProfile(oldProfile.id)
      })
      unmount()
      const receipt = kind === "delete" ? true : newProfile
      await act(async () => {
        pending.resolve(receipt)
        expect(await mutation).toBe(receipt)
      })
      expect(storageMutation).toHaveBeenCalledOnce()
      expect(listProfiles).toHaveBeenCalledOnce()
    },
  )
})
