import { expect, it, vi } from "vitest"

import { createMagpieRunResources } from "~~/scripts/suites/magpie/native.mjs"

it("recovers a lost create response by exact run name and preserves existing resources", async () => {
  const original = { id: "existing", name: "Shared provider" }
  let items = [original]
  const native = {
    inventory: vi.fn(async () => items),
    remove: vi.fn(async (id: string) => {
      items = items.filter((item) => item.id !== id)
    }),
  }
  const resources = await createMagpieRunResources(native)
  resources.names.add("AAH E2E unique run")
  items = [
    original,
    { id: "new", name: "AAH E2E unique run" },
    { id: "other-run", name: "AAH E2E another run" },
  ]
  await resources.cleanup()
  expect(native.remove).toHaveBeenCalledExactlyOnceWith("new")
  expect(items).toEqual([
    original,
    { id: "other-run", name: "AAH E2E another run" },
  ])
})

it("never deletes a pre-existing ID even if an observed request names it", async () => {
  const native = {
    inventory: vi.fn(async () => [{ id: "existing", name: "shared" }]),
    remove: vi.fn(),
  }
  const resources = await createMagpieRunResources(native)
  resources.ids.add("existing")
  resources.names.add("shared")
  await resources.cleanup()
  expect(native.remove).not.toHaveBeenCalled()
})

it("allows another concurrent run to remove its own baseline resource", async () => {
  let items = [{ id: "other-run", name: "other" }]
  const native = { inventory: vi.fn(async () => items), remove: vi.fn() }
  const resources = await createMagpieRunResources(native)
  items = []
  await expect(resources.cleanup()).resolves.toBeUndefined()
  expect(native.remove).not.toHaveBeenCalled()
})

it("reports failed cleanup after trying every run-owned resource", async () => {
  let items: { id: string; name: string }[] = []
  const native = {
    inventory: vi.fn(async () => items),
    remove: vi.fn(async (id: string) => {
      if (id === "one") throw Error("delete rejected")
      items = items.filter((item) => item.id !== id)
    }),
  }
  const resources = await createMagpieRunResources(native)
  resources.ids.add("one")
  resources.ids.add("two")
  items = [
    { id: "one", name: "one" },
    { id: "two", name: "two" },
  ]
  await expect(resources.cleanup()).rejects.toThrow(/cleanup/i)
  expect(native.remove).toHaveBeenCalledTimes(2)
})
