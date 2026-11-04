import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { gunzipSync } from "node:zlib"
import { afterEach, expect, it, vi } from "vitest"

import { runSafariSmoke } from "~~/e2e/safari/smoke"

afterEach(() => vi.useRealTimers())

const withUsableDriver =
  (command: (file: string, args: string[]) => string) =>
  (file: string, args: string[]) => {
    if (file.endsWith("accessibility") && args.length === 0)
      throw Object.assign(new Error("Missing driver mode"), {
        status: 2,
        stderr: "usage: accessibility <mode> [args...]\n",
      })
    return command(file, args)
  }

it.each([0, 132, 2])(
  "rejects a driver that does not provide usage for a missing mode (exit %s)",
  async (status) => {
    const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
    await expect(
      runSafariSmoke({
        platform: "darwin",
        output,
        command: (file, args) => {
          if (file.endsWith("accessibility") && args.length === 0) {
            if (status === 0) return ""
            throw Object.assign(new Error("Invalid driver invocation"), {
              status,
              stderr: "Unexpected driver failure",
            })
          }
          return "true"
        },
      }),
    ).rejects.toThrow(
      "Accessibility driver must provide usage for a missing mode",
    )
  },
)

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

it.each(
  [
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: false,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: false,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: false,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: false,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 2,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: true,
      fixtureReady: true,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: false,
      reportBeingWritten: false,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: true,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
      emptyFrontWindow: true,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
      stalledStatus: true,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
      stalledControl: true,
    },
    {
      popupAvailable: true,
      navigationAvailable: true,
      optionsRendered: true,
      shutdownAvailable: true,
      activationPendingChecks: 0,
      uiSetupPending: false,
      fixtureReady: true,
      reportBeingWritten: false,
      fixtureReplyMissing: true,
    },
  ].map((scenario) => ({
    emptyFrontWindow: false,
    stalledStatus: false,
    stalledControl: false,
    fixtureReplyMissing: false,
    ...scenario,
  })),
)(
  "accepts latest native evidence and requires the Popup flow (%j)",
  async ({
    popupAvailable,
    navigationAvailable,
    optionsRendered,
    shutdownAvailable,
    activationPendingChecks,
    uiSetupPending,
    fixtureReady,
    reportBeingWritten,
    emptyFrontWindow,
    stalledStatus,
    stalledControl,
    fixtureReplyMissing,
  }) => {
    if (
      !optionsRendered ||
      activationPendingChecks ||
      uiSetupPending ||
      !fixtureReady ||
      stalledStatus ||
      stalledControl ||
      fixtureReplyMissing
    )
      vi.useFakeTimers()
    let activationChecks = 0
    let settingsOpen = false
    let optionsVisited = false
    let welcomePrompt = uiSetupPending
    const controlRequests: { method: string | undefined; body: unknown }[] = []
    const appName = "Trial"
    const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
    const projectRoot = path.join(output, "project")
    mkdirSync(path.join(projectRoot, "Trial.xcodeproj"), { recursive: true })
    mkdirSync(
      path.join(output, "DerivedData/Build/Products/Release", `${appName}.app`),
      {
        recursive: true,
      },
    )
    writeFileSync(
      path.join(output, "identity.json"),
      JSON.stringify({ projectRoot, appName }),
    )
    const nativeEvidence = JSON.parse(
      gunzipSync(
        readFileSync(
          "tests/fixtures/safariNativeCookie/observations-2026-10-10.json.gz",
        ),
      ).toString("utf8"),
    )
    writeFileSync(
      path.join(output, "observations.json"),
      reportBeingWritten ? "" : JSON.stringify(nativeEvidence),
    )
    const result = runSafariSmoke({
      platform: "darwin",
      output,
      command: withUsableDriver((file, args) => {
        if (file === "curl" && args.at(-1)?.endsWith("/status")) {
          if (stalledStatus) {
            const timeoutIndex = args.indexOf("--max-time")
            const seconds =
              timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : 600
            vi.setSystemTime(Date.now() + seconds * 1000)
            if (timeoutIndex >= 0 && seconds > 0 && seconds <= 10)
              throw new Error("Fixture status request timed out")
          }
          return JSON.stringify(nativeEvidence)
        }
        if (file === "curl" && args.at(-1)?.endsWith("/control")) {
          const method = args[args.indexOf("-X") + 1]
          const body = JSON.parse(args[args.indexOf("-d") + 1]!)
          controlRequests.push({ method, body })
          if (stalledControl) {
            const timeoutIndex = args.indexOf("--max-time")
            const seconds =
              timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : 600
            vi.setSystemTime(Date.now() + seconds * 1000)
            if (timeoutIndex >= 0 && seconds > 0 && seconds <= 10)
              throw new Error("Fixture control request timed out")
          }
          if (
            method === "POST" &&
            body.command === "ci-ui-fixture" &&
            !fixtureReplyMissing
          )
            nativeEvidence.events.push({
              stage: "ci-ui-fixture",
              nativeContext: true,
              cacheFresh: fixtureReady,
              items: 0,
            })
          return "ok"
        }
        if (
          emptyFrontWindow &&
          file === "osascript" &&
          args.join(" ").includes("current tab of front window")
        )
          throw new Error("Safari has no front window")
        if (file === "osascript" && args.join(" ").includes("to get version"))
          return "26.0"
        if (file === "osascript" && args.join(" ").includes("Settings…"))
          settingsOpen = true
        if (args[0] === "close-window" && args[2] === "Extensions")
          settingsOpen = false
        if (args[0] === "press" && args[2] === "Not now") welcomePrompt = false
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial"] } })
        if (
          file === "osascript" &&
          args.join(" ").includes("to quit") &&
          !shutdownAvailable
        )
          throw new Error("Safari did not quit")
        if (args[0] === "enable" && args[2] === "Trial")
          throw new Error("Installed extension checkbox has no accessible name")
        if (
          args[0] === "extension-enabled" &&
          activationChecks++ < activationPendingChecks
        )
          throw new Error("Registered trial has not loaded yet")
        if (args[0] === "press" && args[3] === "toolbar") {
          if (settingsOpen) throw new Error("Safari settings hides the toolbar")
          if (args[2] !== "All API Hub")
            throw new Error("Toolbar uses the action title, not the trial name")
          if (!popupAvailable) throw new Error("Popup unavailable")
        }
        if (
          args.includes("press") &&
          args.includes("Account Management") &&
          !navigationAvailable
        )
          throw new Error("Options navigation unavailable")
        if (file === "osascript" && args.join(" ").includes("get URL")) {
          if (args.join(" ").includes("/options.html")) optionsVisited = true
          return "safari-web-extension://test/options.html#account"
        }
        if (args[0] === "dialogs" && optionsVisited && welcomePrompt)
          return JSON.stringify([
            {
              app: "Safari",
              text: "Welcome to All API Hub",
              buttons: ["Not now"],
            },
          ])
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
      }),
    })
    if (!shutdownAvailable)
      await expect(result).rejects.toThrow("Safari did not quit")
    else if (stalledStatus)
      await expect(result).rejects.toThrow("Fixture status request timed out")
    else if (stalledControl)
      await expect(result).rejects.toThrow("Fixture control request timed out")
    else if (!fixtureReady || fixtureReplyMissing)
      await Promise.all([
        expect(result).rejects.toThrow("CI UI fixture"),
        vi.runAllTimersAsync(),
      ])
    else if (!popupAvailable)
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
    else if (activationPendingChecks || uiSetupPending)
      await Promise.all([
        result.then((report) => expect(report.status).toBe("passed")),
        vi.runAllTimersAsync(),
      ])
    else expect((await result).status).toBe("passed")
    if (shutdownAvailable && !stalledStatus)
      expect(controlRequests).toEqual([
        { method: "POST", body: { command: "ci-ui-fixture" } },
      ])
    if (emptyFrontWindow)
      expect(
        readFileSync(path.join(output, "safari-version.txt"), "utf8"),
      ).toBe("26.0")
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
      command: withUsableDriver((file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial"] } })
        if (file === "pluginkit" && args.includes("-a"))
          throw new Error("Native registration failed")
        return "true"
      }),
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
      command: withUsableDriver((file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial App"] } })
        if (file === "xcodebuild") throw new Error("compile fixture failed")
        return "true"
      }),
    }),
  ).rejects.toThrow("compile fixture failed")
})

it("rejects denied accessibility access instead of accepting a launched Safari", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "safari-smoke-"))
  await expect(
    runSafariSmoke({
      platform: "darwin",
      output,
      command: withUsableDriver(() => "false, Safari"),
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
      command: withUsableDriver((file, args) => {
        if (file === process.execPath)
          return `Prepared independent trial: ${output}`
        if (file === "xcodebuild" && args.includes("-list"))
          return JSON.stringify({ project: { schemes: ["Trial"] } })
        if (args.includes("enable"))
          throw new Error("Developer control unavailable")
        return "true"
      }),
    }),
  ).rejects.toThrow("Developer control unavailable")
})

it("requires activation of the compiled trial extension", async () => {
  vi.useFakeTimers()
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
  const result = runSafariSmoke({
    platform: "darwin",
    output,
    command: withUsableDriver((file, args) => {
      if (file === process.execPath)
        return `Prepared independent trial: ${output}`
      if (file === "xcodebuild" && args.includes("-list"))
        return JSON.stringify({ project: { schemes: ["Trial"] } })
      if (args.includes("extension-enabled") && args.includes("Trial"))
        throw new Error("Trial extension unavailable")
      return "true"
    }),
  })
  await Promise.all([
    expect(result).rejects.toThrow("Trial extension unavailable"),
    vi.runAllTimersAsync(),
  ])
})
