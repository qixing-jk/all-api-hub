import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { isDevOutputReady, withReversePort } from "~~/scripts/mobile/dev.mjs"

it("does not package a partially written WXT output", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aah-mobile-"))
  try {
    await writeFile(
      path.join(dir, "options.html"),
      "http://127.0.0.1:3456/@vite/client",
    )
    expect(await isDevOutputReady(dir, 3456)).toBe(false)
    await writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        content_security_policy: { extension_pages: "http://127.0.0.1:3456" },
        background: { service_worker: "background.js" },
      }),
    )
    expect(await isDevOutputReady(dir, 3456)).toBe(false)
    await writeFile(path.join(dir, "background.js"), "// ready")
    expect(await isDevOutputReady(dir, 3456)).toBe(true)
    expect(await isDevOutputReady(dir, 4567)).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it("never replaces another mobile session's reverse mapping", async () => {
  const calls: string[][] = []
  const adb = async (args: string[]) => {
    calls.push(args)
    return args.includes("--list") ? "phone tcp:3000 tcp:4000" : ""
  }
  await expect(withReversePort("phone", 3000, adb)).rejects.toThrow(
    "already mapped",
  )
  expect(calls).toEqual([["-s", "phone", "reverse", "--list"]])
})

it("reuses a matching reverse mapping without removing it on exit", async () => {
  const calls: string[][] = []
  const adb = async (args: string[]) => {
    calls.push(args)
    return args.includes("--list") ? "phone tcp:3000 tcp:3000" : ""
  }
  const release = await withReversePort("phone", 3000, adb)
  await release()
  expect(calls).toHaveLength(1)
})
