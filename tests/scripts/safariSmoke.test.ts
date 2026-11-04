import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { runSafariSmoke } from "~~/e2e/safari/smoke"

it("records unavailable Safari as a failed check without running platform commands", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  let calls = 0
  await expect(
    runSafariSmoke({
      platform: "win32",
      output,
      command: () => {
        calls++
        return ""
      },
    }),
  ).rejects.toThrow("macOS")
  expect(calls).toBe(0)
  expect(
    JSON.parse(readFileSync(path.join(output, "report.json"), "utf8")),
  ).toMatchObject({
    status: "failed",
    checks: [{ name: "macOS runtime", status: "failed" }],
  })
})

it("reaches native compilation when the converter nests its project inside the app folder", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  const projectRoot = path.join(output, "project")
  mkdirSync(path.join(projectRoot, "Trial App", "Trial App.xcodeproj"), {
    recursive: true,
  })
  writeFileSync(
    path.join(output, "identity.json"),
    JSON.stringify({ projectRoot, appName: "Trial App" }),
  )
  await expect(
    runSafariSmoke({
      platform: "darwin",
      output,
      command: (file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial App"] } })
        if (file === "xcodebuild") throw new Error("compile fixture failed")
        return "true"
      },
    }),
  ).rejects.toThrow("compile fixture failed")
})

it("rejects denied accessibility access instead of accepting a launched Safari", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  await expect(
    runSafariSmoke({
      platform: "darwin",
      output,
      command: () => "false, Safari",
    }),
  ).rejects.toThrow("Accessibility")
  expect(
    JSON.parse(readFileSync(path.join(output, "report.json"), "utf8")),
  ).toMatchObject({ status: "failed" })
})

it("fails when Safari developer settings cannot be enabled instead of passing a General page", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  const projectRoot = path.join(output, "project")
  mkdirSync(path.join(projectRoot, "Trial.xcodeproj"), { recursive: true })
  mkdirSync(path.join(output, "DerivedData/Build/Products/Release/Trial.app"), {
    recursive: true,
  })
  writeFileSync(
    path.join(output, "identity.json"),
    JSON.stringify({ projectRoot, appName: "Trial" }),
  )
  await expect(
    runSafariSmoke({
      platform: "darwin",
      output,
      command: (file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial"] } })
        if (args.includes("enable"))
          throw new Error("Developer control unavailable")
        return "true"
      },
    }),
  ).rejects.toThrow("Developer control unavailable")
})
