import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { isRecord } from "~/utils/core/object"

import { fetchUserInfo, readFreeModelConsoleResponse } from "."

export type FreeModelNode = {
  id: string
  baseUrl: string
  apiType: typeof API_TYPES.OPENAI_COMPATIBLE | typeof API_TYPES.ANTHROPIC
  label: string
}

const invalid = () =>
  new ApiError(
    "Invalid FreeModel node catalog",
    undefined,
    "/api/nodes-public",
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Read structured routing metadata using only the verified console session. */
export async function fetchFreeModelNodes(
  request: ApiServiceRequest,
): Promise<FreeModelNode[]> {
  await fetchUserInfo(request)
  const body = await readFreeModelConsoleResponse(request, "/api/nodes-public")
  if (!Array.isArray(body.nodes)) throw invalid()
  const nodes: FreeModelNode[] = []
  const ids = new Set<string>()
  for (const node of body.nodes) {
    if (!isRecord(node)) throw invalid()
    if (node.is_enabled !== 1 && node.is_enabled !== true) continue
    if (node.format !== "openai" && node.format !== "anthropic") continue
    if (
      typeof node.id !== "number" ||
      !Number.isSafeInteger(node.id) ||
      node.id <= 0 ||
      typeof node.url !== "string"
    )
      throw invalid()
    let url: URL
    try {
      url = new URL(node.url)
    } catch {
      throw invalid()
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw invalid()
    const apiType =
      node.format === "openai"
        ? API_TYPES.OPENAI_COMPATIBLE
        : API_TYPES.ANTHROPIC
    const baseUrl = toProtocolRoot(apiType, node.url)
    if (!baseUrl) throw invalid()
    const id = `node:${node.id}`
    if (ids.has(id)) throw invalid()
    ids.add(id)
    const name =
      typeof node.display_name === "string" && node.display_name.trim()
        ? node.display_name.trim()
        : typeof node.name === "string"
          ? node.name.trim()
          : ""
    nodes.push({
      id,
      baseUrl,
      apiType,
      label: `${apiType === API_TYPES.ANTHROPIC ? "Claude" : "OpenAI"} · ${name ? `${name} · ` : ""}${baseUrl.replace("https://", "")}`,
    })
  }
  return nodes
}
