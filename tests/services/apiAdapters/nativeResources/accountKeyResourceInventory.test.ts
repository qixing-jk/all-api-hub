import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountKeyResourceCollection,
  AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  awaitAbortableAccountKeyResourceOperation,
  collectAccountKeyResourceInventory,
} from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"

const createFacts = (resourceId: string): AccountKeyResourceFacts => ({
  ref: {
    accountId: "account-example",
    siteType: SITE_TYPES.OPENROUTER,
    scopeKey: "scope-example",
    resourceId,
  },
  displayName: `Key ${resourceId}`,
  maskedLabel: "sk-example...masked",
  status: "enabled",
  fields: [],
  actions: { canUpdate: true, canDelete: true },
})

describe("collectAccountKeyResourceInventory", () => {
  it("preserves synchronous provider failures while an abort signal is active", async () => {
    const controller = new AbortController()
    const failure = new Error("provider initialization failed")

    await expect(
      awaitAbortableAccountKeyResourceOperation(() => {
        throw failure
      }, controller.signal),
    ).rejects.toBe(failure)
  })

  it("does not start listing when the request is already aborted", async () => {
    const controller = new AbortController()
    const list = vi.fn()
    const collection = { list } as unknown as AccountKeyResourceCollection
    controller.abort()

    await expect(
      collectAccountKeyResourceInventory(collection, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      failure: { code: "aborted" },
    })
    expect(list).not.toHaveBeenCalled()
  })

  it("collects cursor-paginated native key resources", async () => {
    const first = createFacts("first")
    const second = createFacts("second")
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextCursor: "next-page" })
      .mockResolvedValueOnce({ items: [second] })
    const collection = { list } as unknown as AccountKeyResourceCollection

    await expect(
      collectAccountKeyResourceInventory(collection),
    ).resolves.toEqual([first, second])
    expect(list).toHaveBeenNthCalledWith(
      2,
      { cursor: "next-page" },
      { signal: undefined },
    )
  })

  it("rejects repeated provider references across pages", async () => {
    const duplicate = createFacts("duplicate")
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [duplicate], nextCursor: "next-page" })
      .mockResolvedValueOnce({ items: [duplicate] })
    const collection = { list } as unknown as AccountKeyResourceCollection

    await expect(
      collectAccountKeyResourceInventory(collection),
    ).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
  })
})
