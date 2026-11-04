import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

interface Dialog {
  app: string
  text: string
  buttons: string[]
}

export function safariAuthorizationDialog(dialogs: Dialog[]) {
  return dialogs.find(
    (dialog) =>
      /hosted-compute-agent|osascript/u.test(dialog.text) &&
      /wants access to control [“"]Safari[”"]/u.test(dialog.text) &&
      dialog.buttons.includes("Allow"),
  )?.app
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
  while (!finished && Date.now() < deadline) {
    try {
      const dialogs = JSON.parse(
        execFileSync("test-results/safari/accessibility", ["dialogs"], {
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
    } catch {
      /* The UI may change while it is being read. Keep the command's failure. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!finished) child.kill()
  process.exitCode = await completion
}
