import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { verifyNativeCookieObservations } from "../safariNativeCookie/verify.ts"
import {
  decodeHostedRunnerPassword,
  unsignedExtensionPasswordDialog,
} from "./authorization.ts"

/** A failed prerequisite is evidence of failure, never a passing Safari smoke. */
type Check = { name: string; status: string; error?: string }

export async function runSafariSmoke({
  platform = process.platform,
  output = path.resolve("test-results/safari"),
  command = (file, args) =>
    execFileSync(
      file === "osascript" ? process.execPath : file,
      file === "osascript" ? ["e2e/safari/authorization.ts", ...args] : args,
      {
        encoding: "utf8",
        timeout: file === "osascript" ? 30000 : 600000,
        maxBuffer: 16 * 1024 * 1024,
      },
    ),
}: {
  platform?: string
  output?: string
  command?: (file: string, args: string[]) => string
} = {}) {
  fs.mkdirSync(output, { recursive: true })
  const report: { status: string; checks: Check[] } = {
    status: "running",
    checks: [],
  }
  const save = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    )
  const check = async (name: string, action: () => unknown) => {
    const row: Check = { name, status: "running" }
    console.log(`[Safari] ${name}`)
    report.checks.push(row)
    save()
    try {
      const result = await action()
      row.status = "passed"
      save()
      return result
    } catch (error) {
      row.status = "failed"
      row.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }
  let appName = ""
  let appPath = ""
  const driver = path.join(output, "accessibility")
  const openSettings = () =>
    command("osascript", [
      "-e",
      'tell application "Safari" to activate',
      "-e",
      'tell application "System Events" to tell process "Safari"\nset frontmost to true\nclick menu item "Settings…" of menu "Safari" of menu bar 1\nrepeat 40 times\nif exists window "General" or exists window "Extensions" or exists window "Developer" then return true\ndelay 0.25\nend repeat\nerror "Safari settings window unavailable"\nend tell',
    ])
  const allowUnsigned = () => {
    try {
      command(driver, ["enable", "Safari", "Allow unsigned extensions"])
    } catch (error) {
      const dialogs = JSON.parse(command(driver, ["dialogs", "Safari"]))
      if (!unsignedExtensionPasswordDialog(dialogs)) throw error
      assert(
        process.env.AAH_SAFARI_CI_PASSWORD,
        "Missing disposable Safari runner password",
      )
      execFileSync(driver, ["authenticate", "Safari"], {
        input: process.env.AAH_SAFARI_CI_PASSWORD + "\n",
        timeout: 10000,
      })
      command(driver, ["enable", "Safari", "Allow unsigned extensions"])
    }
  }
  try {
    await check("macOS runtime", () =>
      assert.equal(platform, "darwin", "Safari E2E requires macOS"),
    )
    await check("Accessibility driver build", () =>
      command("swiftc", [
        "e2e/safari/accessibility.swift",
        "-o",
        path.join(output, "accessibility"),
      ]),
    )
    await check("Safari UI automation access", () => {
      command("open", ["-a", "Safari"])
      const tree = command("osascript", [
        "-e",
        'tell application "Safari" to activate',
        "-e",
        'tell application "System Events" to get UI elements enabled',
      ])
      fs.writeFileSync(path.join(output, "safari-accessibility.txt"), tree)
      assert(
        /^true(?:,|\s|$)/u.test(tree.trim()),
        "Accessibility access unavailable",
      )
      const windows = command("osascript", [
        "-e",
        'tell application "System Events" to tell process "Safari" to get name of every window',
      ])
      fs.writeFileSync(path.join(output, "safari-windows.txt"), windows)
    })
    await check("Native extension build", () => {
      const prepared = command(process.execPath, [
        "e2e/safariNativeCookie/prepare.mjs",
      ])
      fs.writeFileSync(path.join(output, "prepare.log"), prepared)
      const match = prepared.match(/Prepared independent trial: ([^\r\n]+)/u)
      assert(match, "Missing independent trial identity")
      const identity = JSON.parse(
        fs.readFileSync(path.join(match[1]!, "identity.json"), "utf8"),
      )
      appName = identity.appName
      const project = fs
        .readdirSync(String(identity.projectRoot), {
          recursive: true,
          encoding: "utf8",
        })
        .find((file) => file.endsWith(".xcodeproj"))
      assert(project, "Missing converter project")
      const projectPath = path.join(identity.projectRoot, project)
      const listing = command("xcodebuild", [
        "-list",
        "-json",
        "-project",
        projectPath,
      ])
      const schemes = JSON.parse(listing.slice(listing.indexOf("{"))).project
        .schemes
      assert(schemes.length === 1, "Unexpected Safari trial schemes")
      const derived = path.join(output, "DerivedData")
      const build = command("xcodebuild", [
        "-project",
        projectPath,
        "-scheme",
        schemes[0],
        "-configuration",
        "Release",
        "-destination",
        "platform=macOS",
        "-derivedDataPath",
        derived,
        "CODE_SIGN_IDENTITY=-",
        "CODE_SIGN_STYLE=Manual",
        "DEVELOPMENT_TEAM=",
        "build",
      ])
      fs.writeFileSync(path.join(output, "xcodebuild.log"), build)
      const app = path.join(
        derived,
        "Build/Products/Release",
        `${identity.appName}.app`,
      )
      appPath = app
      assert(fs.existsSync(app), "Missing compiled Safari containing app")
      command("open", [app])
      fs.writeFileSync(
        path.join(output, "identity.json"),
        JSON.stringify(identity, null, 2),
      )
    })
    await check("Safari settings accessibility", () => {
      openSettings()
      fs.writeFileSync(
        path.join(output, "settings-before.json"),
        command(path.join(output, "accessibility"), ["dialogs", "Safari"]),
      )
      command(path.join(output, "accessibility"), [
        "press",
        "Safari",
        "Advanced",
      ])
      command(path.join(output, "accessibility"), [
        "enable",
        "Safari",
        "Show features for web developers",
      ])
      command(path.join(output, "accessibility"), [
        "press",
        "Safari",
        "Developer",
      ])
      const tree = command(path.join(output, "accessibility"), [
        "dialogs",
        "Safari",
      ])
      fs.writeFileSync(path.join(output, "safari-settings.txt"), tree)
      command("screencapture", ["-x", path.join(output, "safari-settings.png")])
    })
    await check("Trial extension activation", () => {
      allowUnsigned()
      const extension = path.join(
        appPath,
        "Contents/PlugIns",
        `${appName} Extension.appex`,
      )
      fs.writeFileSync(
        path.join(output, "native-bundle.json"),
        command("plutil", [
          "-convert",
          "json",
          "-o",
          "-",
          path.join(extension, "Contents/Info.plist"),
        ]),
      )
      command("pluginkit", ["-a", extension])
      fs.writeFileSync(
        path.join(output, "native-registration.txt"),
        command("pluginkit", [
          "-mAvvv",
          "-p",
          "com.apple.Safari.web-extension",
        ]),
      )
      command(path.join(output, "accessibility"), [
        "press",
        "Safari",
        "Extensions",
      ])
      assert(appName, "Missing trial extension name")
      const statePath = path.join(
        os.homedir(),
        "Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist",
      )
      fs.writeFileSync(
        path.join(output, "extension-state-before.xml"),
        command("plutil", ["-convert", "xml1", "-o", "-", statePath]),
      )
      command("osascript", [
        "-e",
        'tell application "Safari" to quit',
        "-e",
        'tell application "System Events"\nrepeat 40 times\nif not (exists process "Safari") then return true\ndelay 0.25\nend repeat\nerror "Safari did not quit"\nend tell',
      ])
      fs.writeFileSync(
        path.join(output, "activation-state.json"),
        command("python3", ["e2e/safari/activation.py", extension]),
      )
      command("open", ["-a", "Safari"])
      openSettings()
      command(driver, ["press", "Safari", "Developer"])
      allowUnsigned()
      command(driver, ["press", "Safari", "Extensions"])
      command(driver, ["extension-enabled", "Safari", appName])
      fs.writeFileSync(
        path.join(output, "extension-state-after.xml"),
        command("plutil", ["-convert", "xml1", "-o", "-", statePath]),
      )
      fs.writeFileSync(
        path.join(output, "extension-settings.json"),
        command(path.join(output, "accessibility"), ["dialogs", "Safari"]),
      )
      command("screencapture", [
        "-x",
        path.join(output, "extension-settings.png"),
      ])
    })
    await check("Native Cookie evidence", async () => {
      const deadline = Date.now() + 90000
      while (Date.now() < deadline) {
        const evidence = path.join(output, "observations.json")
        if (fs.existsSync(evidence)) {
          const data = JSON.parse(fs.readFileSync(evidence, "utf8"))
          const start = data.events.findLastIndex(
            (event: { stage: string }) => event.stage === "trial-start",
          )
          const current = data.events.slice(Math.max(0, start))
          if (
            current.some(
              (event: { stage: string }) => event.stage === "trial-error",
            )
          )
            throw new Error(
              "Native Cookie trial failed; inspect observations.json",
            )
          if (
            current.some(
              (event: { stage: string }) => event.stage === "trial-complete",
            )
          ) {
            verifyNativeCookieObservations(data)
            return
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error(
        "Native Cookie trial incomplete; inspect observations.json",
      )
    })
    await check("Toolbar Popup UI", async () => {
      command("osascript", [
        "-e",
        'tell application "Safari" to activate',
        "-e",
        'tell application "System Events" to tell process "Safari" to set frontmost to true',
      ])
      const driver = path.join(output, "accessibility")
      command(driver, ["press", "Safari", appName, "toolbar"])
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) {
        const snapshot = command(driver, ["popover", "Safari"])
        const panels = JSON.parse(snapshot) as {
          text: string
          buttons: string[]
        }[]
        if (
          panels.some(
            (panel) =>
              /All API Hub/u.test(panel.text) &&
              panel.buttons.includes("Account Management") &&
              panel.buttons.includes("Settings"),
          )
        ) {
          fs.writeFileSync(path.join(output, "popup.json"), snapshot)
          command("screencapture", ["-x", path.join(output, "popup.png")])
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error("Toolbar Popup did not render its management controls")
    })
    await check("Popup to Options navigation", async () => {
      const driver = path.join(output, "accessibility")
      command(driver, ["press", "Safari", "Account Management", "popover"])
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        const url = command("osascript", [
          "-e",
          'tell application "Safari" to get URL of current tab of front window',
        ]).trim()
        if (
          url.startsWith("safari-web-extension://") &&
          /\/options\.html(?:\?[^#]*)?#account$/u.test(url)
        ) {
          fs.writeFileSync(path.join(output, "options-url.txt"), url)
          fs.writeFileSync(
            path.join(output, "options-ui.json"),
            command(driver, ["dialogs", "Safari"]),
          )
          command("screencapture", ["-x", path.join(output, "options.png")])
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error("Popup did not navigate to the Options account manager")
    })
    await check("Options account manager UI", async () => {
      const driver = path.join(output, "accessibility")
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        const snapshot = command(driver, ["dialogs", "Safari"])
        const panels = JSON.parse(snapshot) as {
          text: string
          buttons: string[]
        }[]
        if (
          panels.some(
            (panel) =>
              /All API Hub/u.test(panel.text) &&
              panel.buttons.includes("Add Account"),
          )
        ) {
          fs.writeFileSync(path.join(output, "options-ui.json"), snapshot)
          command("screencapture", ["-x", path.join(output, "options.png")])
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error("Options account manager did not render")
    })
    report.status = "passed"
    return report
  } catch (error) {
    report.status = "failed"
    if (platform === "darwin") {
      try {
        fs.writeFileSync(
          path.join(output, "failure-ui.json"),
          command(path.join(output, "accessibility"), ["dialogs"]),
        )
        command("screencapture", ["-x", path.join(output, "failure.png")])
      } catch {
        // Preserve the original failed check when screenshot capture also fails.
      }
    }
    throw error
  } finally {
    save()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert(
    process.env.GITHUB_ACTIONS === "true",
    "Safari smoke operates only on disposable GitHub CI runners",
  )
  assert(
    process.platform === "darwin" &&
      process.env.RUNNER_ENVIRONMENT === "github-hosted",
    "Safari smoke requires a disposable GitHub-hosted Mac",
  )
  let password: string
  try {
    password = decodeHostedRunnerPassword(
      execFileSync("sudo", ["cat", "/etc/kcpassword"], {
        stdio: ["ignore", "pipe", "ignore"],
      }),
    )
  } catch {
    throw new Error(
      "Hosted runner's local auto-login credential is unavailable",
    )
  }
  console.log(`::add-mask::${password}`)
  process.env.AAH_SAFARI_CI_PASSWORD = password
  await runSafariSmoke()
}
