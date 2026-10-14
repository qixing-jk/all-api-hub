import { EventEmitter } from "node:events"
import { expect, it } from "vitest"

import { waitForStop } from "~~/scripts/mobile/lifecycle.mjs"

it("ends log capture on interruption and removes its signal listeners", async () => {
  const signals = new EventEmitter()
  const wait = waitForStop(10000, signals)
  signals.emit("SIGINT")
  await wait
  expect(signals.listenerCount("SIGINT")).toBe(0)
  expect(signals.listenerCount("SIGTERM")).toBe(0)
})
