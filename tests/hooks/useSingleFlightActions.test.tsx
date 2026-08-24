import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useSingleFlightActions } from "~/hooks/useSingleFlightActions"

describe("useSingleFlightActions", () => {
  it("deduplicates each action key without blocking independent actions", async () => {
    let resolveFirst: ((value: string) => void) | undefined
    let resolveSecond: ((value: string) => void) | undefined
    const firstAction = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve
        }),
    )
    const secondAction = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSecond = resolve
        }),
    )
    const { result } = renderHook(() =>
      useSingleFlightActions<"first" | "second">(),
    )

    let firstRun!: Promise<string>
    let duplicateFirstRun!: Promise<string>
    let secondRun!: Promise<string>
    act(() => {
      firstRun = result.current.run("first", firstAction)
      duplicateFirstRun = result.current.run("first", firstAction)
      secondRun = result.current.run("second", secondAction)
    })

    expect(firstRun).toBe(duplicateFirstRun)
    expect(firstAction).toHaveBeenCalledOnce()
    expect(secondAction).toHaveBeenCalledOnce()
    expect(result.current.isPending("first")).toBe(true)
    expect(result.current.isPending("second")).toBe(true)

    await act(async () => {
      resolveFirst?.("first result")
      await firstRun
    })

    expect(result.current.isPending("first")).toBe(false)
    expect(result.current.isPending("second")).toBe(true)

    await act(async () => {
      resolveSecond?.("second result")
      await secondRun
    })
  })
})
