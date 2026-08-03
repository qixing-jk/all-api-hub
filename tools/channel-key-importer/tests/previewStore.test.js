import assert from "node:assert/strict"
import test from "node:test"

import { PreviewStore } from "../src/previewStore.js"

test("preview credentials can be consumed only once", () => {
  const store = new PreviewStore()
  const previewId = store.create({ apiKey: "secret", models: ["model-a"] })

  assert.deepEqual(store.take(previewId), {
    apiKey: "secret",
    models: ["model-a"],
  })
  assert.throws(() => store.take(previewId), /已过期/)
})

test("blocks duplicate writes while allowing a failed attempt to release", () => {
  const store = new PreviewStore()
  const preview = { apiKey: "secret", models: ["model-a"] }
  const previewId = store.create(preview)

  assert.deepEqual(store.claim(previewId), preview)
  assert.throws(() => store.claim(previewId), /正在写入/)
  store.release(previewId)
  assert.deepEqual(store.claim(previewId), preview)
})
