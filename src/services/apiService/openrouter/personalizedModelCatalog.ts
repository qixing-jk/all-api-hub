import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"

import { openRouterPersonalizedModelCatalogPageSchema } from "./personalizedModelCatalogSchemas"
import type { OpenRouterPublicModel } from "./publicModelCatalogSchemas"
import { createOpenRouterHttpError } from "./responseError"

const OPENROUTER_PERSONALIZED_MODELS_ENDPOINT = "/models/user"
const OPENROUTER_PERSONALIZED_CATALOG_MAX_PAGES = 50

const createInvalidPersonalizedCatalogResponseError = () =>
  new ApiError(
    "Invalid OpenRouter personalized model catalog response",
    undefined,
    OPENROUTER_PERSONALIZED_MODELS_ENDPOINT,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Accepts only forward pagination links on the verified OpenRouter endpoint. */
function resolveNextPersonalizedCatalogEndpoint(
  nextUrl: string,
  currentEndpoint: string,
): string {
  let next: URL
  try {
    next = new URL(nextUrl)
  } catch {
    throw createInvalidPersonalizedCatalogResponseError()
  }

  const canonicalBase = new URL(OPENROUTER_API_BASE_URL)
  const current = new URL(currentEndpoint, `${OPENROUTER_API_BASE_URL}/`)
  const nextOffset = Number(next.searchParams.get("offset"))
  const currentOffset = Number(current.searchParams.get("offset") ?? 0)
  const limit = next.searchParams.get("limit")
  if (
    next.protocol !== "https:" ||
    next.origin !== canonicalBase.origin ||
    next.pathname !== `${canonicalBase.pathname}/models/user` ||
    !Number.isInteger(nextOffset) ||
    nextOffset <= currentOffset ||
    (limit !== null &&
      (!Number.isInteger(Number(limit)) ||
        Number(limit) < 1 ||
        Number(limit) > 1000))
  ) {
    throw createInvalidPersonalizedCatalogResponseError()
  }

  return `${next.pathname.slice(canonicalBase.pathname.length)}${next.search}`
}

/** Fetches and validates one authenticated personalized catalog page. */
async function fetchOpenRouterPersonalizedModelCatalogPage(
  endpoint: string,
  accountId: string,
  managementKey: string,
  abortSignal?: AbortSignal,
) {
  const response = await fetchApiResponse<unknown>(
    {
      baseUrl: OPENROUTER_API_BASE_URL,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: managementKey,
      },
      accountId,
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
      "OpenRouter personalized model catalog request failed",
    )
  }

  const parsed = openRouterPersonalizedModelCatalogPageSchema.safeParse(
    response.body,
  )
  if (!parsed.success || parsed.data.success === false) {
    throw createInvalidPersonalizedCatalogResponseError()
  }

  return parsed.data
}

/**
 * Fetches the account-filtered catalog with an administrative Management Key.
 * https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails
 */
export async function fetchOpenRouterPersonalizedModelCatalog(params: {
  accountId: string
  managementKey: string
  abortSignal?: AbortSignal
}): Promise<OpenRouterPublicModel[]> {
  const modelsById = new Map<string, OpenRouterPublicModel>()
  const visitedEndpoints = new Set<string>()
  let endpoint = OPENROUTER_PERSONALIZED_MODELS_ENDPOINT
  let expectedTotalCount: number | undefined

  while (true) {
    if (
      visitedEndpoints.has(endpoint) ||
      visitedEndpoints.size >= OPENROUTER_PERSONALIZED_CATALOG_MAX_PAGES
    ) {
      throw createInvalidPersonalizedCatalogResponseError()
    }
    visitedEndpoints.add(endpoint)

    const page = await fetchOpenRouterPersonalizedModelCatalogPage(
      endpoint,
      params.accountId,
      params.managementKey,
      params.abortSignal,
    )
    expectedTotalCount ??= page.total_count
    if (page.total_count !== expectedTotalCount) {
      throw createInvalidPersonalizedCatalogResponseError()
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
      throw createInvalidPersonalizedCatalogResponseError()
    }

    endpoint = resolveNextPersonalizedCatalogEndpoint(page.links.next, endpoint)
  }

  if (modelsById.size !== expectedTotalCount) {
    throw createInvalidPersonalizedCatalogResponseError()
  }

  return Array.from(modelsById.values())
}
