import { describe, expect, it, vi } from "vitest"

import { verifyManagedSiteTokenBatchTargets } from "~/features/KeyManagement/batchExport/managedSiteTokenBatchVerification"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES } from "~/types/managedSiteTokenBatchExport"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"

vi.mock(
  "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification",
  () => ({
    loadNewApiChannelKeyWithVerification: vi.fn(),
  }),
)

describe("batch channel verification", () => {
  it("continues exactly once when interactive verification completes before the loader returns", async () => {
    const targets = ["first", "second"].map((id) => ({
      item: {
        id,
        accountId: id,
        accountName: id,
        runtimeKeyId: id,
        runtimeKeyName: id,
        draft: null,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
        warningCodes: [],
      },
      candidate: { ref: matchingResourceRef(id), name: id },
    }))
    const load = vi.mocked(loadNewApiChannelKeyWithVerification)
    load
      .mockImplementationOnce(async ({ setKey, onLoaded }) => {
        await setKey("first-key")
        await onLoaded?.()
        return false
      })
      .mockImplementationOnce(async ({ setKey, onLoaded }) => {
        await setKey("second-key")
        await onLoaded?.()
        return true
      })
    const onResolved = vi.fn()
    const onFailure = vi.fn()
    await verifyManagedSiteTokenBatchTargets({
      targets,
      config: {
        baseUrl: "https://managed.example",
        userId: "1",
        username: "admin",
        password: "test-password",
        totpSecret: "",
      },
      isActive: () => true,
      openVerification: vi.fn(),
      onProgress: vi.fn(),
      onResolved,
      onFailure,
    })

    expect(load).toHaveBeenCalledTimes(2)
    expect(onResolved.mock.calls).toEqual([
      [targets[0], "first-key"],
      [targets[1], "second-key"],
    ])
    expect(onFailure.mock.calls.every(([message]) => message === null)).toBe(
      true,
    )
  })
})
