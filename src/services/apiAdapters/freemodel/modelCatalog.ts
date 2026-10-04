import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import { fetchFreeModelNodes } from "~/services/apiService/freemodel/nodes"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"

import { KNOWN_FREEMODEL_NODES, resolveFreeModelRoutes } from "./routes"

/** Discovers key-visible models while keeping console and inference auth separate. */
export const freeModelModelCatalog: ModelCatalogCapability = {
  // Keep discovery independent of unstable frontend-only price tables.
  // Default OpenAI retains the default Claude list; HQ is separate.
  async fetchModels(request, context) {
    let routes
    let inferenceRouteFallback = false
    try {
      if (!context) throw new Error("Console discovery context unavailable")
      routes = resolveFreeModelRoutes(
        await fetchFreeModelNodes({
          ...context.accountRequest,
          abortSignal:
            request.abortSignal ?? context.accountRequest.abortSignal,
        }),
        request.baseUrl,
      )
    } catch (error) {
      if (
        isAbortError(
          error,
          request.abortSignal ?? context?.accountRequest.abortSignal,
        )
      )
        throw error
      routes = resolveFreeModelRoutes(KNOWN_FREEMODEL_NODES, request.baseUrl)
      inferenceRouteFallback = true
    }
    const lists = await Promise.all(
      routes.map((route) =>
        route.apiType === API_TYPES.ANTHROPIC
          ? fetchAnthropicModelIds({
              baseUrl: route.baseUrl,
              apiKey: request.auth.apiKey,
              abortSignal: request.abortSignal,
            })
          : fetchOpenAICompatibleModelIds({
              baseUrl: route.baseUrl,
              apiKey: request.auth.apiKey,
              abortSignal: request.abortSignal,
            }),
      ),
    )
    const models = normalizeModelDescriptors(lists.flat().map((id) => ({ id })))
    return inferenceRouteFallback
      ? { models, inferenceRouteFallback: true }
      : models
  },
}
