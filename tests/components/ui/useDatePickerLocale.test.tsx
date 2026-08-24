import { act, renderHook, waitFor } from "@testing-library/react"
import type { Locale } from "date-fns"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useDatePickerLocale } from "~/components/ui/useDatePickerLocale"

const { loadDatePickerLocaleMock } = vi.hoisted(() => ({
  loadDatePickerLocaleMock: vi.fn(),
}))

vi.mock("~/components/ui/datePickerLocale", () => ({
  loadDatePickerLocale: (...args: unknown[]) =>
    loadDatePickerLocaleMock(...args),
}))

const ENGLISH_LOCALE = { code: "en-US" } as Locale
const GERMAN_LOCALE = { code: "de" } as Locale

describe("useDatePickerLocale", () => {
  beforeEach(() => {
    loadDatePickerLocaleMock.mockReset()
  })

  it("prefers a controlled locale without loading by language", () => {
    const { result } = renderHook(() =>
      useDatePickerLocale(ENGLISH_LOCALE, "de"),
    )

    expect(result.current).toBe(ENGLISH_LOCALE)
    expect(loadDatePickerLocaleMock).not.toHaveBeenCalled()
  })

  it("loads a locale by language and clears it when the language is removed", async () => {
    loadDatePickerLocaleMock.mockResolvedValue(GERMAN_LOCALE)
    const initialProps: { language: string | undefined } = { language: "de" }
    const { result, rerender } = renderHook(
      ({ language }: { language?: string }) =>
        useDatePickerLocale(undefined, language),
      { initialProps },
    )

    await waitFor(() => expect(result.current).toBe(GERMAN_LOCALE))
    rerender({ language: undefined })
    await waitFor(() => expect(result.current).toBeUndefined())
  })

  it("keeps the English fallback when lazy locale loading fails", async () => {
    loadDatePickerLocaleMock.mockRejectedValue(new Error("import failed"))
    const { result } = renderHook(() => useDatePickerLocale(undefined, "de"))

    await act(async () => {
      await Promise.resolve()
    })
    expect(loadDatePickerLocaleMock).toHaveBeenCalledWith("de")
    expect(result.current).toBeUndefined()
  })
})
