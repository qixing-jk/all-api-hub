import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"

describe("usePreferenceDraft", () => {
  it("advances the expected save version when a dirty draft receives a newer saved snapshot", () => {
    const initialSavedValue = {
      baseUrl: "https://old.example.invalid",
      adminToken: "old-token",
    }
    const { result, rerender } = renderHook(
      ({
        savedValue,
        savedVersion,
      }: {
        savedValue: typeof initialSavedValue
        savedVersion: number
      }) =>
        usePreferenceDraft({
          savedValue,
          savedVersion,
        }),
      {
        initialProps: {
          savedValue: initialSavedValue,
          savedVersion: 1,
        },
      },
    )

    act(() => {
      result.current.setDraft({
        baseUrl: "https://next.example.invalid",
        adminToken: "next-token",
      })
    })

    expect(result.current.expectedLastUpdated).toBe(1)

    rerender({
      savedValue: {
        baseUrl: "https://next.example.invalid",
        adminToken: "old-token",
      },
      savedVersion: 2,
    })

    expect(result.current.draft).toEqual({
      baseUrl: "https://next.example.invalid",
      adminToken: "next-token",
    })
    expect(result.current.isDirty).toBe(true)
    expect(result.current.expectedLastUpdated).toBe(2)
  })

  it("keeps the original save version when a newer saved snapshot conflicts with the dirty draft", () => {
    const initialSavedValue = {
      baseUrl: "https://old.example.invalid",
      adminToken: "old-token",
    }
    const { result, rerender } = renderHook(
      ({
        savedValue,
        savedVersion,
      }: {
        savedValue: typeof initialSavedValue
        savedVersion: number
      }) =>
        usePreferenceDraft({
          savedValue,
          savedVersion,
        }),
      {
        initialProps: {
          savedValue: initialSavedValue,
          savedVersion: 1,
        },
      },
    )

    act(() => {
      result.current.setDraft({
        baseUrl: "https://local.example.invalid",
        adminToken: "old-token",
      })
    })

    rerender({
      savedValue: {
        baseUrl: "https://remote.example.invalid",
        adminToken: "old-token",
      },
      savedVersion: 2,
    })

    expect(result.current.draft).toEqual({
      baseUrl: "https://local.example.invalid",
      adminToken: "old-token",
    })
    expect(result.current.isDirty).toBe(true)
    expect(result.current.expectedLastUpdated).toBe(1)
  })
})
