#!/usr/bin/env bash

set -euo pipefail

RELEASE_TAG="${1:-${RELEASE_TAG:-}}"
REPOSITORY="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
DOCS_BASE_URL="${DOCS_BASE_URL:-https://all-api-hub.qixing1217.top}"

if [ -z "$RELEASE_TAG" ]; then
  echo "RELEASE_TAG is required." >&2
  exit 1
fi

if [ -z "$REPOSITORY" ]; then
  echo "GH_REPO or GITHUB_REPOSITORY is required." >&2
  exit 1
fi

release_json="$(gh release view "$RELEASE_TAG" --repo "$REPOSITORY" --json body,assets)"

appendix_file="$(mktemp)"
current_body_file="$(mktemp)"
combined_file="$(mktemp)"

cleanup() {
  rm -f "$appendix_file" "$current_body_file" "$combined_file"
}
trap cleanup EXIT

export RELEASE_JSON="$release_json"
export RELEASE_TAG
export DOCS_BASE_URL

node --input-type=module <<'EOF' > "$appendix_file"
const release = JSON.parse(process.env.RELEASE_JSON ?? "{}")
const releaseTag = process.env.RELEASE_TAG ?? ""
const docsBaseUrl = (process.env.DOCS_BASE_URL ?? "").replace(/\/+$/, "")
const isNightly = releaseTag === "nightly"
const chromeStoreUrl =
  "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo"
const edgeStoreUrl =
  "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa"
const firefoxStoreUrl =
  "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}"

const assetNames = Array.isArray(release.assets)
  ? release.assets
      .map((asset) => asset?.name)
      .filter((name) => typeof name === "string" && name.length > 0)
  : []

const assetOrder = (name) => {
  if (/chrome\.crx$/i.test(name)) return 10
  if (/chrome\.zip$/i.test(name)) return 15
  if (/firefox\.zip$/i.test(name)) return 20
  if (/sources\.zip$/i.test(name)) return 30
  if (/safari-xcode-bundle\.zip$/i.test(name)) return 40
  if (/safari\.zip$/i.test(name)) return 50
  if (/^updates\.xml$/i.test(name)) return 60
  return 100
}

const describeAsset = (name) => {
  if (/chrome\.crx$/i.test(name)) {
    return "Chromium 自更新安装包，GitHub 附件中的推荐选项。安装后浏览器会按 `updates.xml` 自动获取新版本，无需每次重新下载；stock Chrome / Edge 安装前需要按文档配置一次扩展白名单策略（Linux 无需配置）。"
  }

  if (/chrome\.zip$/i.test(name)) {
    return "Chromium 内核浏览器解压加载包。不会自动更新，每次升级都要重新下载并重新加载；仅在 `.crx` 装不上时使用。"
  }

  if (/^updates\.xml$/i.test(name)) {
    return "自更新清单，供已安装的 `.crx` 版本检查新版本；普通用户无需直接下载。"
  }

  if (/firefox\.zip$/i.test(name)) {
    return "Firefox 构建包。普通用户优先使用 Firefox Add-ons 商店；这个附件更适合高级用户自行验证、调试或配合发布流程使用。"
  }

  if (/sources\.zip$/i.test(name)) {
    return "Firefox 发布/审核用源码包，通常不是普通用户直接安装的附件。"
  }

  if (/safari-xcode-bundle\.zip$/i.test(name)) {
    return "Safari 手动运行推荐包。Safari 暂无通用商店版入口；需要 Safari 版本时，请下载此文件并打开其中的 Xcode 工程运行。"
  }

  if (/safari\.zip$/i.test(name)) {
    return "Safari 原始构建包，通常作为 Xcode 工程生成输入使用；普通用户不要单独下载这个文件。"
  }

  return "发布附件。"
}

const lines = [
  "<!-- all-api-hub-release-extra:start -->",
  "## 附加说明",
  "",
  isNightly
    ? "> 当前为 Nightly 预发布，基于 `main` 最新提交自动生成。大多数用户仍建议优先使用商店版；Nightly 仅适合提前验证修复或协助测试。"
    : "> 当前为正式版 Stable。大多数用户建议优先使用商店版，安装最简单且无需任何策略配置；GitHub 附件作为无法使用商店版时的备选。",
  "",
  "### 优先安装方式",
  `- Chrome：优先使用 Chrome 商店，${chromeStoreUrl}`,
  `- Edge：优先使用 Edge 商店，${edgeStoreUrl}`,
  `- Firefox：优先使用 Firefox Add-ons，${firefoxStoreUrl}`,
  `- Safari：暂无通用商店版，请按 Safari 安装指南手动安装，${docsBaseUrl}/safari-install.html`,
  "",
  "### 使用说明",
  "- 大多数用户：Chrome / Edge / Firefox 优先从上方商店链接安装，商店版不需要任何额外配置。",
  "- 必须用 GitHub 附件时，Chromium 浏览器推荐安装 `all-api-hub-chrome.crx`（Nightly 为 `all-api-hub-nightly-chrome.crx`）：它会按 `updates.xml` 自动更新，不用每次重新下载。具体是哪些浏览器、以及 stock Chrome / Edge 的一次性白名单配置，见下方「Chromium 自更新安装」。",
  "- `*-chrome.zip` 解压加载包不会自动更新，每次升级都要重新下载并重新加载，仅在 `.crx` 装不上时使用。",
  "- Firefox：请使用 Firefox Add-ons 商店；GitHub 附件里的 `*-firefox.zip` 不会自动更新，更适合高级用户自行验证或配合发布流程使用。",
  "- Safari：请下载 `*-safari-xcode-bundle.zip`，解压后直接打开其中的 Xcode 工程；不要只下载 `*-safari.zip`。",
  "",
  "### 文档链接",
  `- 快速上手：${docsBaseUrl}/get-started.html`,
  `- 安装与更新说明：${docsBaseUrl}/extension-update-install.html`,
  `- Chromium 自更新安装（.crx）：${docsBaseUrl}/chromium-crx-self-update.html`,
  `- 常见问题：${docsBaseUrl}/faq.html`,
  `- 更新日志：${docsBaseUrl}/changelog.html`,
]

lines.push("", "### 产物说明")

if (assetNames.length === 0) {
  lines.push("- 当前 release 暂未检测到附件。")
} else {
  assetNames
    .sort((left, right) => {
      const delta = assetOrder(left) - assetOrder(right)
      return delta !== 0 ? delta : left.localeCompare(right)
    })
    .forEach((name) => {
      lines.push(`- \`${name}\`：${describeAsset(name)}`)
    })
}

lines.push("<!-- all-api-hub-release-extra:end -->")

process.stdout.write(`${lines.join("\n")}\n`)
EOF

gh release view "$RELEASE_TAG" --repo "$REPOSITORY" --json body --jq ".body" > "$current_body_file"

perl -0pi -e 's/\n?<!-- all-api-hub-release-extra:start -->.*?<!-- all-api-hub-release-extra:end -->\n?//s' "$current_body_file"

cp "$current_body_file" "$combined_file"

if grep -q '[^[:space:]]' "$combined_file"; then
  printf '\n\n' >> "$combined_file"
else
  : > "$combined_file"
fi

cat "$appendix_file" >> "$combined_file"

gh release edit "$RELEASE_TAG" --repo "$REPOSITORY" --notes-file "$combined_file"
