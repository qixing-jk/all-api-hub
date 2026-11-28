import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS, PMPLAN_PROGRAM_NAME } from "./constants"

const HEALTH_PROBE_TIMEOUT_MS = 5_000

/** Public program identity from upstream src/api.rs, independent of deployment branding. */
export async function detectsPmplan(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL(PMPLAN_ENDPOINTS.Health, url), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS),
    })
    if (
      !response.ok ||
      !/\bjson\b/i.test(response.headers.get("content-type") ?? "")
    )
      return false
    const body: unknown = await response.json()
    return (
      isRecord(body) &&
      body.ok === true &&
      body.name === PMPLAN_PROGRAM_NAME &&
      typeof body.version === "string" &&
      Boolean(body.version.trim()) &&
      typeof body.time === "string" &&
      Number.isFinite(Date.parse(body.time))
    )
  } catch {
    return false
  }
}
