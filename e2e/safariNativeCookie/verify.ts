import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"

type RecordValue = Record<string, unknown>
interface Observations {
  events: RecordValue[]
  requests: RecordValue[]
}

function latestEvent(
  events: RecordValue[],
  matches: (event: RecordValue) => boolean,
) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!
    if (matches(event)) return event
  }
  return undefined
}

/** Require the latest HTTPS same-site A/B run and overlapping normal C tab. */
export function verifyRealSiteCookieObservations(input: unknown) {
  assert(input && typeof input === "object", "Missing observations")
  const data = input as Observations
  assert(Array.isArray(data.events), "Missing real-site evidence")
  const start = data.events
    .map((event) => event.stage)
    .lastIndexOf("real-site-start")
  assert(start >= 0, "Missing real-site run")
  const run = data.events.slice(start)
  const stage = (name: string) => {
    const entries = run.filter((event) => event.stage === name)
    assert.equal(entries.length, 1, `Missing or duplicate stage: ${name}`)
    return entries[0]!
  }
  const truth = (name: string, fields: string[]) => {
    const entry = stage(name)
    for (const field of fields)
      assert.equal(
        entry[field],
        true,
        `Failed real observation: ${name}.${field}`,
      )
    return entry
  }
  const begin = truth("real-site-start", [
    "nativeContext",
    "https",
    "sameOrigin",
    "distinctIdentities",
    "hostGrant",
  ])
  const result = truth("real-site-result", [
    "allIdentitiesCorrect",
    "storageRoundTrip",
  ])
  assert.equal(result.requests, 20, "Missing real account requests")
  assert(
    typeof begin.recordedAt === "number" &&
      typeof result.recordedAt === "number" &&
      result.recordedAt >= begin.recordedAt,
    "Invalid real native interval",
  )
  const normal = truth("real-site-browser-concurrency", [
    "ownedProfile",
    "normalSafariTab",
    "loginSucceeded",
    "allConcurrentCorrect",
    "beforeCorrect",
    "afterCorrect",
  ])
  assert.equal(normal.failed, false, "Normal browser observation failed")
  assert(
    typeof normal.concurrentChecks === "number" && normal.concurrentChecks > 0,
    "No real browser overlap",
  )
  assert(
    typeof normal.recordedAt === "number" &&
      normal.recordedAt >= result.recordedAt,
    "Browser evidence belongs to an earlier run",
  )
  truth("real-site-cleanup", ["ownAccountsRemoved"])
  return {
    realSiteIsolationPassed: true,
    nativeRequests: result.requests,
    normalConcurrentChecks: normal.concurrentChecks,
    ordinaryExtensionAmbientAccountMatched:
      result.ambientBrowserCorrect === true,
    ownedBackendCleanupConfirmed:
      latestEvent(
        data.events,
        (event) => event.stage === "owned-backend-cleanup",
      )?.confirmed === true,
  }
}

/** Validate the latest attempt, never substitute an earlier successful run. */
export function verifyNativeCookieObservations(input: unknown) {
  assert(input && typeof input === "object", "Missing observations")
  const data = input as Observations
  assert(
    Array.isArray(data.events) && Array.isArray(data.requests),
    "Missing native evidence",
  )
  let start = -1
  data.events.forEach((event, index) => {
    if (event.stage === "trial-start") start = index
  })
  assert(start >= 0, "Missing native run")
  const attempt = data.events.slice(start)
  const complete = attempt.findIndex(
    (event) => event.stage === "trial-complete",
  )
  assert(complete >= 0, "Latest native run incomplete")
  const run = attempt.slice(0, complete + 1)
  const stage = (name: string) => {
    const entries = run.filter((event) => event.stage === name)
    assert.equal(entries.length, 1, `Missing or duplicate stage: ${name}`)
    return entries[0]!
  }
  const truth = (name: string, fields: string[]) => {
    const entry = stage(name)
    for (const field of fields)
      assert.equal(
        entry[field],
        true,
        `Failed native observation: ${name}.${field}`,
      )
    return entry
  }
  assert(
    !run.some((event) => event.stage === "trial-error"),
    "Latest native run failed",
  )
  truth("trial-start", ["nativeContext"])
  truth("trial-capabilities", [
    "uuid",
    "permissionEvent",
    "nativeMessaging",
    "hostGrant",
  ])
  const concurrent = truth("trial-concurrency", [
    "accountCorrect",
    "cookieAndOriginApplied",
    "normalIsolated",
  ])
  assert.equal(concurrent.requests, 20, "Missing concurrent account requests")
  assert(
    typeof concurrent.normalChecks === "number" && concurrent.normalChecks > 0,
    "No concurrent browser-tab observations",
  )
  truth("trial-set-cookie", [
    "responseSucceeded",
    "setCookieHidden",
    "nextAccountCorrect",
    "normalCookieUnchanged",
  ])
  truth("trial-redirect", ["rejected", "targetNotRequested"])
  truth("trial-cancel", ["cancelled", "nextAccountCorrect", "nativeCancelled"])
  truth("hold-close", ["beforeResponse"])
  truth("trial-boundaries", ["largeRejected", "scopeRejected"])
  truth("trial-ordinary", ["succeeded", "ambientExcluded"])
  stage("trial-complete")
  const first = stage("trial-start").requestCursor
  const last = stage("trial-complete").requestCursor
  // Legacy captures have no cursor; conservatively check their entire trace.
  const requestRun =
    typeof first === "number" && typeof last === "number"
      ? data.requests.slice(first, last)
      : data.requests
  for (const source of ["A", "B", "tab"]) {
    const requests = requestRun.filter((request) => request.source === source)
    assert(requests.length > 0, `Missing server observations: ${source}`)
    for (const request of requests) {
      assert.equal(
        request.identity,
        source === "tab" ? "fixture-TAB" : `fixture-${source}`,
        `Account leak: ${source}`,
      )
      assert.equal(
        request.onlyFixtureCookie,
        true,
        `Unexpected ambient cookie: ${source}`,
      )
      if (source !== "tab")
        assert.equal(request.originKind, "fixture", "Origin not applied")
    }
  }
  assert(
    !requestRun.some((request) => request.endpoint === "/redirect-target"),
    "Redirect target received a request",
  )
  const real = data.events.some((event) => event.stage === "real-site-start")
    ? verifyRealSiteCookieObservations(data)
    : { realSiteIsolationPassed: false }
  return {
    nativeIsolationPassed: true,
    ...real,
    websiteDenyBlocksNative:
      latestEvent(
        data.events,
        (event) =>
          event.stage === "permission-observation" &&
          event.mode === "permissions-deny",
      )?.nativeSucceeded === false,
    inFlightPermissionRevocationConfirmed:
      latestEvent(
        data.events,
        (event) => event.stage === "native-revoke-result",
      )?.permissionRevoked === true,
    formalReleaseReady: false,
    remaining: [
      "HTTPS/private website denial, revocation latency and native authorization race",
      "Cookie regrant followed by native request, cancellation admission stress",
      "Options/Popup/background product flows",
      ...(real.realSiteIsolationPassed
        ? []
        : ["HTTPS same-site A/B/C isolation"]),
      "full Safari restart",
      "ordinary authenticated extension fetch and real-site product compatibility",
      "release packaging and upgrade",
    ],
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const file = process.argv[2]
  assert(
    file,
    "Usage: node e2e/safariNativeCookie/verify.ts observations.json[.gz] [--formal]",
  )
  const raw = readFileSync(file)
  const result = verifyNativeCookieObservations(
    JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8")),
  )
  console.log(JSON.stringify(result, null, 2))
  if (process.argv.includes("--formal") && !result.formalReleaseReady)
    process.exitCode = 2
}
