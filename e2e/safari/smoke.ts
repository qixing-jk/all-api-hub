import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import { userInfo } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { verifyNativeCookieObservations } from "../safariNativeCookie/verify.ts"
import { unsignedExtensionPasswordDialog } from "./authorization.ts"

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
      assert(fs.existsSync(app), "Missing compiled Safari containing app")
      command("open", [app])
      fs.writeFileSync(
        path.join(output, "identity.json"),
        JSON.stringify(identity, null, 2),
      )
    })
    await check("Safari settings accessibility", () => {
      command("osascript", [
        "-e",
        'tell application "Safari" to activate',
        "-e",
        'tell application "System Events" to tell process "Safari"\nset frontmost to true\nclick menu item "Settings…" of menu "Safari" of menu bar 1\nrepeat 40 times\nif exists window "General" then return "General"\ndelay 0.25\nend repeat\nerror "Safari settings window unavailable"\nend tell',
      ])
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
      const driver = path.join(output, "accessibility")
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
      command(path.join(output, "accessibility"), [
        "press",
        "Safari",
        "Extensions",
      ])
      assert(appName, "Missing trial extension name")
      command(path.join(output, "accessibility"), ["enable", "Safari", appName])
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
          if (
            data.events.some(
              (event: { stage: string }) => event.stage === "trial-error",
            )
          )
            throw new Error(
              "Native Cookie trial failed; inspect observations.json",
            )
          if (
            data.events.some(
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
  const password = randomBytes(24).toString("hex")
  console.log(`::add-mask::${password}`)
  try {
    execFileSync(
      "sudo",
      ["dscl", ".", "-passwd", `/Users/${userInfo().username}`, password],
      { stdio: "ignore" },
    )
  } catch {
    throw new Error(
      "Could not configure the disposable runner's Safari authentication",
    )
  }
  process.env.AAH_SAFARI_CI_PASSWORD = password
  await runSafariSmoke()
}
