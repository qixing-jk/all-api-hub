import { expect, it, vi } from "vitest"

import { createOpenRouterKeyPagination } from "~/services/apiAdapters/openrouter/keyPagination"
import type { OpenRouterKeyInfo } from "~/services/apiService/openrouter"

const key = (hash: string, workspace = "workspace") =>
  ({ hash, workspace_id: workspace }) as OpenRouterKeyInfo

it("rejects provider keys from another workspace without returning a cursor", async () => {
  const pagination = createOpenRouterKeyPagination()
  await expect(
    pagination.list({ scopeKey: "workspace" }, async () => [
      key("foreign", "other"),
    ]),
  ).rejects.toThrow("key_scope_mismatch")
})

it("bounds provider draining when tiny batches never terminate", async () => {
  const pagination = createOpenRouterKeyPagination()
  const load = vi.fn(async (offset: number) => [key(String(offset))])
  await expect(
    pagination.list({ scopeKey: "workspace", limit: 100 }, load),
  ).rejects.toThrow("key_pagination_limit")
  expect(load).toHaveBeenCalledTimes(100)
})
