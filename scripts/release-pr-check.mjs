import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

/** Only exempt release metadata; unexpected changes retain the normal CI gates. */
export function isReleaseOnly({ eventName, repository, pullRequest, git }) {
  if (
    eventName !== "pull_request" ||
    pullRequest?.head?.repo?.full_name !== repository ||
    !pullRequest?.head?.ref?.startsWith("release-please--branches--")
  ) {
    return false
  }

  // PR diffs start at the merge base, which can precede the current base tip.
  const head = pullRequest.head.sha
  const base = git(["merge-base", pullRequest.base.sha, head]).trim()
  const changes = git(["diff", "--name-status", "-z", base, head])
    .split("\0")
    .filter(Boolean)
  if (!changes.length || changes.length % 2 !== 0) return false

  const paths = []
  for (let index = 0; index < changes.length; index += 2) {
    if (
      changes[index] !== "M" ||
      !["CHANGELOG.md", "package.json"].includes(changes[index + 1])
    ) {
      return false
    }
    paths.push(changes[index + 1])
  }
  if (!paths.includes("package.json")) return false

  const before = JSON.parse(git(["show", `${base}:package.json`]))
  const after = JSON.parse(git(["show", `${head}:package.json`]))
  const { version: oldVersion, ...oldPackage } = before
  const { version: newVersion, ...newPackage } = after
  const versionPattern = /^\d+\.\d+\.\d+$/
  return (
    typeof oldVersion === "string" &&
    typeof newVersion === "string" &&
    versionPattern.test(oldVersion) &&
    versionPattern.test(newVersion) &&
    oldVersion !== newVersion &&
    isDeepStrictEqual(oldPackage, newPackage)
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let releaseOnly = false
  try {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    )
    releaseOnly = isReleaseOnly({
      eventName: process.env.GITHUB_EVENT_NAME,
      repository: process.env.GITHUB_REPOSITORY,
      pullRequest: event.pull_request,
      git: (args) => execFileSync("git", args, { encoding: "utf8" }),
    })
  } catch {
    console.warn(
      "Could not verify release-only changes; running normal checks.",
    )
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `release-only=${releaseOnly}\n`)
  const summary = releaseOnly
    ? "Verified release metadata only: skipping heavy PR checks."
    : "Running normal checks: this is not a verified version-only release PR."
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  }
}
