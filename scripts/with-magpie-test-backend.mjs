#!/usr/bin/env node
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { request } from "@playwright/test"

import { runScenarioWithCleanup } from "../e2e/utils/scenarioErrors.ts"
import {
  MAGPIE_WINDOWS_SHA256,
  startMagpieBackend,
} from "./suites/magpie/backend.mjs"
import { createMagpieNativeClient } from "./suites/magpie/native.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
const args = process.argv.slice(2)
// pnpm consumes its separator before forwarding arguments to the script.
const command = args[0] === "--" ? args.slice(1) : args
if (!command.length || command[0].startsWith("-"))
  throw new Error(
    "Usage: node scripts/with-magpie-test-backend.mjs -- node <test runner> [arguments]",
  )
const binary = process.env.AAH_E2E_MAGPIE_BINARY
if (!binary)
  throw new Error(
    "Set AAH_E2E_MAGPIE_BINARY to the pinned Magpie CLI executable",
  )
const hash =
  process.env.AAH_E2E_MAGPIE_BINARY_SHA256 ||
  (process.platform === "win32" ? MAGPIE_WINDOWS_SHA256 : undefined)
if (!hash)
  throw new Error(
    "Set AAH_E2E_MAGPIE_BINARY_SHA256 for the selected release on this platform",
  )
const backend = await startMagpieBackend(binary, hash)
const nativeRequest = await request.newContext()
let native
let sentinel
await runScenarioWithCleanup({
  run: async () => {
    native = await createMagpieNativeClient(nativeRequest, backend.config)
    assert.equal(
      (await native.inventory()).length,
      0,
      "Disposable home must start empty",
    )
    const id = `aah-sentinel-${randomUUID()}`
    await native.save({
      id,
      new: true,
      name: id,
      chat: "https://sentinel.example.invalid/v1",
      key: "sk-disposable-sentinel",
      models: ["sentinel-model"],
      headers: { "X-Sentinel": "keep" },
    })
    sentinel = (await native.inventory()).find((p) => p.id === id)
    assert.ok(sentinel, "Fixture sentinel persisted")
    console.log(
      "Pinned Magpie backend ready; disposable home, random port and pre-existing sentinel",
    )
    const code = await new Promise((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          AAH_E2E_MAGPIE_BASE_URL: backend.config.baseUrl,
          AAH_E2E_MAGPIE_WEB_KEY: backend.config.webKey,
          AAH_E2E_UPSTREAM_BASE_URL: "",
          AAH_E2E_UPSTREAM_API_KEY: "",
        },
      })
      child.once("error", reject)
      child.once("exit", (exitCode, signal) =>
        signal
          ? reject(new Error(`Test runner stopped by ${signal}`))
          : resolve(exitCode),
      )
    })
    assert.equal(code, 0, "Test runner failed")
  },
  finalizers: [
    async () => {
      if (!native || !sentinel) return
      const remaining = await native.inventory()
      assert.deepEqual(
        remaining,
        [sentinel],
        "Run-owned resources must be gone; original sentinel must be unchanged",
      )
      await native.remove(sentinel.id)
      assert.equal((await native.inventory()).length, 0)
      console.log("PASS native cleanup and unchanged sentinel")
    },
    () => nativeRequest.dispose(),
    () => backend.stop(),
  ],
  cleanupMessage: "Disposable Magpie cleanup failed",
  failureMessage: "Disposable Magpie test run failed",
})
console.log("PASS disposable backend stopped and its data directory removed")
