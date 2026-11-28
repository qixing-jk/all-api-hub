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
  let creationRequest, resolveResponse, rejectResponse, rejectCapture, result
  let active = true
  let submittedRequests = 0
  const evidenceAbort = new AbortController()
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve
    rejectResponse = reject
  })
  const deadline = new Promise((_, reject) => {
    rejectCapture = reject
  })
  // The deadline covers headers, body consumption and evidence persistence.
  const captured = Promise.race([
    response.then(async (response) => {
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
        JSON.stringify(body, null, 2),
        { signal: evidenceAbort.signal },
      )
      return body
    }),
    deadline,
  ]).then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
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
        if (
          !creationRequest &&
          isDeepStrictEqual(request.postDataJSON(), input)
        ) {
          creationRequest = request
          startCaptureDeadline()
        }
      } catch {
        // Malformed or unrelated requests cannot establish resource ownership.
      }
    }
  }
  const observeResponse = (response) => {
    if (response.request() === creationRequest) resolveResponse(response)
  }
  const observeFailure = (request) => {
    if (request === creationRequest)
      rejectResponse(new Error("PM-Plan create response lost; do not replay"))
  }
  page.on("request", observeRequest)
  page.on("response", observeResponse)
  page.on("requestfailed", observeFailure)
  let submitted = false
  try {
    await runScenarioWithCleanup({
      run: async () => {
        await submitNativeKeyEditor(page, { waitForClose: false, timeoutMs })
        if (expectValidationError) {
          await expect(
            page.getByTestId(KEY_MANAGEMENT_TEST_IDS.nativeEditor),
          ).toContainText("Enter a valid value.")
          assert.equal(
            submittedRequests,
            0,
            "Invalid custom expiry reached the server",
          )
        } else {
          submitted = true
          // UI readiness has its own bounded wait; capture cannot expire before dispatch.
          startCaptureDeadline()
        }
      },
      finalizers: [
        async () => {
          if (!submitted && !creationRequest) return
          const capture = await captured
          if (capture.error) throw capture.error
          result = capture.value
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
    page.off("response", observeResponse)
    page.off("requestfailed", observeFailure)
  }
}
