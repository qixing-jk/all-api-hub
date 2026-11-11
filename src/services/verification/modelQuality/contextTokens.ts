import type { RawBytePairRanks } from "gpt-tokenizer/BytePairEncodingCore"
import type { GptEncoding } from "gpt-tokenizer/GptEncoding"

import { modelMetadataService } from "~/services/models/modelMetadata"
import type { ModelIdentityLookupResult } from "~/services/models/modelMetadata/types"
import {
  CONTEXT_TOKEN_BATCH_SIZE,
  CONTEXT_TOKEN_ENCODINGS,
  CONTEXT_TOKEN_VOCABULARY_DIR,
} from "~/services/verification/modelQuality/contextTokenConstants"
import { getExtensionURL } from "~/utils/browser/runtime"

const encodings = new Map<string, Promise<GptEncoding>>()

/** Share one lazy encoding per vocabulary; failed reads remain retryable. */
function loadContextEncoding(encoding: "cl100k_base" | "o200k_base") {
  let pending = encodings.get(encoding)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(
        getExtensionURL(`${CONTEXT_TOKEN_VOCABULARY_DIR}/${encoding}.json`),
      )
      if (!response.ok)
        throw new Error(`Cannot load tokenizer vocabulary: ${response.status}`)
      const ranks = (await response.json()) as RawBytePairRanks
      const { GptEncoding } = await import("gpt-tokenizer/GptEncoding")
      return GptEncoding.getEncodingApi(encoding, () => ranks)
    })().catch((error) => {
      encodings.delete(encoding)
      throw error
    })
    encodings.set(encoding, pending)
  }
  return pending
}

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

/** Shared lazy tokenizer and metadata for long-input verification. */
async function resolveContextCounterInfo(identity: ModelIdentityLookupResult) {
  const models = await import("gpt-tokenizer/modelsMap")
  const metadata = identity.state === "resolved" ? identity.metadata : undefined
  const bareId = metadata?.id.replace(/^[^/]+\//, "")
  const encoding =
    bareId && models[CONTEXT_TOKEN_ENCODINGS.Cl100k].includes(bareId)
      ? CONTEXT_TOKEN_ENCODINGS.Cl100k
      : CONTEXT_TOKEN_ENCODINGS.O200k
  const matched = Boolean(
    bareId &&
    (models[CONTEXT_TOKEN_ENCODINGS.Cl100k].includes(bareId) ||
      models[CONTEXT_TOKEN_ENCODINGS.O200k].includes(bareId)),
  )
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
  return info
}

/** Read metadata for a preview without loading a tokenizer or resolving credentials. */
export async function getModelContextInfo(modelId: string) {
  await modelMetadataService.initialize()
  return resolveContextCounterInfo(
    modelMetadataService.resolveModelIdentity(modelId),
  )
}

/** Load the matching vocabulary only when a long-input test starts. */
export async function createContextTokens(identity: ModelIdentityLookupResult) {
  const info = await resolveContextCounterInfo(identity)
  const encoding =
    info.encoding === CONTEXT_TOKEN_ENCODINGS.Cl100k
      ? CONTEXT_TOKEN_ENCODINGS.Cl100k
      : CONTEXT_TOKEN_ENCODINGS.O200k
  const api = await loadContextEncoding(encoding)
  const yieldToCaller = async (signal: AbortSignal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    signal.throwIfAborted()
  }
  const countAsync = async (text: string, signal: AbortSignal) => {
    let count = 0
    let batch = 0
    for (const tokens of api.encodeGenerator(text)) {
      count += tokens.length
      batch += tokens.length
      if (batch >= CONTEXT_TOKEN_BATCH_SIZE) {
        await yieldToCaller(signal)
        batch = 0
      }
    }
    signal.throwIfAborted()
    return count
  }
  return {
    info,
    countTokens: api.countTokens,
    encodeGenerator: api.encodeGenerator,
    decode: api.decode,
    countAsync,
    yieldToCaller,
  }
}
export type ContextTokens = Awaited<ReturnType<typeof createContextTokens>>
