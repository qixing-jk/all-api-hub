import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { useVerificationConcurrency } from "~/hooks/verification/useVerificationConcurrency"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { VERIFICATION_CONCURRENCY_KINDS } from "~/services/verification/concurrency"

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
