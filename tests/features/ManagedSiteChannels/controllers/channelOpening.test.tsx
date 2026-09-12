import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { createManagedResourceRowMapper } from "~/features/ManagedSiteChannels/controllers/managedResourceRowMapper"
import { useManagedResourceMutationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController"
import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  createManagedResourceEditor,
  createManagedResourceFacts,
  createManagedResourceWorkspace,
} from "~~/tests/test-utils/managedResourceWorkspace"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe("channel opening lifecycle", () => {
  it("clears a provider-cancelled opening and permits another attempt", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi
        .fn()
        .mockRejectedValueOnce(new ManagedResourceError({ code: "aborted" }))
        .mockResolvedValueOnce(editor),
    })
    const mapper = createManagedResourceRowMapper()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )
    await act(async () => {
      await result.current.openCreate()
    })
    expect(result.current.opening.status).toBe("idle")
    expect(result.current.editorFailure).toBeNull()
    await act(async () => {
      await result.current.openCreate()
    })
    expect(result.current.editor).toBe(editor)
  })

  it.each(["create", "edit", "view"] as const)(
    "exposes %s loading, cancels and ignores late completion",
    async (mode) => {
      const gate = deferred<void>()
      let signal: AbortSignal | undefined
      const editor = createManagedResourceEditor()
      const facts = createManagedResourceFacts()
      const workspace = createManagedResourceWorkspace({
        openCreateEditor: vi.fn(async (options) => {
          signal = options?.signal
          await gate.promise
          return editor
        }),
        openEditEditor: vi.fn(async (_ref, options) => {
          signal = options?.signal
          await gate.promise
          return editor
        }),
        get: vi.fn(async (_ref, options) => {
          signal = options?.signal
          await gate.promise
          return facts
        }),
      })
      const mapper = createManagedResourceRowMapper()
      const rowKey = mapper.map(facts).rowKey
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          resolveRef: mapper.resolveRef,
          mapFacts: mapper.map,
        }),
      )
      let pending!: Promise<void>
      act(() => {
        pending =
          mode === "create"
            ? result.current.openCreate()
            : mode === "edit"
              ? result.current.openEdit(rowKey)
              : result.current.openDetail(rowKey)
      })
      expect(result.current.opening).toMatchObject({ status: "loading", mode })
      expect(result.current.editor).toBeNull()
      act(() => {
        if (mode === "view") result.current.closeDetail()
        else result.current.closeEditor()
      })
      expect(signal?.aborted).toBe(true)
      await act(async () => {
        gate.resolve()
        await pending
      })
      expect(result.current.opening.status).toBe("idle")
      expect(result.current.editor).toBeNull()
      expect(result.current.detail).toBeNull()
      expect(result.current.editorFailure).toBeNull()
    },
  )

  it.each(["create", "edit", "view"] as const)(
    "keeps %s failure retryable and opens only after success",
    async (mode) => {
      let failing = true
      const editor = createManagedResourceEditor()
      const facts = createManagedResourceFacts()
      const failIfNeeded = () => {
        if (failing) throw new ManagedResourceError({ code: "unexpected" })
      }
      const workspace = createManagedResourceWorkspace({
        openCreateEditor: vi.fn(async () => {
          failIfNeeded()
          return editor
        }),
        openEditEditor: vi.fn(async () => {
          failIfNeeded()
          return editor
        }),
        get: vi.fn(async () => {
          failIfNeeded()
          return facts
        }),
      })
      const mapper = createManagedResourceRowMapper()
      const rowKey = mapper.map(facts).rowKey
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          resolveRef: mapper.resolveRef,
          mapFacts: mapper.map,
        }),
      )
      await act(async () => {
        await (mode === "create"
          ? result.current.openCreate()
          : mode === "edit"
            ? result.current.openEdit(rowKey)
            : result.current.openDetail(rowKey))
      })
      expect(result.current.opening).toMatchObject({ status: "failure", mode })
      expect(result.current.editor).toBeNull()
      failing = false
      act(() => result.current.retryOpening())
      await waitFor(() => expect(result.current.opening.status).toBe("idle"))
      if (mode === "view") expect(result.current.detail).not.toBeNull()
      else expect(result.current.editor).toBe(editor)
    },
  )
})
