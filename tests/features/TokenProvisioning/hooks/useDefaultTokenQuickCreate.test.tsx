import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useDefaultTokenQuickCreate } from "~/features/TokenProvisioning/hooks/useDefaultTokenQuickCreate"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { buildNewApiKeyCreationResult } from "~~/tests/test-utils/accountKeyFixtures"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"

const { prepare } = vi.hoisted(() => ({ prepare: vi.fn() }))
vi.mock("~/services/accounts/accountKeyCreation", () => ({
  prepareDefaultAccountKeyCreation: prepare,
}))
const account = buildDisplaySiteData({ siteType: "sub2api" })
const created = buildNewApiKeyCreationResult(account, buildNewApiToken())
const requirements = ["first", "second"].map((key) => ({
  requirementKey: key,
  displayName: "Same group",
  provisioning: { kind: "automatic" as const },
}))
const setup = () => {
  const onCreated = vi.fn()
  const onInputRequired = vi.fn()
  const hook = renderHook(
    (owner) =>
      useDefaultTokenQuickCreate({
        isActive: true,
        account: owner,
        canCreate: true,
        onCreated,
        onInputRequired,
      }),
    { initialProps: account },
  )
  return { ...hook, onCreated, onInputRequired }
}

describe("native default key quick creation", () => {
  beforeEach(() => {
    prepare.mockReset()
  })

  it("keeps selection actionable when confirming an unknown requirement", async () => {
    prepare.mockResolvedValue({
      kind: "selection-required",
      requirements,
      create: vi.fn(),
    })
    const { result } = setup()
    await act(async () => result.current.start())
    await act(async () => result.current.confirmGroup("missing"))
    expect(result.current.view.isBusy).toBe(false)
    expect(result.current.view.error).toBeTruthy()
  })

  it("retains opaque group identity through confirmation", async () => {
    const create = vi.fn().mockResolvedValue(created)
    prepare.mockResolvedValue({
      kind: "selection-required",
      requirements,
      create,
    })
    const { result, onCreated } = setup()
    await act(() => result.current.start())
    expect(result.current.view.selection?.requirements).toEqual(requirements)
    await act(() => result.current.confirmGroup("second"))
    expect(create).toHaveBeenCalledExactlyOnceWith("second")
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(created)
  })

  it("aborts the same request context after selection and suppresses a late handoff", async () => {
    const pending = createDeferred<typeof created>()
    let signal: AbortSignal | undefined
    prepare.mockImplementation(async (_account, options) => {
      signal = options.signal
      return {
        kind: "selection-required",
        requirements,
        create: () => pending.promise,
      }
    })
    const { result, onCreated } = setup()
    await act(() => result.current.start())
    let operation!: Promise<void>
    act(() => {
      operation = result.current.confirmGroup("first")
    })
    act(() => result.current.reset())
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      pending.resolve(created)
      await operation
    })
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("shares a rapid repeated start without duplicate mutation", async () => {
    const pending = createDeferred<typeof created>()
    const create = vi.fn(() => pending.promise)
    prepare.mockResolvedValue({ kind: "ready", create })
    const { result } = setup()
    await act(async () => {
      const first = result.current.start()
      const second = result.current.start()
      pending.resolve(created)
      await Promise.all([first, second])
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("retains an uncertain-write lock after reset", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new AccountKeyResourceError({ code: "mutation_state_uncertain" }),
      )
    prepare.mockResolvedValue({ kind: "ready", create })
    const { result } = setup()
    await act(() => result.current.start())
    act(() => result.current.reset())
    await act(() => result.current.start())
    expect(result.current.state.error).toEqual({ kind: "uncertain" })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("opens the native editor when required input is missing", async () => {
    prepare.mockResolvedValue({ kind: "input-required" })
    const { result, onCreated, onInputRequired } = setup()
    await act(() => result.current.start())
    expect(onInputRequired).toHaveBeenCalledTimes(1)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it("drops work after credentials change on the same account", async () => {
    const pending = createDeferred<{
      kind: "ready"
      create: ReturnType<typeof vi.fn>
    }>()
    const create = vi.fn().mockResolvedValue(created)
    prepare.mockReturnValue(pending.promise)
    const { result, rerender, onCreated } = setup()
    let operation!: Promise<void>
    act(() => {
      operation = result.current.start()
    })
    rerender({ ...account, token: "different-login" })
    await act(async () => {
      pending.resolve({ kind: "ready", create })
      await operation
    })
    expect(create).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
