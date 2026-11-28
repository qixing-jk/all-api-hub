import { appendFileSync } from "node:fs"

const chromeVersions = [
  "114", // Support floor for the sidePanel API declared in the manifest.
  "116", // sidePanel.open and MV3 service worker lifetime changes.
  "120", // Aligns chrome.alarms with the 30-second worker lifecycle.
  "122", // Broader Promise support for asynchronous extension APIs.
  "144", // Reports of extension messaging compatibility issues.
  "147", // Last checkpoint before the native browser namespace rollout.
  "148", // Native browser namespace and Promise-returning onMessage.
  "stable", // Version users are most likely to auto-update to.
]
const shards = [1, 2, 3]

function select(input = "all", supported, label) {
  if (input.trim() === "all") return supported

  const requested = new Set(input.split(",").map((value) => value.trim()))
  const selected = supported.filter((value) => requested.has(String(value)))
  if (selected.length !== requested.size) {
    console.error(
      `Invalid ${label} ${JSON.stringify(input)}. Use all or a comma-separated list of ${supported.join(", ")}.`,
    )
    process.exit(1)
  }
  return selected
}

const matrix = JSON.stringify({
  chrome_version: select(process.argv[2], chromeVersions, "Chrome versions"),
  shard: select(process.argv[3], shards, "shards"),
})

const outputFile = process.env.GITHUB_OUTPUT
if (outputFile) {
  appendFileSync(outputFile, `matrix=${matrix}\n`, "utf8")
} else {
  console.log(matrix)
}
