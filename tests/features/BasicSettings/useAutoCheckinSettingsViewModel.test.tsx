import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { useAutoCheckinSettingsViewModel } from "~/features/BasicSettings/components/tabs/CheckinRedeem/useAutoCheckinSettingsViewModel"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"

const mocks = vi.hoisted(() => ({
  update: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: {
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin,
        windowStart: "22:00",
        windowEnd: "02:00",
        deterministicTime: "23:00",
      },
    },
    updateAutoCheckin: mocks.update,
    resetAutoCheckinConfig: vi.fn(),
  }),
}))

it("accepts deterministic execution after midnight and rejects a time outside the window", async () => {
  const { result } = renderHook(() => useAutoCheckinSettingsViewModel())
  act(() => result.current.deterministicTimeField.setDraft("01:00"))
  await act(async () => {
    expect((await result.current.deterministicTimeField.commit()).ok).toBe(true)
  })
  expect(mocks.update).toHaveBeenCalledWith({ deterministicTime: "01:00" })
  mocks.update.mockClear()
  act(() => result.current.deterministicTimeField.setDraft("12:00"))
  await act(async () => {
    expect((await result.current.deterministicTimeField.commit()).ok).toBe(
      false,
    )
  })
  expect(mocks.update).not.toHaveBeenCalled()
})
