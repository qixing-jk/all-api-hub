// Research reproducer: capture installed clients against a loopback-only receiver.
// Requires installed Codex and/or Claude Code. Sends no requests to a model service.
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const output = path.resolve(
  ".scratch/cli-request-simulation/artifacts/client-capture",
)
await mkdir(output, { recursive: true })
const cwd = await mkdtemp(path.join(tmpdir(), "aah-cli-capture-"))
const key = "aah-loopback-capture-only"
const selected = process.argv[2] ?? "codex"
const captured = []
const receiver = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString("utf8")
  captured.push({
    method: request.method,
    path: request.url,
    headers: Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [
        name,
        /authorization|api-key|cookie/i.test(name)
          ? "[SYNTHETIC REDACTED]"
          : value,
      ]),
    ),
    body: (() => {
      try {
        return JSON.parse(body)
      } catch {
        return body
      }
    })(),
  })
  response.writeHead(401, { "content-type": "application/json" })
  response.end(
    JSON.stringify({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Loopback capture complete",
      },
    }),
  )
})
await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${receiver.address().port}`
const env = { ...process.env }
for (const name of Object.keys(env)) {
  if (/^(?:ANTHROPIC|CLAUDE|OPENAI|GOOGLE|GEMINI)_/.test(name)) delete env[name]
}
let executable, args
if (selected === "codex") {
  executable = process.execPath
  const entry = require.resolve("@openai/codex/bin/codex.js", {
    paths: [process.env.CODEX_MANAGED_PACKAGE_ROOT ?? process.cwd()],
  })
  env.AAH_CLI_CAPTURE_KEY = key
  args = [
    entry,
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "-m",
    "gpt-5.4",
    "-c",
    'model_provider="loopback"',
    "-c",
    'model_providers.loopback.name="Loopback"',
    "-c",
    `model_providers.loopback.base_url="${origin}/v1"`,
    "-c",
    'model_providers.loopback.wire_api="responses"',
    "-c",
    'model_providers.loopback.env_key="AAH_CLI_CAPTURE_KEY"',
    "-c",
    "model_providers.loopback.requires_openai_auth=false",
    "Reply with exactly OK. Do not call tools.",
  ]
} else if (selected === "claude") {
  executable =
    process.env.AAH_CAPTURE_CLAUDE_PATH ??
    path.join(process.env.USERPROFILE, ".local/bin/claude.exe")
  env.ANTHROPIC_BASE_URL = origin
  env.ANTHROPIC_API_KEY = key
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"
  args = [
    "--bare",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
    "--tools",
    "",
    "--model",
    "claude-sonnet-4-6",
    "--print",
    "Reply with exactly OK.",
  ]
} else throw new Error("Expected codex or claude")
let childOutput = ""
const child = spawn(executable, args, {
  cwd,
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
})
child.stdout.on("data", (chunk) => {
  childOutput += chunk
})
child.stderr.on("data", (chunk) => {
  childOutput += chunk
})
const timer = setTimeout(() => child.kill(), 45_000)
try {
  const code = await new Promise((resolve, reject) => {
    child.once("exit", resolve)
    child.once("error", reject)
  })
  await writeFile(
    path.join(output, `${selected}.json`),
    JSON.stringify(
      {
        selected,
        capturedAt: new Date().toISOString(),
        exitCode: code,
        requests: captured,
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(output, `${selected}.log`),
    childOutput.split(key).join("[SYNTHETIC REDACTED]"),
  )
  console.log(
    JSON.stringify({
      selected,
      exitCode: code,
      requests: captured.map((item) => ({
        method: item.method,
        path: item.path,
        headers: item.headers,
        bodyKeys: Object.keys(item.body ?? {}),
      })),
      output,
      temporaryCwd: cwd,
    }),
  )
} finally {
  clearTimeout(timer)
  receiver.closeAllConnections()
  await new Promise((resolve) => receiver.close(resolve))
}
