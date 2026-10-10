import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { once } from "node:events"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"

export const MAGPIE_WINDOWS_SHA256 =
  "d00d43152e981046a60d706cead35f6600c9f413c3e71405a5ed67a2f677e135"

/** Magpie reads its user home directly; XDG-only isolation is insufficient. */
export function makeMagpieProcessEnv(parent, root, webKey) {
  return {
    ...parent,
    USERPROFILE: root,
    HOME: root,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    MAGPIE_WEB_KEY: webKey,
    DO_NOT_TRACK: "1",
  }
}

/** Start only an explicitly supplied and checksummed binary in a disposable home. */
export async function startMagpieBackend(binary, expectedHash) {
  const actualHash = createHash("sha256")
    .update(await fs.readFile(binary))
    .digest("hex")
  if (actualHash !== expectedHash)
    throw new Error(
      "Magpie binary checksum mismatch; verify the selected pinned release",
    )
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aah-magpie-e2e-"))
  const webKey = randomUUID()
  let child
  let exited
  let stopped = false
  const stop = async () => {
    if (stopped) return
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill()
      let timer
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Magpie backend did not stop; disposable data retained",
                  ),
                ),
              10_000,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    }
    // The exact mkdtemp path is retained, never derived from user input.
    const absolute = path.resolve(root)
    if (
      path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
      !path.basename(absolute).startsWith("aah-magpie-e2e-")
    )
      throw new Error("Unexpected disposable backend directory")
    await fs.rm(absolute, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    })
    stopped = true
  }
  try {
    const listener = net.createServer()
    listener.listen(0, "127.0.0.1")
    await once(listener, "listening")
    const port = listener.address().port
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    )
    for (const dir of ["config", "data", "cache"])
      await fs.mkdir(path.join(root, dir))
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(
      path.resolve(binary),
      ["web", "--addr", `127.0.0.1:${port}`, "--no-open"],
      {
        cwd: root,
        env: makeMagpieProcessEnv(process.env, root, webKey),
        windowsHide: true,
        stdio: "ignore",
      },
    )
    exited = new Promise((resolve) => {
      child.once("exit", resolve)
      child.once("error", resolve)
    })
    let spawnError
    child.once("error", (error) => {
      spawnError = error
    })
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (spawnError)
        throw new Error("Cannot start Magpie binary", { cause: spawnError })
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error("Magpie exited before becoming ready")
      const response = await fetch(`${baseUrl}/`, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null)
      if (response?.status === 401)
        return { config: { baseUrl, webKey }, stop, root }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error("Magpie readiness timed out")
  } catch (error) {
    try {
      await stop()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Magpie startup and cleanup failed",
      )
    }
    throw error
  }
}
