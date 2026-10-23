import { toVersionedProtocolMount } from "~/services/aiApi/protocolAddress"
import { createHeaderOverrideFetch } from "~/services/apiTransport/headerOverrides"

import type { ApiVerificationApiType } from "../types"

export type ModelProbeParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  apiType: ApiVerificationApiType
  modelId: string
  abortSignal?: AbortSignal
}

export const PROBE_PATHS = {
  Video: "/video/generations",
  Rerank: "/rerank",
  Decision: "/decisions",
} as const

/** Preserve protocol mounts and credential overrides for direct JSON probes. */
export function getProbeUrl(params: ModelProbeParams, path: string): string {
  const mount = toVersionedProtocolMount(params.apiType, params.baseUrl)
  if (!mount) throw new Error("Invalid protocol API base URL")
  return `${mount.replace(/\/+$/, "")}${path}`
}

/** Submit once; callers own response validation and asynchronous task polling. */
export async function postProbeJson(
  params: ModelProbeParams,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const customFetch = createHeaderOverrideFetch(params.requestHeaders) ?? fetch
  const response = await customFetch(getProbeUrl(params, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.abortSignal,
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${errorText ? `: ${errorText.slice(0, 160)}` : ""}`,
    )
  }
  return response.json().catch(() => null)
}
