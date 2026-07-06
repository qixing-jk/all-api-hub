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
