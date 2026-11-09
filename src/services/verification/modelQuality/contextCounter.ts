import type { ModelIdentityLookupResult } from "~/services/models/modelMetadata/types"
import { CONTEXT_TOKEN_BATCH_SIZE } from "~/services/verification/modelQuality/contextTokenConstants"

import { CONTEXT_CAPACITY_DEFAULTS as defaults } from "./contextCapacityDefaults"
import { createContextTokens } from "./contextTokens"

/** Build the capacity fixture with shared counting and cancellation. */
export async function createContextCounter(
  identity: ModelIdentityLookupResult,
) {
  const api = await createContextTokens(identity)
  const { info } = api
  const prefix = "Read the following reference text.\n"
  const suffix = "\nEnd of reference. Reply with OK only."
  const sentence =
    "The river passes through the valley. Trees grow near the water. "
  const sentenceTokens = api.countTokens(sentence)
  // The generated fixture is ASCII. Bound both repeated source and final prompt
  // before allocating text, including the tokenizer's temporary source buffer.
  const maxInputTokens =
    Math.floor(
      (Math.floor(
        (defaults.maxPromptBytes - prefix.length - suffix.length) /
          sentence.length,
      ) -
        1) /
        2,
    ) * sentenceTokens
  const validateTarget = (target: number) => {
    if (!Number.isSafeInteger(target) || target <= 0 || target > maxInputTokens)
      throw new Error("Test input exceeds the 32 MiB request limit")
    if (target < api.countTokens(prefix + suffix))
      throw new Error("Test input is too small for the prompt wrapper")
  }
  const { countAsync, yieldToCaller } = api
  return {
    info,
    maxInputTokens,
    count: (text: string) => api.countTokens(text),
    /** Yield during long tokenization so UI cancellation can be processed. */
    async preparePrompt(target: number, signal: AbortSignal) {
      validateTarget(target)
      signal.throwIfAborted()
      const content = sentence.repeat(
        Math.ceil(target / sentenceTokens) * 2 + 1,
      )
      let remaining = Math.max(0, target - api.countTokens(prefix + suffix) - 8)
      let batch: number[] = []
      const parts: string[] = []
      for (const tokens of api.encodeGenerator(content)) {
        const take = Math.min(tokens.length, remaining)
        for (let index = 0; index < take; index++) batch.push(tokens[index]!)
        remaining -= take
        if (batch.length >= CONTEXT_TOKEN_BATCH_SIZE) {
          parts.push(api.decode(batch))
          batch = []
          await yieldToCaller(signal)
        }
        if (remaining === 0) break
      }
      parts.push(api.decode(batch))
      let prompt = prefix + parts.join("") + suffix
      let inputTokens = await countAsync(prompt, signal)
      // The fixture is ASCII. Keep the bound even if vocabulary boundaries change.
      while (inputTokens > target) {
        while (parts.length && !parts.at(-1)) parts.pop()
        if (!parts.length)
          throw new Error("Test input is too small for the prompt wrapper")
        parts[parts.length - 1] = parts.at(-1)!.slice(0, -1)
        prompt = prefix + parts.join("") + suffix
        inputTokens = await countAsync(prompt, signal)
      }
      return { prompt, inputTokens }
    },
  }
}
