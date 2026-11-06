import type { ModelIdentityLookupResult } from "~/services/models/modelMetadata/types"

import { CONTEXT_CAPACITY_DEFAULTS as defaults } from "./contextCapacityDefaults"

export type ContextCounterInfo = {
  encoding: string
  estimated: boolean
  modelId?: string
  identityMatch?: Extract<
    ModelIdentityLookupResult,
    { state: "resolved" }
  >["match"]
  declaredContext?: number
  declaredInput?: number
  declaredOutput?: number
}

/** Load only the selected vocabulary when a capacity test starts. */
export async function createContextCounter(
  identity: ModelIdentityLookupResult,
) {
  const models = await import("gpt-tokenizer/modelsMap")
  const metadata = identity.state === "resolved" ? identity.metadata : undefined
  const bareId = metadata?.id.replace(/^[^/]+\//, "")
  const encoding =
    bareId && models.cl100k_base.includes(bareId) ? "cl100k_base" : "o200k_base"
  const matched = Boolean(
    bareId &&
      (models.cl100k_base.includes(bareId) ||
        models.o200k_base.includes(bareId)),
  )
  const api =
    encoding === "cl100k_base"
      ? await import("gpt-tokenizer/encoding/cl100k_base")
      : await import("gpt-tokenizer/encoding/o200k_base")
  const info: ContextCounterInfo = {
    encoding,
    estimated:
      !matched || identity.state !== "resolved" || identity.match !== "exact",
    modelId: metadata?.id,
    identityMatch: identity.state === "resolved" ? identity.match : undefined,
    declaredContext: metadata?.limits?.context,
    declaredInput: metadata?.limits?.input,
    declaredOutput: metadata?.limits?.output,
  }
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
  return {
    info,
    maxInputTokens,
    count: (text: string) => api.countTokens(text),
    makePrompt(target: number) {
      if (
        !Number.isSafeInteger(target) ||
        target <= 0 ||
        target > maxInputTokens
      )
        throw new Error("Test input exceeds the 32 MiB request limit")
      const content = sentence.repeat(
        Math.ceil(target / sentenceTokens) * 2 + 1,
      )
      const available = Math.max(
        0,
        target - api.countTokens(prefix + suffix) - 8,
      )
      let prompt =
        prefix + api.decode(api.encode(content).slice(0, available)) + suffix
      while (api.countTokens(prompt) > target) {
        prompt =
          prefix +
          api.decode(
            api
              .encode(prompt.slice(prefix.length, -suffix.length))
              .slice(0, -1),
          ) +
          suffix
      }
      return prompt
    },
  }
}
