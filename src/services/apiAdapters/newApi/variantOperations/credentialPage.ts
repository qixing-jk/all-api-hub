import { fetchApi } from "~/services/apiTransport/request"
import {
  createDeploymentProbeMemory,
  normalizeDeploymentScope,
} from "~/services/core/deploymentProbeMemory"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { joinUrl } from "~/utils/core/url"

import { inspectRenderedCredentialPage } from "./renderedCredentialPage"

const pageMemory = createDeploymentProbeMemory<string>({ ttlMs: 5 * 60 * 1000 })
const pendingNetwork = new Map<string, Promise<string | undefined>>()
const MAX_ENTRY_SCRIPTS = 3
const PROBE_TIMEOUT_MS = 4000

/** Reads route registrations, never a SPA HTTP status, as credential-page evidence. */
async function probeNetworkCredentialPage(
  baseUrl: string,
  fallback: string,
): Promise<string | undefined> {
  const deadline = Date.now() + PROBE_TIMEOUT_MS
  const read = (path: string) => {
    const url = new URL(path, `${baseUrl.replace(/\/+$/, "")}/`)
    return fetchApi<string>(
      {
        baseUrl: url.origin,
        auth: { authType: AuthTypeEnum.None },
        requestTimeoutMs: Math.max(1, deadline - Date.now()),
      },
      {
        endpoint: `${url.pathname}${url.search}`,
        responseType: "text",
        currentTabTransport: "disabled",
        tempWindowFallback: { statusCodes: [], codes: [] },
      },
      true,
    )
  }
  try {
    const html = await read(`${baseUrl.replace(/\/+$/, "")}/`)
    // Entry bundles contain TanStack's full route ids even after minification.
    // A bare /security path can instead belong to an administrator settings page.
    const scripts = [
      ...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi),
    ]
      .map((match) => new URL(match[1]!, `${baseUrl.replace(/\/+$/, "")}/`))
      .filter(
        (url) =>
          url.origin === new URL(baseUrl).origin &&
          /(?:^|\/)index[.-].*\.js$|(?:^|\/)index\.js$/.test(url.pathname),
      )
    if (scripts.length === 0 || scripts.length > MAX_ENTRY_SCRIPTS)
      return undefined
    let profile = false
    for (const script of scripts) {
      if (Date.now() >= deadline) return undefined
      const source = await read(script.href)
      if (/["']\/_authenticated\/security\/?["']/.test(source)) {
        pageMemory.remember(baseUrl, fallback)
        return fallback
      }
      profile ||= /["']\/_authenticated\/profile\/?["']/.test(source)
    }
    if (profile) {
      pageMemory.remember(baseUrl, "/profile")
      return "/profile"
    }
  } catch {
    // Network, challenge and unknown bundlers do not establish another route.
  }
  return undefined
}

/** Clears only confirmed frontend page facts between tests. */
export function clearNewApiCredentialPagesForTests() {
  pageMemory.clear()
  pendingNetwork.clear()
}

/** Network first; render only when the caller supplies a user-command intent. */
export async function resolveNewApiCredentialPage(
  baseUrl: string,
  fallback: string,
  execution?: ProtectionBypassExecution,
): Promise<string> {
  const remembered = pageMemory.read(baseUrl)
  if (remembered) return remembered
  const key = `${normalizeDeploymentScope(baseUrl)}\n${fallback}`
  let pending = pendingNetwork.get(key)
  if (!pending) {
    pending = probeNetworkCredentialPage(baseUrl, fallback)
    pendingNetwork.set(key, pending)
    const request = pending
    void request.finally(() => {
      if (pendingNetwork.get(key) === request) pendingNetwork.delete(key)
    })
  }
  const networkPage = await pending
  if (networkPage) return networkPage
  if (execution?.kind !== "user_command") return fallback
  for (const path of [
    ...new Set([fallback, "/profile", "/console/personal"]),
  ]) {
    const state = await inspectRenderedCredentialPage(
      joinUrl(baseUrl, path),
      execution,
    )
    if (state === "credential") {
      pageMemory.remember(baseUrl, path)
      return path
    }
    if (state !== "not_found") break
  }
  return fallback
}
