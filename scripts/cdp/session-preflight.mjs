/** Convert callback failures to evidence without logging URLs, cookies or tokens. */
async function probeSafely(probe) {
  try {
    const session = await probe()
    if (
      session?.status === "authenticated" &&
      typeof session.identity === "string" &&
      session.identity.trim()
    ) {
      return { status: "authenticated", identity: session.identity }
    }
    if (session?.status === "unauthenticated") {
      return { status: "unauthenticated" }
    }
    if (session?.status === "error" && typeof session.reason === "string") {
      return { status: "error", reason: session.reason }
    }
    return { status: "error", reason: "invalid-session-probe" }
  } catch {
    return { status: "error", reason: "request-failed" }
  }
}

/**
 * Read-only assessment: callbacks inspect sessions and transfer capabilities;
 * they must not import credentials, copy databases or launch/close browsers.
 */
export async function preflightSession({
  probeTarget,
  expectedIdentity,
  sources = [],
  sourceDiscoveryComplete = false,
}) {
  const target = await probeSafely(probeTarget)
  const evidence = { target, sources: [], sourceDiscoveryComplete }
  const result = (status) => ({ status, ...evidence })
  const mismatches = (session) =>
    expectedIdentity !== undefined && session.identity !== expectedIdentity

  if (target.status === "error") return result("probe-failed")
  if (target.status === "authenticated") {
    return result(mismatches(target) ? "identity-mismatch" : "ready")
  }

  let mismatch = false
  let failed = false
  let unchecked = !sourceDiscoveryComplete
  for (const source of sources) {
    const session = await probeSafely(source.probe)
    const inspected = { name: source.name, session }
    evidence.sources.push(inspected)
    if (session.status === "error") {
      failed = true
      continue
    }
    if (session.status === "unauthenticated") continue
    if (mismatches(session)) {
      mismatch = true
      continue
    }
    try {
      const transfer = await source.checkTransfer?.()
      inspected.transfer = ["available", "unavailable"].includes(transfer)
        ? transfer
        : "unchecked"
    } catch {
      // A bridge failure does not rule out other live or offline sync paths.
      inspected.transfer = "unchecked"
    }
    if (inspected.transfer === "available") return result("sync-available")
    if (inspected.transfer !== "unavailable") unchecked = true
  }
  if (mismatch) return result("identity-mismatch")
  if (failed) return result("probe-failed")
  return result(unchecked ? "source-check-required" : "manual-login-required")
}

/** Read a site's identity endpoint without exposing its response or credentials. */
export async function probePageSession(page, { endpoint, readIdentity }) {
  let response
  try {
    response = await page.evaluate(async (endpoint) => {
      const url = new URL(endpoint, location.href)
      if (url.origin !== location.origin) {
        return { error: "cross-origin-endpoint" }
      }
      const result = await fetch(url.href, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      })
      return {
        status: result.status,
        text: result.ok ? await result.text() : undefined,
      }
    }, endpoint)
  } catch {
    return { status: "error", reason: "request-failed" }
  }
  if (response.error) return { status: "error", reason: response.error }
  if (response.status === 401) return { status: "unauthenticated" }
  if (response.status < 200 || response.status >= 300) {
    return { status: "error", reason: `http-${response.status}` }
  }
  try {
    const identity = readIdentity(JSON.parse(response.text))
    if (typeof identity === "string" && identity.trim()) {
      return { status: "authenticated", identity }
    }
  } catch {
    // Challenges, malformed payloads and parser errors are not a login verdict.
  }
  return { status: "error", reason: "invalid-identity-response" }
}
