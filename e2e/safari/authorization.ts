import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

interface Dialog {
  app: string
  text: string
  buttons: string[]
}

/** Format used by actions/runner-images' macOS bootstrap kcpassword.py. */
export function decodeHostedRunnerPassword(encoded: Uint8Array) {
  assert(
    encoded.length > 0,
    "Hosted runner auto-login credential is unavailable",
  )
  const key = [125, 137, 82, 35, 210, 188, 221, 234, 163, 185, 31]
  const decoded = Buffer.from(
    Array.from(encoded, (byte, index) => byte ^ key[index % key.length]!),
  )
  const password = decoded.toString("utf8").split("\0")[0]!
  assert(password.length > 0, "Hosted runner auto-login credential is empty")
  return password
}

export function safariAuthorizationDialog(dialogs: Dialog[]) {
  return dialogs.find(
    (dialog) =>
      /hosted-compute-agent|osascript/u.test(dialog.text) &&
      /wants access to control [“"]Safari[”"]/u.test(dialog.text) &&
      dialog.buttons.includes("Allow"),
  )?.app
}

export function unsignedExtensionPasswordDialog(dialogs: Dialog[]) {
  return dialogs.some(
    (dialog) =>
      dialog.app === "Safari" &&
      dialog.text.includes("Safari is trying to allow unsigned extensions.") &&
      dialog.text.includes("Enter the password for the user") &&
      dialog.buttons.includes("OK"),
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  assert(process.env.GITHUB_ACTIONS === "true", "CI-only Safari authorization")
  const child = spawn("osascript", process.argv.slice(2), {
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  let finished = false
  const completion = new Promise<number>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code) => {
      finished = true
      resolve(code ?? 1)
    })
  })
  const deadline = Date.now() + 25000
  let lastAuthorizationError: string | undefined
  while (!finished && Date.now() < deadline) {
    try {
      const dialogs = JSON.parse(
        execFileSync("test-results/safari/accessibility", ["authorization"], {
          encoding: "utf8",
          timeout: 3000,
        }),
      )
      const app = safariAuthorizationDialog(dialogs)
      if (app)
        execFileSync(
          "test-results/safari/accessibility",
          ["press", app, "Allow"],
          { timeout: 3000 },
        )
    } catch (error) {
      lastAuthorizationError =
        error instanceof Error ? error.message : String(error)
      /* The UI may change while it is being read. Keep the command's failure. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!finished) {
    console.error("Safari Apple Event timed out", lastAuthorizationError ?? "")
    child.kill()
  }
  process.exitCode = await completion
}
