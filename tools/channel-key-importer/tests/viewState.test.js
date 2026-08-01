import assert from "node:assert/strict"
import test from "node:test"

import { APP_VIEWS, normalizeAppView } from "../public/viewState.js"

test("normalizes current and legacy workspace hashes", () => {
  assert.equal(normalizeAppView("#usage"), "usage")
  assert.equal(normalizeAppView("#usage-monitor"), "usage")
  assert.equal(normalizeAppView("connection"), "sites")
  assert.equal(normalizeAppView("schedules"), "tasks")
  assert.equal(normalizeAppView("unknown"), "import")
})

test("defines a title and description for every workspace", () => {
  assert.deepEqual(Object.keys(APP_VIEWS), [
    "import",
    "tasks",
    "usage",
    "records",
    "sites",
  ])
  for (const view of Object.values(APP_VIEWS)) {
    assert.ok(view.title)
    assert.ok(view.description)
  }
})
