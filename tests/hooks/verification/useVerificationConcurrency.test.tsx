import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useVerificationConcurrency } from "~/hooks/verification/useVerificationConcurrency"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { VERIFICATION_CONCURRENCY_KINDS } from "~/services/verification/concurrency"
import { createDeferred } from "~~/tests/test-utils/deferred"

afterEach(() => vi.restoreAllMocks())

it("does not overwrite an unread setting and can recover the saved choice", async () => {
  vi.spyOn(userPreferences, "getPreferencesStrict")
    .mockRejectedValueOnce(new Error("storage unavailable"))
    .mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      verificationConcurrency: { routine: 3, needle: 5 },
    })
  const save = vi.spyOn(userPreferences, "updateVerificationConcurrency")
  const { result } = renderHook(() =>
    useVerificationConcurrency(VERIFICATION_CONCURRENCY_KINDS.Routine),
  )
  await waitFor(() => expect(result.current.error).toBe("load"))
  await act(async () => result.current.update(2))
  expect(save).not.toHaveBeenCalled()
  await act(async () => result.current.retry())
  expect(result.current.ready).toBe(true)
  expect(result.current.error).toBeNull()
  expect(result.current.value).toBe(3)
})

it("keeps a failed save usable for this run and retries the same choice", async () => {
  vi.spyOn(userPreferences, "getPreferencesStrict").mockResolvedValue(
    DEFAULT_PREFERENCES,
  )
  const save = vi
    .spyOn(userPreferences, "updateVerificationConcurrency")
    .mockRejectedValueOnce(new Error("storage unavailable"))
    .mockResolvedValue({ ok: true, preferences: DEFAULT_PREFERENCES })
  const { result } = renderHook(() =>
    useVerificationConcurrency(VERIFICATION_CONCURRENCY_KINDS.Needle),
  )
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(async () => result.current.update(4))
  expect(result.current.value).toBe(4)
  expect(result.current.error).toBe("save")
  await act(async () => result.current.retry())
  expect(save).toHaveBeenLastCalledWith({ needle: 4 })
  expect(result.current.error).toBeNull()
})

it("reports a rejected storage result and prevents overlapping writes", async () => {
  vi.spyOn(userPreferences, "getPreferencesStrict").mockResolvedValue(
    DEFAULT_PREFERENCES,
  )
  const pending =
    createDeferred<
      Awaited<ReturnType<typeof userPreferences.updateVerificationConcurrency>>
    >()
  const save = vi
    .spyOn(userPreferences, "updateVerificationConcurrency")
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ ok: true, preferences: DEFAULT_PREFERENCES })
  const { result } = renderHook(() =>
    useVerificationConcurrency(VERIFICATION_CONCURRENCY_KINDS.Routine),
  )
  await waitFor(() => expect(result.current.ready).toBe(true))
  let writing!: Promise<void>
  act(() => {
    writing = result.current.update(3)
  })
  expect(result.current.saving).toBe(true)
  await act(async () => result.current.update(5))
  expect(save).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve({ ok: false, preferences: DEFAULT_PREFERENCES })
    await writing
  })
  expect(result.current.error).toBe("save")
  expect(result.current.value).toBe(3)
  await act(async () => result.current.retry())
  expect(save).toHaveBeenLastCalledWith({ routine: 3 })
  expect(result.current.error).toBeNull()
})

it.each(["resolve", "reject"] as const)(
  "ignores a load that settles after unmount (%s)",
  async (outcome) => {
    const pending = createDeferred<typeof DEFAULT_PREFERENCES>()
    vi.spyOn(userPreferences, "getPreferencesStrict").mockReturnValue(
      pending.promise,
    )
    const { result, unmount } = renderHook(() =>
      useVerificationConcurrency(VERIFICATION_CONCURRENCY_KINDS.Routine),
    )
    const before = result.current
    unmount()
    await act(async () => {
      if (outcome === "resolve") pending.resolve(DEFAULT_PREFERENCES)
      else pending.reject(new Error("late load failure"))
    })
    expect(result.current).toBe(before)
  },
)

it.each(["resolve", "reject"] as const)(
  "ignores a save that settles after unmount (%s)",
  async (outcome) => {
    vi.spyOn(userPreferences, "getPreferencesStrict").mockResolvedValue(
      DEFAULT_PREFERENCES,
    )
    const pending =
      createDeferred<
        Awaited<
          ReturnType<typeof userPreferences.updateVerificationConcurrency>
        >
      >()
    vi.spyOn(userPreferences, "updateVerificationConcurrency").mockReturnValue(
      pending.promise,
    )
    const { result, unmount } = renderHook(() =>
      useVerificationConcurrency(VERIFICATION_CONCURRENCY_KINDS.Needle),
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    let writing!: Promise<void>
    act(() => {
      writing = result.current.update(4)
    })
    const before = result.current
    unmount()
    await act(async () => {
      if (outcome === "resolve")
        pending.resolve({ ok: true, preferences: DEFAULT_PREFERENCES })
      else pending.reject(new Error("late save failure"))
      await writing
    })
    expect(result.current).toBe(before)
  },
)
