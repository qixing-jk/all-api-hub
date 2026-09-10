import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"

import {
  openRouterPublicModelCatalogPageSchema,
  type OpenRouterPublicModel,
} from "./publicModelCatalogSchemas"
import { createOpenRouterHttpError } from "./responseError"

const OPENROUTER_PUBLIC_MODELS_ENDPOINT = "/models?output_modalities=all"

const createInvalidCatalogResponseError = () =>
  new ApiError(
    "Invalid OpenRouter public model catalog response",
    undefined,
    "/models",
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Validates and converts the provider's next-page URL into a safe endpoint. */
function resolveNextCatalogEndpoint(
  nextUrl: string,
  currentEndpoint: string,
): string {
  let next: URL
  try {
    next = new URL(nextUrl)
  } catch {
    throw createInvalidCatalogResponseError()
  }

  const canonicalBase = new URL(OPENROUTER_API_BASE_URL)
  if (
    next.protocol !== "https:" ||
    next.origin !== canonicalBase.origin ||
    next.pathname !== `${canonicalBase.pathname}/models` ||
    next.searchParams.get("output_modalities") !== "all"
  ) {
    throw createInvalidCatalogResponseError()
  }

  const current = new URL(currentEndpoint, `${OPENROUTER_API_BASE_URL}/`)
  let hasProgressMarker = false
  for (const marker of ["offset", "page"] as const) {
    if (!next.searchParams.has(marker)) continue
    hasProgressMarker = true

    const nextValue = Number(next.searchParams.get(marker))
    const currentValue = Number(current.searchParams.get(marker) ?? 0)
    if (
      !Number.isInteger(nextValue) ||
      nextValue < 0 ||
      !Number.isInteger(currentValue) ||
      nextValue <= currentValue
    ) {
      throw createInvalidCatalogResponseError()
    }
  }
  if (!hasProgressMarker) throw createInvalidCatalogResponseError()

  return `${next.pathname.slice(canonicalBase.pathname.length)}${next.search}`
}

/** Fetches and validates one unauthenticated provider-catalog page. */
async function fetchOpenRouterPublicModelCatalogPage(
  endpoint: string,
  abortSignal?: AbortSignal,
) {
  const response = await fetchApiResponse<unknown>(
    {
      baseUrl: OPENROUTER_API_BASE_URL,
      auth: { authType: AuthTypeEnum.None },
      abortSignal,
    },
    {
      endpoint,
      options: { method: "GET", cache: "no-store" },
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  if (!response.ok) {
    throw createOpenRouterHttpError(
      response,
      endpoint,
      "OpenRouter public model catalog request failed",
    )
  }

  const parsed = openRouterPublicModelCatalogPageSchema.safeParse(response.body)
  if (!parsed.success || parsed.data.success === false) {
    throw createInvalidCatalogResponseError()
  }

  return parsed.data
}

/**
 * Fetches the documented provider-wide catalog without account credentials.
 * https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
 */
export async function fetchOpenRouterPublicModelCatalog(
  abortSignal?: AbortSignal,
): Promise<OpenRouterPublicModel[]> {
  const modelsById = new Map<string, OpenRouterPublicModel>()
  const visitedEndpoints = new Set<string>()
  let endpoint = OPENROUTER_PUBLIC_MODELS_ENDPOINT
  let expectedTotalCount: number | undefined

  while (true) {
    if (visitedEndpoints.has(endpoint)) {
      throw createInvalidCatalogResponseError()
    }
    visitedEndpoints.add(endpoint)

    const page = await fetchOpenRouterPublicModelCatalogPage(
      endpoint,
      abortSignal,
    )
    expectedTotalCount ??= page.total_count
    if (page.total_count !== expectedTotalCount) {
      throw createInvalidCatalogResponseError()
    }

    const modelCountBeforePage = modelsById.size
    for (const model of page.data) {
      if (!modelsById.has(model.id)) modelsById.set(model.id, model)
    }

    if (page.links.next === null) break
    if (
      modelsById.size === modelCountBeforePage ||
      modelsById.size >= expectedTotalCount
    ) {
      throw createInvalidCatalogResponseError()
    }

    endpoint = resolveNextCatalogEndpoint(page.links.next, endpoint)
  }

  if (modelsById.size !== expectedTotalCount) {
    throw createInvalidCatalogResponseError()
  }

  return Array.from(modelsById.values())
}
