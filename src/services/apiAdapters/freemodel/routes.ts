import {
  FREEMODEL_ANTHROPIC_BASE_URL,
  FREEMODEL_OPENAI_BASE_URL,
  FREEMODEL_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { FreeModelNode } from "~/services/apiService/freemodel/nodes"
import { API_TYPES } from "~/services/verification/aiApiVerification"

// Official routes verified on 2026-10-04: request roots, never a static model list.
// Fallback remains limited to known addresses, not arbitrary caller URLs.
export const KNOWN_FREEMODEL_NODES: readonly FreeModelNode[] = [
  {
    id: "known:openai",
    baseUrl: toProtocolRoot(
      API_TYPES.OPENAI_COMPATIBLE,
      FREEMODEL_OPENAI_BASE_URL,
    )!,
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    label: "OpenAI",
  },
  {
    id: "known:anthropic",
    baseUrl: toProtocolRoot(API_TYPES.ANTHROPIC, FREEMODEL_ANTHROPIC_BASE_URL)!,
    apiType: API_TYPES.ANTHROPIC,
    label: "Claude",
  },
  {
    id: "known:hq",
    baseUrl: "https://cc-hq.freemodel.dev",
    apiType: API_TYPES.ANTHROPIC,
    label: "Claude HQ",
  },
]

/** Retain the default protocol union, while explicit secondary routes stay scoped. */
export function resolveFreeModelRoutes(
  nodes: readonly FreeModelNode[],
  baseUrl: string,
): FreeModelNode[] {
  const url = new URL(baseUrl)
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Invalid FreeModel route")
  const defaultOpenAi = nodes.find(
    (node) => node.apiType === API_TYPES.OPENAI_COMPATIBLE,
  )
  const defaultAnthropic = nodes.find(
    (node) => node.apiType === API_TYPES.ANTHROPIC,
  )
  const selected =
    url.origin === FREEMODEL_WEB_ORIGIN
      ? defaultOpenAi ?? defaultAnthropic
      : nodes.find(
          (node) => toProtocolRoot(node.apiType, baseUrl) === node.baseUrl,
        )
  if (!selected) throw new Error("FreeModel inference route is unavailable")
  return selected === defaultOpenAi && defaultAnthropic
    ? [selected, defaultAnthropic]
    : [selected]
}
