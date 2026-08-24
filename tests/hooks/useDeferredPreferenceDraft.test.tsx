import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  useDeferredPreferenceDraft,
  type DeferredPreferenceCommitResult,
} from "~/hooks/useDeferredPreferenceDraft"

type TestDraft = {
  first: string
  second: string
}

describe("useDeferredPreferenceDraft", () => {
  it("reuses an in-flight commit and returns its outcome to every caller", async () => {
    let resolveCommit:
      | ((result: DeferredPreferenceCommitResult<TestDraft>) => void)
      | undefined
    const onCommit = vi.fn(
      () =>
        new Promise<DeferredPreferenceCommitResult<TestDraft>>((resolve) => {
          resolveCommit = resolve
        }),
    )
    const { result } = renderHook(() =>
      useDeferredPreferenceDraft<TestDraft>({
        savedValue: { first: "saved", second: "value" },
        savedVersion: 1,
        onCommit,
      }),
    )

    act(() => {
      result.current.setDraft({ first: "draft", second: "value" })
    })

    let firstCommit!: Promise<DeferredPreferenceCommitResult<TestDraft>>
    let secondCommit!: Promise<DeferredPreferenceCommitResult<TestDraft>>
    act(() => {
      firstCommit = result.current.commit()
      secondCommit = result.current.commit()
    })

    expect(firstCommit).toBe(secondCommit)
    expect(onCommit).toHaveBeenCalledOnce()
    expect(result.current.isCommitting).toBe(true)

    await act(async () => {
      resolveCommit?.({
        ok: true,
        value: { first: "canonical", second: "value" },
      })
      await firstCommit
    })

    await expect(secondCommit).resolves.toEqual({
      ok: true,
      value: { first: "canonical", second: "value" },
    })
    expect(result.current.draft).toEqual({
      first: "canonical",
      second: "value",
    })
    expect(result.current.isDirty).toBe(false)
    expect(result.current.isCommitting).toBe(false)
  })
})
