import type { Page, Response } from "@playwright/test"

const GISTS_URL = "https://api.github.com/gists"

/** Delete only a Gist created by this test and verify that it is no longer readable. */
async function deleteAndVerifyGist(token: string, id: string) {
  const url = `${GISTS_URL}/${encodeURIComponent(id)}`
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fetch(url, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // A lost DELETE response may still mean deletion succeeded; verify before retrying.
    }
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (response.status === 404) return
    } catch {
      // The next bounded attempt retries both deletion and verification.
    }
  }
  throw new Error(`Could not verify cleanup of test-created Gist ${id}`)
}

/** Capture creation IDs before UI/persistence assertions, and retain both test and cleanup failures. */
export async function withGithubGistCleanup(
  page: Page,
  token: string,
  work: () => Promise<void>,
) {
  const createdIds = new Set<string>()
  const pending: Promise<void>[] = []
  const trackingErrors: unknown[] = []
  const onResponse = (response: Response) => {
    if (
      response.url() !== GISTS_URL ||
      response.request().method() !== "POST" ||
      !response.ok()
    )
      return
    pending.push(
      (async () => {
        const body: unknown = await response.json()
        if (
          !body ||
          typeof body !== "object" ||
          !("id" in body) ||
          typeof body.id !== "string" ||
          !/^[A-Za-z0-9_-]+$/.test(body.id)
        ) {
          throw new Error("Created Gist response has no usable cleanup ID")
        }
        createdIds.add(body.id)
      })().catch(() => {
        trackingErrors.push(
          new Error("Could not capture the test-created Gist ID for cleanup"),
        )
      }),
    )
  }
  page.on("response", onResponse)
  const failures: unknown[] = []
  try {
    await work()
  } catch (error) {
    failures.push(error)
  } finally {
    // Response-body reads can complete after a UI assertion has already failed.
    await Promise.all(pending)
    page.off("response", onResponse)
    failures.push(...trackingErrors)
    for (const id of createdIds) {
      try {
        await deleteAndVerifyGist(token, id)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1)
    throw new AggregateError(failures, "Gist test and cleanup failures")
}
