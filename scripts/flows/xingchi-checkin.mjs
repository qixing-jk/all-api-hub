import assert from "node:assert/strict"

/** Validate the first native claim before recording live acceptance coverage. */
export function assertXingchiClaimEvidence(result, requests) {
  const posts = requests.filter((request) => request.method === "POST").length
  if (result.status === "success") {
    assert.equal(posts, 1, "A fresh grant must have exactly one POST")
    return
  }
  assert(
    result.status === "already_checked" ||
      (result.status === "skipped" &&
        result.reasonCode === "already_checked_today"),
    `Check-in failed: ${result.status}/${result.reasonCode}`,
  )
  assert.equal(posts, 0, "An already-claimed account must not POST")
}
