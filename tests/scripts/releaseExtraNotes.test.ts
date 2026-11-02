import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

const bash =
  process.platform === "win32"
    ? path.resolve(
        execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(),
        "../../../bin/bash.exe",
      )
    : "bash"

const STABLE_ASSETS = [
  "all-api-hub-4.8.0-chrome.zip",
  "all-api-hub-4.8.0-firefox.zip",
  "all-api-hub-4.8.0-safari-xcode-bundle.zip",
  "all-api-hub-4.8.0-safari.zip",
  "all-api-hub-4.8.0-sources.zip",
  "all-api-hub-chrome.crx",
  "updates.xml",
]

/**
 * Run the release-notes script against a stubbed `gh` so the generated appendix
 * can be inspected without touching a real release.
 */
function generateAppendix(tag: string, assets: string[]): string {
  const fixture = mkdtempSync(path.join(tmpdir(), "aah-release-extra-"))
  try {
    const script = readFileSync("scripts/update-release-extra-notes.sh", "utf8")
    writeFileSync(path.join(fixture, "notes.sh"), script)

    const releaseJson = JSON.stringify({
      body: "",
      assets: assets.map((name) => ({ name })),
    })
    execFileSync(
      bash,
      [
        "-e",
        "-c",
        `
        gh() {
          case "$1 $2" in
            "release view")
              if [ "$6" = "--json" ] && [ "$7" = "body,assets" ]; then
                printf '%s\\n' "$TEST_RELEASE_JSON"
              elif [ "$6" = "--json" ] && [ "$7" = "body" ]; then
                printf ''
              else
                printf 'release\\n'
              fi
              ;;
            "release edit")
              cp "$7" edited.md
              ;;
            *) printf 'unexpected gh %s\\n' "$*" >&2; exit 1 ;;
          esac
        }
        export -f gh
        bash notes.sh "$TEST_TAG"
      `,
      ],
      {
        cwd: fixture,
        env: {
          ...process.env,
          GH_REPO: "fixture/repo",
          DOCS_BASE_URL: "https://all-api-hub.qixing1217.top",
          TEST_RELEASE_JSON: releaseJson,
          TEST_TAG: tag,
        },
        stdio: "pipe",
      },
    )

    return readFileSync(path.join(fixture, "edited.md"), "utf8")
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

/**
 * Position of `needle` within `haystack`, or -1.
 */
function indexOf(haystack: string, needle: string): number {
  return haystack.indexOf(needle)
}

it("keeps the store as the first recommendation for stable releases", () => {
  const appendix = generateAppendix("v4.8.0", STABLE_ASSETS)

  expect(appendix).toContain("优先使用 Chrome 商店")
  expect(appendix).toContain("优先使用 Edge 商店")
  expect(appendix).toContain("优先使用 Firefox Add-ons")

  // The store links must come before any GitHub asset is described, so a reader
  // scanning the release notes sees the store as the first choice.
  const storeIndex = indexOf(appendix, "优先使用 Chrome 商店")
  const crxIndex = indexOf(appendix, "`all-api-hub-chrome.crx`：")
  const zipIndex = indexOf(appendix, "`all-api-hub-4.8.0-chrome.zip`：")
  expect(storeIndex).toBeGreaterThan(-1)
  expect(crxIndex).toBeGreaterThan(storeIndex)
  expect(zipIndex).toBeGreaterThan(storeIndex)

  // The .crx guidance is framed as the GitHub attachment recommendation, not
  // as a replacement for the store.
  expect(appendix).toContain("必须用 GitHub 附件时，Chromium 浏览器推荐安装")
  expect(appendix).toContain("商店版不需要任何额外配置")
})

it("presents the self-updating .crx as the recommended GitHub asset", () => {
  const appendix = generateAppendix("v4.8.0", STABLE_ASSETS)

  expect(appendix).toContain("all-api-hub-chrome.crx")
  expect(appendix).toContain("自动获取新版本")
  expect(appendix).toContain("GitHub 附件中的推荐选项")
  expect(appendix).toContain("不会自动更新")

  // The .crx is described before the unpacked zip so users reading top-down
  // pick the self-updating build first.
  const crxIndex = indexOf(appendix, "`all-api-hub-chrome.crx`：")
  const zipIndex = indexOf(appendix, "`all-api-hub-4.8.0-chrome.zip`：")
  expect(crxIndex).toBeGreaterThan(-1)
  expect(zipIndex).toBeGreaterThan(-1)
  expect(crxIndex).toBeLessThan(zipIndex)
})

it("links the Chromium self-update guide", () => {
  const appendix = generateAppendix("v4.8.0", STABLE_ASSETS)

  expect(appendix).toContain(
    "https://all-api-hub.qixing1217.top/chromium-crx-self-update.html",
  )
})

it("keeps the nightly notice for pre-releases", () => {
  const appendix = generateAppendix("nightly", [
    "all-api-hub-nightly-chrome.crx",
    "all-api-hub-nightly-chrome.zip",
    "updates.xml",
  ])

  expect(appendix).toContain("当前为 Nightly 预发布")
  expect(appendix).toContain("all-api-hub-nightly-chrome.crx")
})

it("recommends the available ZIP when a release has no CRX", () => {
  const appendix = generateAppendix("v4.8.0", ["all-api-hub-4.8.0-chrome.zip"])
  expect(appendix).not.toContain("推荐安装 `all-api-hub-chrome.crx`")
  expect(appendix).toContain("当前发布未提供 `.crx`")
})
