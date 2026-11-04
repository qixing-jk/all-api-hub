import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { afterEach, expect, it, vi } from "vitest"

import { runSafariSmoke } from "~~/e2e/safari/smoke"

afterEach(() => vi.useRealTimers())

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

it.each([
  { popupAvailable: true, navigationAvailable: true, optionsRendered: true },
  { popupAvailable: false, navigationAvailable: true, optionsRendered: true },
  { popupAvailable: true, navigationAvailable: false, optionsRendered: true },
  { popupAvailable: true, navigationAvailable: true, optionsRendered: false },
])(
  "accepts latest native evidence and requires the Popup flow (%j)",
  async ({ popupAvailable, navigationAvailable, optionsRendered }) => {
    if (!optionsRendered) vi.useFakeTimers()
    const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
    const projectRoot = path.join(output, "project")
    mkdirSync(path.join(projectRoot, "Trial.xcodeproj"), { recursive: true })
    mkdirSync(
      path.join(output, "DerivedData/Build/Products/Release/Trial.app"),
      {
        recursive: true,
      },
    )
    writeFileSync(
      path.join(output, "identity.json"),
      JSON.stringify({ projectRoot, appName: "Trial" }),
    )
    writeFileSync(
      path.join(output, "observations.json"),
      gunzipSync(
        readFileSync(
          "tests/fixtures/safariNativeCookie/observations-2026-10-10.json.gz",
        ),
      ),
    )
    const result = runSafariSmoke({
      platform: "darwin",
      output,
      command: (file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial"] } })
        if (args[0] === "enable" && args[2] === "Trial")
          throw new Error("Installed extension checkbox has no accessible name")
        if (args.includes("press") && args.includes("Trial") && !popupAvailable)
          throw new Error("Popup unavailable")
        if (
          args.includes("press") &&
          args.includes("Account Management") &&
          !navigationAvailable
        )
          throw new Error("Options navigation unavailable")
        if (file === "osascript" && args.join(" ").includes("get URL"))
          return "safari-web-extension://test/options.html#account"
        if (args.includes("dialogs") || args.includes("popover"))
          return JSON.stringify([
            {
              app: "Safari",
              text: "All API Hub\nNo accounts yet",
              buttons: [
                "Account Management",
                "Settings",
                ...(optionsRendered ? ["Add Account"] : []),
              ],
            },
          ])
        return "true"
      },
    })
    if (!popupAvailable)
      await expect(result).rejects.toThrow("Popup unavailable")
    else if (!navigationAvailable)
      await expect(result).rejects.toThrow("Options navigation unavailable")
    else if (!optionsRendered)
      await Promise.all([
        expect(result).rejects.toThrow(
          "Options account manager did not render",
        ),
        vi.runAllTimersAsync(),
      ])
    else expect((await result).status).toBe("passed")
  },
)

it("requires registration of the built native extension before activation", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  const projectRoot = path.join(output, "project")
  mkdirSync(path.join(projectRoot, "Trial.xcodeproj"), { recursive: true })
  mkdirSync(
    path.join(
      output,
      "DerivedData/Build/Products/Release/Trial.app/Contents/PlugIns/Trial Extension.appex",
    ),
    { recursive: true },
  )
  writeFileSync(
    path.join(output, "identity.json"),
    JSON.stringify({ projectRoot, appName: "Trial" }),
  )
  writeFileSync(
    path.join(output, "observations.json"),
    gunzipSync(
      readFileSync(
        "tests/fixtures/safariNativeCookie/observations-2026-10-10.json.gz",
      ),
    ),
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
        if (file === "pluginkit" && args.includes("-a"))
          throw new Error("Native registration failed")
        return "true"
      },
    }),
  ).rejects.toThrow("Native registration failed")
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

it("requires activation of the compiled trial extension", async () => {
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
        if (args.includes("enable-extension") && args.includes("Trial"))
          throw new Error("Trial extension unavailable")
        return "true"
      },
    }),
  ).rejects.toThrow("Trial extension unavailable")
})
