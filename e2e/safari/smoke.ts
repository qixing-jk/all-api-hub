import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** A failed prerequisite is evidence of failure, never a passing Safari smoke. */
type Check = { name: string; status: string; error?: string }

export async function runSafariSmoke({
  platform = process.platform,
  output = path.resolve("test-results/safari"),
  command = (file, args) =>
    execFileSync(file, args, {
      encoding: "utf8",
      timeout: file === "osascript" ? 30000 : 600000,
      maxBuffer: 16 * 1024 * 1024,
    }),
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
  try {
    await check("macOS runtime", () =>
      assert.equal(platform, "darwin", "Safari E2E requires macOS"),
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
      const project = fs
        .readdirSync(identity.projectRoot, { recursive: true })
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
        'tell application "System Events" to tell process "Safari" to keystroke "," using command down',
      ])
      const tree = command("osascript", [
        "-e",
        'tell application "System Events" to tell process "Safari"\n delay 1\n try\n click button "Advanced" of toolbar 1 of window 1\n end try\n delay 1\n repeat with control in (entire contents of window 1)\n try\n if role of control is "AXCheckBox" and name of control contains "Show features for web developers" then\n if value of control is 0 then click control\n end if\n end try\n end repeat\n delay 1\n try\n click button "Developer" of toolbar 1 of window 1\n end try\n delay 1\n return entire contents of window 1\n end tell',
      ])
      fs.writeFileSync(path.join(output, "safari-settings.txt"), tree)
      command("screencapture", ["-x", path.join(output, "safari-settings.png")])
    })
    report.status = "passed"
    return report
  } catch (error) {
    report.status = "failed"
    throw error
  } finally {
    save()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runSafariSmoke()
}
