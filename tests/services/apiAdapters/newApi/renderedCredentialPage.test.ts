import { expect, it, vi } from "vitest"

import { inspectRenderedCredentialPage } from "~/services/apiAdapters/newApi/variantOperations/renderedCredentialPage"

const execute = vi.hoisted(() => vi.fn())
vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeProtectionBypassTask: execute,
}))
it("keeps a rejected rendered observation inconclusive", async () => {
  execute.mockRejectedValueOnce(new Error("closed"))
  await expect(
    inspectRenderedCredentialPage("https://example.test/profile", {
      version: 2,
      kind: "user_command",
      command: "detect_account",
      surface: "options",
    }),
  ).resolves.toBe("unknown")
})

it.each([
  [{ success: true, state: "credential" }, "credential"],
  [{ success: true, state: "not_found" }, "not_found"],
  [{ success: true, state: "unexpected" }, "unknown"],
  [{ success: false, state: "credential" }, "unknown"],
  [undefined, "unknown"],
])("normalizes rendered observation %j to %s", async (result, expected) => {
  execute.mockResolvedValueOnce(result)
  await expect(
    inspectRenderedCredentialPage("https://example.test/profile", {
      version: 2,
      kind: "user_command",
      command: "detect_account",
      surface: "options",
    }),
  ).resolves.toBe(expected)
})
