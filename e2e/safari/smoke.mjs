import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** A failed prerequisite is evidence of failure, never a passing Safari smoke. */
export async function runSafariSmoke({
  platform = process.platform,
  output = path.resolve("test-results/safari"),
  command = (file, args) =>
    execFileSync(file, args, { encoding: "utf8", timeout: 120000 }),
} = {}) {
  fs.mkdirSync(output, { recursive: true })
  const report = { status: "running", checks: [] }
  const save = () =>
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    )
  const check = async (name, action) => {
    const row = { name, status: "running" }
    report.checks.push(row)
    save()
    try {
      const result = await action()
      row.status = "passed"
      save()
      return result
    } catch (error) {
      row.status = "failed"
      row.error = String(error.message)
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
        'tell application "System Events" to tell process "Safari" to get {UI elements enabled, name of every window}',
      ])
      fs.writeFileSync(path.join(output, "safari-accessibility.txt"), tree)
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
