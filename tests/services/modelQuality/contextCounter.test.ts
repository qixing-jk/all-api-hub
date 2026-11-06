import { describe, expect, it } from "vitest"

import { createContextCounter } from "~/services/verification/modelQuality/contextCounter"

describe("context counter", () => {
  it("rejects oversized synthetic input before allocating its repeated text", async () => {
    const counter = await createContextCounter({ state: "unmatched" })
    await expect(
      counter.preparePrompt(1000000000, new AbortController().signal),
    ).rejects.toThrow("32 MiB")
  })
  it("keeps ambiguous model identity as an estimate", async () => {
    const counter = await createContextCounter({ state: "ambiguous" })
    expect(counter.info.estimated).toBe(true)
    expect(counter.info.modelId).toBeUndefined()
  })
  it("selects encoding from resolved metadata identity and preserves declaration", async () => {
    const counter = await createContextCounter({
      state: "resolved",
      match: "exact",
      metadata: {
        id: "openai/gpt-4",
        name: "custom alias",
        provider_id: "openai",
        limits: { context: 8192 },
      },
    })
    expect(counter.info).toMatchObject({
      encoding: "cl100k_base",
      estimated: false,
      declaredContext: 8192,
      modelId: "openai/gpt-4",
    })
    const prepared = await counter.preparePrompt(
      1024,
      new AbortController().signal,
    )
    expect(counter.count(prepared.prompt)).toBeLessThanOrEqual(1024)
    expect(prepared.inputTokens).toBeGreaterThan(1000)
  })
})

it("rejects a target below the fixed wrapper without looping", async () => {
  const counter = await createContextCounter({ state: "unmatched" })
  await expect(
    counter.preparePrompt(1, new AbortController().signal),
  ).rejects.toThrow("prompt wrapper")
})

it("constructs the default million-token fixture within the token target", async () => {
  const counter = await createContextCounter({ state: "unmatched" })
  const { prompt, inputTokens } = await counter.preparePrompt(
    1048576,
    new AbortController().signal,
  )
  expect(inputTokens).toBe(counter.count(prompt))
  expect(counter.count(prompt)).toBeGreaterThan(1048500)
  expect(counter.count(prompt)).toBeLessThanOrEqual(1048576)
})

it("processes cancellation while preparing a long fixture", async () => {
  const counter = await createContextCounter({ state: "unmatched" })
  const controller = new AbortController()
  const cancel = setTimeout(() => controller.abort(), 0)
  try {
    await expect(
      counter.preparePrompt(1048576, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" })
  } finally {
    clearTimeout(cancel)
  }
})
