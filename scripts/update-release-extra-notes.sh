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
  if (/chrome\.zip$/i.test(name)) return 10
  if (/firefox\.zip$/i.test(name)) return 20
  if (/sources\.zip$/i.test(name)) return 30
  if (/safari-xcode-bundle\.zip$/i.test(name)) return 40
  if (/safari\.zip$/i.test(name)) return 50
  return 100
}

const describeAsset = (name) => {
  if (/chrome\.zip$/i.test(name)) {
    return "Chromium 内核浏览器手动安装包。普通用户请优先安装 Chrome 商店或 Edge 商店版本；仅在无法使用商店版、需要临时验证修复或调试时下载此文件。"
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
    : "> 当前为正式版 Stable。大多数用户建议优先使用商店版，以获得更简单的安装流程和自动更新；GitHub 附件主要作为无法使用商店版时的备选。",
  "",
  "### 优先安装方式",
  `- Chrome：优先使用 Chrome 商店，${chromeStoreUrl}`,
  `- Edge：优先使用 Edge 商店，${edgeStoreUrl}`,
  `- Firefox：优先使用 Firefox Add-ons，${firefoxStoreUrl}`,
  `- Safari：暂无通用商店版，请按 Safari 安装指南手动安装，${docsBaseUrl}/safari-install.html`,
  "",
  "### 使用说明",
  "- 大多数用户：Chrome / Edge / Firefox 优先从上方商店链接安装；商店版安装更直接，并会跟随浏览器自动更新。",
  "- GitHub 附件：适合无法使用商店版、需要临时验证已发布修复、调试问题，或使用商店暂未覆盖的浏览器环境。",
  "- 手动安装版通常不会自动更新；如果你通过 GitHub 附件安装，建议 Star / Watch 仓库，以便及时看到新版本发布通知。",
  "- Chrome / Edge / Kiwi 等 Chromium 浏览器：如确需手动安装，下载 `*-chrome.zip`，先解压，再在扩展管理页选择“加载已解压的扩展程序”。",
  "- Firefox：优先使用 Firefox Add-ons 商店；`*-firefox.zip` 与 `*-sources.zip` 更适合高级用户、自行验证或发布流程使用。",
  "- Safari：请下载 `*-safari-xcode-bundle.zip`，解压后直接打开其中的 Xcode 工程；不要只下载 `*-safari.zip`。",
  "",
  "### 文档链接",
  `- 快速上手：${docsBaseUrl}/get-started.html`,
  `- 安装与更新说明：${docsBaseUrl}/extension-update-install.html`,
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
