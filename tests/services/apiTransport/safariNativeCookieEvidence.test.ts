import { readFileSync } from "node:fs"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import {
  verifyNativeCookieObservations,
  verifyRealSiteCookieObservations,
} from "~~/e2e/safariNativeCookie/verify"

const archived = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        path.resolve(
          "tests/fixtures/safariNativeCookie/observations-2026-10-10.json.gz",
        ),
      ),
    ).toString("utf8"),
  )

describe("native Safari evidence gate", () => {
  it("validates recorded native evidence without calling it formal release acceptance", () => {
    expect(verifyNativeCookieObservations(archived())).toMatchObject({
      nativeIsolationPassed: true,
      formalReleaseReady: false,
    })
  })
  it("rejects an incomplete latest run instead of accepting earlier success", () => {
    const data = archived()
    data.events.push({ stage: "trial-start", nativeContext: true })
    expect(() => verifyNativeCookieObservations(data)).toThrow()
  })
  it("rejects account cross-contamination observed at the server", () => {
    const data = archived()
    data.requests.find((request: any) => request.source === "A").identity =
      "fixture-TAB"
    expect(() => verifyNativeCookieObservations(data)).toThrow("Account leak")
  })
  it("rejects cancellation supported only by caller-side reporting", () => {
    const data = archived()
    const index = data.events.findLastIndex(
      (event: any) => event.stage === "hold-close",
    )
    data.events[index].beforeResponse = false
    expect(() => verifyNativeCookieObservations(data)).toThrow("beforeResponse")
  })
})

const realArchived = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        path.resolve(
          "tests/fixtures/safariNativeCookie/formal-same-site2-20261011.json.gz",
        ),
      ),
    ).toString("utf8"),
  )

describe("real Safari same-site evidence gate", () => {
  it("recognizes A/B/C isolation while exposing the ordinary-fetch limitation", () => {
    expect(verifyNativeCookieObservations(realArchived())).toMatchObject({
      nativeIsolationPassed: true,
      realSiteIsolationPassed: true,
      nativeRequests: 20,
      normalConcurrentChecks: 125,
      ordinaryExtensionAmbientAccountMatched: false,
      ownedBackendCleanupConfirmed: true,
      websiteDenyBlocksNative: false,
      inFlightPermissionRevocationConfirmed: false,
      formalReleaseReady: false,
    })
  })
  it("rejects a later unfinished attempt", () => {
    const data = realArchived()
    data.events.push({ stage: "real-site-start" })
    expect(() => verifyRealSiteCookieObservations(data)).toThrow()
  })
  it("rejects a wrong real-account identity", () => {
    const data = realArchived()
    data.events.find(
      (e: any) => e.stage === "real-site-result",
    ).allIdentitiesCorrect = false
    expect(() => verifyRealSiteCookieObservations(data)).toThrow(
      "allIdentitiesCorrect",
    )
  })
  it("rejects incorrect normal-tab identities", () => {
    const data = realArchived()
    data.events.find(
      (e: any) => e.stage === "real-site-browser-concurrency",
    ).allConcurrentCorrect = false
    expect(() => verifyRealSiteCookieObservations(data)).toThrow(
      "allConcurrentCorrect",
    )
  })
  it("rejects a normal tab observed only before or after native requests", () => {
    const data = realArchived()
    data.events.find(
      (e: any) => e.stage === "real-site-browser-concurrency",
    ).concurrentChecks = 0
    expect(() => verifyRealSiteCookieObservations(data)).toThrow("overlap")
  })
})
