import { startTurnstileTestServer } from "./fixtures/turnstile-server.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()
const port = Number(process.env.AAH_TURNSTILE_PORT || 8787)
if (!Number.isInteger(port) || port < 1024 || port > 65533) {
  throw new Error(
    "AAH_TURNSTILE_PORT must be an integer between 1024 and 65533",
  )
}
const servers = []
try {
  for (let offset = 0; offset < 3; offset++) {
    servers.push(await startTurnstileTestServer({ port: port + offset }))
  }
} catch (error) {
  await Promise.all(servers.map((server) => server.close()))
  throw error
}
console.log("Official Turnstile test server ready:")
for (const server of servers) console.log(`  ${server.origin}`)
console.log(
  "In the dev extension: Settings → Refresh → Website verification assistance → Development trigger.",
)
console.log(
  "Choose a Turnstile preset. Enable In-page reminders to test the three-site queue. Ctrl+C stops the servers.",
)
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await Promise.all(servers.map((server) => server.close()))
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
