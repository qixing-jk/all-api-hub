import { expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { AccountKeyRepairProgressStore } from "~/services/accounts/accountKeyAutoProvisioning/repairProgressStore"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: vi.fn(),
}))

it("does not persist or notify a skipped update", async () => {
  const storage = new Storage({ area: "local" })
  const persist = vi.spyOn(storage, "set")
  const store = new AccountKeyRepairProgressStore(storage)
  await store.update(() => null)
  expect(persist).not.toHaveBeenCalled()
  expect(sendRuntimeMessage).not.toHaveBeenCalled()
  expect(store.current).toBeNull()
})

it("preserves persisted progress when the UI notification rejects", async () => {
  vi.mocked(sendRuntimeMessage).mockRejectedValue(new Error("no receivers"))
  const store = new AccountKeyRepairProgressStore()
  await store.begin("job", 1).persisted
  expect((await store.read()).jobId).toBe("job")
  await store.update((current) => ({
    ...current,
    totals: { ...current.totals, processedAccounts: 1 },
  }))
  expect((await store.read()).totals.processedAccounts).toBe(1)
})
