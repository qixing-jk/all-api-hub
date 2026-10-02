import { loadLocalEnv } from "../utils/local-env.mjs"

// Diagnostics expose only source paths, never parsed keys or credential values.
try {
  console.log(JSON.stringify(loadLocalEnv(), null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
