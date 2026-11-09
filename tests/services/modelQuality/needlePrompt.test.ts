import { expect, it, vi } from "vitest"

import { createContextTokens } from "~/services/verification/modelQuality/contextTokens"
import { prepareNeedlePrompt } from "~/services/verification/modelQuality/needlePrompt"

it("rejects a length that cannot fit the retrieval instruction and notes", async () => {
  const counter = await createContextTokens({ state: "unmatched" })
  await expect(
    prepareNeedlePrompt(counter, 100, 50, 123, new AbortController().signal),
  ).rejects.toThrow("Input length is too small")
})

it("rejects input when the final tokenizer count exceeds the approved budget", async () => {
  const counter = await createContextTokens({ state: "unmatched" })
  vi.spyOn(counter, "countAsync").mockResolvedValueOnce(1025)
  await expect(
    prepareNeedlePrompt(counter, 1024, 50, 123, new AbortController().signal),
  ).rejects.toThrow("Generated input exceeds its token plan")
})

it("does not return prepared input after cancellation", async () => {
  const counter = await createContextTokens({ state: "unmatched" })
  const controller = new AbortController()
  controller.abort()
  await expect(
    prepareNeedlePrompt(counter, 1024, 50, 123, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
})
