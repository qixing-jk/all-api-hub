import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { createContextTokens } from "~/services/verification/modelQuality/contextTokens"

let createTokens: typeof createContextTokens

beforeEach(async () => {
  vi.resetModules()
  ;({ createContextTokens: createTokens } =
    await import("~/services/verification/modelQuality/contextTokens"))
  vi.spyOn(browser.runtime, "getURL").mockImplementation(
    (asset) => `https://extension.test/${asset}`,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("loads the selected packaged vocabulary when a context test starts", async () => {
  const { default: ranks } = await import("gpt-tokenizer/bpeRanks/cl100k_base")
  const fetchVocabulary = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(ranks)))
  vi.stubGlobal("fetch", fetchVocabulary)
  const tokens = await createTokens({
    state: "resolved",
    match: "exact",
    metadata: { id: "openai/gpt-4", name: "GPT-4", provider_id: "openai" },
  })

  expect(fetchVocabulary).toHaveBeenCalledWith(
    "https://extension.test/tokenizers/cl100k_base.json",
  )
  expect(tokens.countTokens("Hello, world!")).toBe(4)
  expect(tokens.decode([...tokens.encodeGenerator("你好 🌍")].flat())).toBe(
    "你好 🌍",
  )
})

it("uses the packaged o200k vocabulary for an unknown model", async () => {
  const { default: ranks } = await import("gpt-tokenizer/bpeRanks/o200k_base")
  const fetchVocabulary = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(ranks)))
  vi.stubGlobal("fetch", fetchVocabulary)
  const tokens = await createTokens({ state: "unmatched" })
  expect(fetchVocabulary).toHaveBeenCalledWith(
    "https://extension.test/tokenizers/o200k_base.json",
  )
  expect(tokens.info.estimated).toBe(true)
  expect(tokens.countTokens("Hello, world!")).toBe(4)
  expect(tokens.decode([...tokens.encodeGenerator("你好 🌍")].flat())).toBe(
    "你好 🌍",
  )
})

it("shares a vocabulary read between concurrent context tests", async () => {
  const { default: ranks } = await import("gpt-tokenizer/bpeRanks/o200k_base")
  const fetchVocabulary = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(ranks)))
  vi.stubGlobal("fetch", fetchVocabulary)
  const tokens = await Promise.all([
    createTokens({ state: "unmatched" }),
    createTokens({ state: "unmatched" }),
  ])
  expect(fetchVocabulary).toHaveBeenCalledOnce()
  expect(tokens[0]?.countTokens).toBe(tokens[1]?.countTokens)
})

it.each([
  new Response("missing", { status: 404 }),
  new Response("invalid JSON"),
])(
  "allows a later context test to retry a failed vocabulary read %#",
  async (failedResponse) => {
    const { default: ranks } = await import("gpt-tokenizer/bpeRanks/o200k_base")
    const fetchVocabulary = vi
      .fn()
      .mockResolvedValueOnce(failedResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify(ranks)))
    vi.stubGlobal("fetch", fetchVocabulary)
    await expect(createTokens({ state: "unmatched" })).rejects.toThrow()
    const tokens = await createTokens({ state: "unmatched" })
    expect(fetchVocabulary).toHaveBeenCalledTimes(2)
    expect(tokens.countTokens("Hello, world!")).toBe(4)
  },
)
