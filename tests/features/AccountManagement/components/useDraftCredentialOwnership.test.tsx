import { renderHook as renderIsolatedHook } from "@testing-library/react"
import { startTransition, Suspense } from "react"
import { describe, expect, it, vi } from "vitest"

import { useDraftCredentialOwnership } from "~/features/AccountManagement/components/AccountDialog/form/useDraftCredentialOwnership"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

describe("draft credential persistence ownership", () => {
  it("reports failed disposal once and makes lease settlement idempotent", async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error("Logout failed"))
    const onCleanupError = vi.fn()
    const { result } = renderHook(() =>
      useDraftCredentialOwnership({
        isOpen: true,
        snapshotKey: "A",
        invalidSnapshot: () => new Error("Draft changed"),
        onCleanupError,
      }),
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.adopt("A", cleanup))
    const lease = result.current.beginPersistence("A")
    await act(async () => {
      await result.current.discard()
      await lease.settle(false)
      await lease.settle(false)
      await result.current.discard()
    })
    expect(cleanup).toHaveBeenCalledOnce()
    expect(onCleanupError).toHaveBeenCalledOnce()
    expect(() => result.current.beginPersistence("A")).toThrow("Draft changed")
  })
  it("settles a prior save without losing ownership of its replacement", async () => {
    const oldCleanup = vi.fn()
    const nextCleanup = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ snapshotKey }) =>
        useDraftCredentialOwnership({
          isOpen: true,
          snapshotKey,
          invalidSnapshot: () => new Error("Draft changed"),
          onCleanupError: vi.fn(),
        }),
      { initialProps: { snapshotKey: "A" } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.adopt("A", oldCleanup))
    const failed = result.current.beginPersistence("A")
    await failed.settle(false)
    const saved = result.current.beginPersistence("A")
    act(() => result.current.adopt("B", nextCleanup))
    rerender({ snapshotKey: "B" })
    await saved.settle(true)
    await act(async () => {
      await result.current.discard()
    })
    expect(oldCleanup).not.toHaveBeenCalled()
    expect(nextCleanup).toHaveBeenCalledOnce()
  })
  it("rejects a discarded snapshot after another credential is adopted", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ snapshotKey }) =>
        useDraftCredentialOwnership({
          isOpen: true,
          snapshotKey,
          invalidSnapshot: () => new Error("Draft changed"),
          onCleanupError: vi.fn(),
        }),
      { initialProps: { snapshotKey: "A" } },
    )
    await waitFor(() => expect(result.current).toBeTruthy())
    act(() => result.current.adopt("A", cleanup))
    await act(async () => {
      await result.current.discard()
    })
    act(() => result.current.adopt("B", cleanup))
    rerender({ snapshotKey: "B" })
    expect(() => result.current.beginPersistence("B")).not.toThrow()
    rerender({ snapshotKey: "A" })
    expect(() => result.current.beginPersistence("A")).toThrow("Draft changed")
  })
  it("keeps the committed draft eligible while a replacement render is suspended", () => {
    const pending = new Promise<never>(() => {})
    const { result, rerender } = renderIsolatedHook(
      ({ snapshotKey, suspended }) => {
        const ownership = useDraftCredentialOwnership({
          isOpen: true,
          snapshotKey,
          invalidSnapshot: () => new Error("Draft changed"),
          onCleanupError: vi.fn(),
        })
        if (suspended) throw pending
        return ownership
      },
      {
        initialProps: { snapshotKey: "A", suspended: false },
        wrapper: ({ children }) => (
          <Suspense fallback={null}>{children}</Suspense>
        ),
      },
    )
    act(() => {
      startTransition(() => rerender({ snapshotKey: "B", suspended: true }))
    })
    expect(() => result.current.beginPersistence("A")).not.toThrow()
    rerender({ snapshotKey: "B", suspended: false })
    expect(() => result.current.beginPersistence("A")).toThrow("Draft changed")
  })
})
