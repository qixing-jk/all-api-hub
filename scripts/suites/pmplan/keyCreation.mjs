import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"
import { KEY_MANAGEMENT_TEST_IDS } from "../../../src/features/KeyManagement/testIds.ts"
import { PMPLAN_WEB_ORIGIN } from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { submitNativeKeyEditor } from "../../flows/native-key-editor.mjs"

/** Bind cleanup ownership to one submitted request from this run's editor page. */
export async function submitPmplanKeyCreation({
  page,
  input,
  write,
  confirmedIds,
  existingIds,
  evidenceDir,
  expectValidationError = false,
  timeoutMs = 60000,
}) {
  assert.ok(write, "PM-Plan key creation requires --write")
  let resolveResponse, resolveDispatch, rejectCapture, result
  const creationRequests = new Set()
  const captures = []
  let active = true
  let submittedRequests = 0
  const evidenceAbort = new AbortController()
  const dispatched = new Promise((resolve) => {
    resolveDispatch = resolve
  })
  const response = new Promise((resolve) => {
    resolveResponse = resolve
  })
  const deadline = new Promise((_, reject) => {
    rejectCapture = reject
  })
  // The deadline covers headers, body consumption and evidence persistence.
  const captured = Promise.race([
    response.then(async () => {
      // Every matching dispatch owns its own response, including duplicates.
      const results = await Promise.allSettled(captures)
      const failures = results
        .filter((item) => item.status === "rejected")
        .map((item) => item.reason)
      if (failures.length === 1) throw failures[0]
      if (failures.length)
        throw new AggregateError(failures, "PM-Plan creation responses failed")
      assert.equal(
        creationRequests.size,
        1,
        "Duplicate PM-Plan create dispatch; do not replay",
      )
      return results[0].value
    }),
    deadline,
  ]).then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  const captureResponse = async (request) => {
    const response = await request.response()
    assert.ok(response, "PM-Plan create response lost; do not replay")
    assert.ok(response.ok(), "PM-Plan key creation was rejected")
    const body = await response.json()
    assert.ok(active, "PM-Plan create capture already ended; do not replay")
    assert.ok(
      Number.isSafeInteger(body.id) && body.id > 0,
      "Creation response must confirm the cleanup ID; do not replay the create",
    )
    assert.ok(
      !existingIds.has(body.id),
      "Refuse to claim an existing PM-Plan key",
    )
    // Ownership survives evidence failure so the suite's finalizer can still revoke it.
    confirmedIds.add(body.id)
    await fs.writeFile(
      path.join(evidenceDir, `created-key-${body.id}.json`),
      JSON.stringify({ id: body.id }, null, 2),
      { signal: evidenceAbort.signal },
    )
    return body
  }
  let timeout
  const startCaptureDeadline = () => {
    if (timeout) return
    timeout = setTimeout(() => {
      active = false
      const error = new Error(
        "PM-Plan create response timed out; do not replay",
      )
      rejectCapture(error)
      evidenceAbort.abort(error)
    }, timeoutMs)
  }
  const observeRequest = (request) => {
    if (
      request.url() === `${PMPLAN_WEB_ORIGIN}/api/keys` &&
      request.method() === "POST" &&
      request.frame() === page.mainFrame()
    ) {
      submittedRequests++
      try {
        if (isDeepStrictEqual(request.postDataJSON(), input)) {
          creationRequests.add(request)
          startCaptureDeadline()
          const capture = captureResponse(request)
          // Attach rejection handling immediately; collect the outcome after the submit settles.
          capture.catch(() => {})
          captures.push(capture)
          resolveDispatch()
        }
      } catch {
        // Malformed or unrelated requests cannot establish resource ownership.
      }
    }
  }
  page.on("request", observeRequest)
  let submitted = false
  let observingFetch = false
  try {
    await runScenarioWithCleanup({
      run: async () => {
        // Count initiation in the owned page before protocol events reach Node.
        await page.evaluate((endpoint) => {
          const original = window.fetch
          const pending = []
          const wrapped = function (...args) {
            const request = args[0]
            const url = new URL(
              request instanceof Request ? request.url : String(request),
              location.href,
            ).href
            const method =
              args[1]?.method ??
              (request instanceof Request ? request.method : "GET")
            const result = original.apply(this, args)
            if (url === endpoint && method.toUpperCase() === "POST")
              pending.push(
                result.then(
                  () => undefined,
                  () => undefined,
                ),
              )
            return result
          }
          window.fetch = wrapped
          window.__aahPmplanCreateObservation = { original, wrapped, pending }
        }, `${PMPLAN_WEB_ORIGIN}/api/keys`)
        observingFetch = true
        await submitNativeKeyEditor(page, { waitForClose: false, timeoutMs })
        if (!expectValidationError) {
          submitted = true
          startCaptureDeadline()
          await Promise.race([dispatched, deadline])
        }
        if (expectValidationError) {
          await expect(
            page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor),
          ).toContainText("Enter a valid value.")
        }
        startCaptureDeadline()
        const browserRequests = await Promise.race([
          page.evaluate(async () => {
            const { pending } = window.__aahPmplanCreateObservation
            let count
            do {
              count = pending.length
              await Promise.all(pending)
            } while (count !== pending.length)
            return count
          }),
          deadline,
        ])
        await expect
          .poll(() => submittedRequests, { timeout: timeoutMs })
          .toBe(browserRequests)
        resolveResponse()
        assert.equal(
          submittedRequests,
          creationRequests.size,
          "Unexpected PM-Plan create dispatch; outcome unconfirmed, do not replay",
        )
        if (expectValidationError) {
          assert.equal(
            submittedRequests,
            0,
            "Invalid custom expiry reached the server",
          )
        }
      },
      finalizers: [
        async () => {
          if (!submitted && !creationRequests.size) return
          resolveResponse()
          const capture = await captured
          if (capture.error) throw capture.error
          result = capture.value
        },
        async () => {
          if (!observingFetch || page.isClosed()) return
          await page.evaluate(() => {
            const state = window.__aahPmplanCreateObservation
            if (window.fetch === state.wrapped) window.fetch = state.original
            delete window.__aahPmplanCreateObservation
          })
        },
      ],
      cleanupMessage: "PM-Plan creation response capture failed",
      failureMessage: "PM-Plan submit and response capture failed",
    })
    return result
  } finally {
    active = false
    clearTimeout(timeout)
    evidenceAbort.abort()
    page.off("request", observeRequest)
  }
}
