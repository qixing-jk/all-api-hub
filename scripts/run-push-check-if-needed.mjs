import { execFileSync } from "node:child_process"

import { runPnpm } from "./utils/run-pnpm.mjs"

/**
 * Recognize prose maintained outside extension/runtime and tooling inputs.
 * Unknown paths retain full validation; docs builds remain owned by docs CI.
 * @param file Repository-relative Git path.
 * @returns Whether the file is known documentation only.
 */
function isDocumentation(file) {
  return (
    /^[^/]+\.md$/.test(file) ||
    /^docs\/(?:docs|agents)\/.*\.md$/.test(file) ||
    /^\.agents\/skills\/.*\.md$/.test(file) ||
    file === ".husky/README.md"
  )
}

/**
 * Inspect every update supplied by Git's pre-push stdin protocol.
 * New refs or unavailable objects have no proven range, so retain the full gate.
 * @param input Lines containing local ref/SHA and remote ref/SHA.
 * @returns Whether the complete push gate is needed.
 */
function needsValidation(input) {
  const updates = input.trim().split(/\r?\n/).filter(Boolean)
  if (updates.length === 0) return true

  for (const update of updates) {
    const fields = update.trim().split(/\s+/)
    const [, localSha, , remoteSha] = fields
    if (
      fields.length !== 4 ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(localSha) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remoteSha)
    )
      return true
    if (/^0+$/.test(localSha)) continue
    if (/^0+$/.test(remoteSha)) return true

    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "-z", "--no-renames", remoteSha, localSha, "--"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
      .split("\0")
      .filter(Boolean)
    if (changed.some((file) => !isDocumentation(file))) return true
  }
  return false
}

/**
 * Read standard input up to a short timeout when not running interactively.
 * In Git pre-push hooks, Git pipes ref updates immediately and closes stdin.
 * In non-interactive environments without piped input, stdin remains open with no EOF;
 * timing out avoids hanging indefinitely and falls back to full validation.
 * @param timeoutMs Initial milliseconds to wait for stdin data or EOF.
 * @returns Standard input contents, or empty string on timeout/TTY.
 */
function readStdin(timeoutMs = 200) {
  if (process.stdin.isTTY) return Promise.resolve("")

  return new Promise((resolve) => {
    let data = ""
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      process.stdin.removeListener("data", onData)
      process.stdin.removeListener("end", onEnd)
      process.stdin.removeListener("error", onError)
      process.stdin.pause()
    }

    const finish = (result) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish("")
    }, timeoutMs)
    timer.unref()

    const onData = (chunk) => {
      data += chunk
      timer.refresh()
    }

    const onEnd = () => {
      finish(data)
    }

    const onError = () => {
      finish("")
    }

    process.stdin.setEncoding("utf8")
    process.stdin.on("data", onData)
    process.stdin.on("end", onEnd)
    process.stdin.on("error", onError)
    process.stdin.resume()
  })
}

let shouldValidate = true
try {
  const input = await readStdin()
  if (input) shouldValidate = needsValidation(input)
} catch {
  console.log("Push range unavailable; running full validation.")
}

if (shouldValidate) {
  runPnpm(["run", "validate:push"])
} else {
  console.log(
    "Skipping compile/knip: only known documentation or ref deletions changed.",
  )
}
