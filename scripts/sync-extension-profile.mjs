import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { replaceProfileDatabase } from "./cdp/profile-database-copy.mjs"

// 已知官方发布的扩展 ID 列表
const KNOWN_STORE_IDS = [
  "abffolffkoejhapkgkmmaaijafghclom", // Edge Addons
  "ilmdkchpeoeeehbkcejjkblilohglfnp", // 常见开发版 ID
]

/**
 * 跨平台解析共享开发 Profile 路径
 */
function resolveSharedDevProfile() {
  if (process.env.AAH_DEV_PROFILE_DIR) {
    return path.resolve(process.env.AAH_DEV_PROFILE_DIR)
  }

  const platform = os.platform()
  const home = os.homedir()

  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    return path.join(localAppData, "AllApiHub", "dev-browser")
  } else if (platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "AllApiHub",
      "dev-browser",
    )
  } else {
    return path.join(home, ".config", "all-api-hub", "dev-browser")
  }
}

/**
 * 获取系统中所有可能的主力浏览器 User Data 目录列表
 */
function getSystemUserDataCandidates() {
  const platform = os.platform()
  const home = os.homedir()
  const candidates = []

  if (process.env.AAH_SOURCE_USER_DATA_DIR) {
    candidates.push({
      browser: "Custom",
      path: path.resolve(process.env.AAH_SOURCE_USER_DATA_DIR),
    })
  }

  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    candidates.push(
      {
        browser: "Microsoft Edge",
        path: path.join(localAppData, "Microsoft\\Edge\\User Data"),
      },
      {
        browser: "Google Chrome",
        path: path.join(localAppData, "Google\\Chrome\\User Data"),
      },
      {
        browser: "Brave",
        path: path.join(
          localAppData,
          "BraveSoftware\\Brave-Browser\\User Data",
        ),
      },
    )
  } else if (platform === "darwin") {
    candidates.push(
      {
        browser: "Microsoft Edge",
        path: path.join(home, "Library/Application Support/Microsoft Edge"),
      },
      {
        browser: "Google Chrome",
        path: path.join(home, "Library/Application Support/Google/Chrome"),
      },
      {
        browser: "Brave",
        path: path.join(
          home,
          "Library/Application Support/BraveSoftware/Brave-Browser",
        ),
      },
    )
  } else {
    candidates.push(
      {
        browser: "Microsoft Edge",
        path: path.join(home, ".config/microsoft-edge"),
      },
      {
        browser: "Google Chrome",
        path: path.join(home, ".config/google-chrome"),
      },
      { browser: "Chromium", path: path.join(home, ".config/chromium") },
    )
  }

  return candidates.filter((c) => fs.existsSync(c.path))
}

/**
 * 递归计算文件夹大小
 */
function getDirSize(dir) {
  let size = 0
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    for (const f of files) {
      const full = path.join(dir, f.name)
      if (f.isDirectory()) {
        size += getDirSize(full)
      } else {
        size += fs.statSync(full).size
      }
    }
  } catch {
    /* ignore */
  }
  return size
}

/**
 * 检查一个 LevelDB 存储目录是否包含 All API Hub 的数据 (含有 site_accounts)
 */
function hasAllApiHubData(extDir) {
  try {
    const files = fs.readdirSync(extDir)
    for (const file of files) {
      if (file.endsWith(".log") || file.endsWith(".ldb")) {
        const filePath = path.join(extDir, file)
        const stat = fs.statSync(filePath)
        if (stat.size > 0 && stat.size < 50 * 1024 * 1024) {
          const content = fs.readFileSync(filePath, "latin1")
          if (
            content.includes("site_accounts") ||
            content.includes("api_credential_profiles")
          ) {
            return true
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * 自动全盘扫描，找到哪个浏览器哪个 Profile 里存有 All API Hub 的账户数据
 */
function autoDiscoverSourceExtensionData(preferredProfileName, preferredExtId) {
  const browserRoots = getSystemUserDataCandidates()
  const results = []

  for (const { browser, path: rootPath } of browserRoots) {
    let entries = []
    try {
      entries = fs.readdirSync(rootPath, { withFileTypes: true })
    } catch {
      continue
    }

    const profileDirs = entries
      .filter(
        (e) =>
          e.isDirectory() &&
          (e.name === "Default" || e.name.startsWith("Profile ")),
      )
      .map((e) => e.name)

    for (const profileName of profileDirs) {
      if (
        preferredProfileName &&
        profileName.toLowerCase() !== preferredProfileName.toLowerCase()
      ) {
        continue
      }

      const settingsDir = path.join(
        rootPath,
        profileName,
        "Local Extension Settings",
      )
      if (!fs.existsSync(settingsDir)) continue

      let extDirs = []
      try {
        extDirs = fs
          .readdirSync(settingsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch {
        continue
      }

      for (const extId of extDirs) {
        if (
          preferredExtId &&
          extId.toLowerCase() !== preferredExtId.toLowerCase()
        ) {
          continue
        }
        const fullExtPath = path.join(settingsDir, extId)
        const isKnown = KNOWN_STORE_IDS.includes(extId)
        const hasData = isKnown || hasAllApiHubData(fullExtPath)

        if (hasData) {
          const size = getDirSize(fullExtPath)
          results.push({
            browser,
            rootPath,
            profileName,
            extId,
            extPath: fullExtPath,
            size,
          })
        }
      }
    }
  }

  // 按照数据大小降序排列，通常最大的就是包含所有真实中转站账号的主力 Profile
  results.sort((a, b) => b.size - a.size)
  return results
}

/** File databases must be copied only after browser processes have closed. */
function requireClosedBrowsers() {
  const processes =
    process.platform === "win32"
      ? execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Process -Name msedge,chrome,brave,chromium -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName; exit 0",
          ],
          { encoding: "utf8", windowsHide: true },
        )
      : execFileSync("ps", ["-A", "-o", "comm="], { encoding: "utf8" })
  if (/Microsoft Edge|msedge|chrome|chromium|brave/i.test(processes))
    throw new Error("请先关闭日常浏览器和开发浏览器，再同步数据库。")
}

async function main() {
  const args = process.argv.slice(2)
  const sourceProfileFlagIndex = args.indexOf("--source-profile")
  const preferredProfile =
    sourceProfileFlagIndex !== -1 ? args[sourceProfileFlagIndex + 1] : null
  const sourceExtFlagIndex = args.indexOf("--source-ext")
  const preferredExtId =
    sourceExtFlagIndex !== -1 ? args[sourceExtFlagIndex + 1] : null
  const includeCookies = args.includes("--cookies")

  console.log("==========================================")
  console.log("   All API Hub 账户与登录态通用同步工具   ")
  console.log("==========================================")

  const devBaseDir = resolveSharedDevProfile()
  const devProfileDir = path.join(devBaseDir, "Default")

  console.log(`目标开发 Profile: ${devProfileDir}`)
  console.log("正在全自动探测宿主浏览器中的 All API Hub 数据...")

  const discovered = autoDiscoverSourceExtensionData(
    preferredProfile,
    preferredExtId,
  )

  const isListOnly = args.includes("--list")

  if (isListOnly) {
    console.log("\n🔎 当前系统中发现的所有 All API Hub 数据源:")
    discovered.forEach((item, idx) => {
      console.log(
        `   (${idx + 1}) [${item.browser}] Profile: ${item.profileName} | 扩展ID: ${item.extId} | 数据大小: ${(item.size / 1024).toFixed(2)} KB`,
      )
    })
    console.log("\n提示: 可使用 --source-profile <Profile名称> 指定同步源。")
    process.exit(0)
  }

  console.log(
    `\n🔎 探测到 ${discovered.length} 个包含 All API Hub 数据的配置源:`,
  )
  discovered.forEach((item, idx) => {
    const isSelected = idx === 0 ? "👉 [选中]" : "   "
    console.log(
      `${isSelected} (${idx + 1}) [${item.browser}] Profile: ${item.profileName} | 扩展ID: ${item.extId} | 大小: ${(item.size / 1024).toFixed(2)} KB`,
    )
  })

  const bestSource = discovered[0]
  if (!bestSource) {
    console.error(
      "❌ 未发现任何 All API Hub 数据源，请检查 --source-profile / --source-ext，或确保已在主机浏览器登录扩展。",
    )
    process.exit(1)
  }

  if (!preferredProfile && discovered.length > 1) {
    console.log(
      `\n💡 提示: 默认选用体积最大的源。如需切换，可加参数: --source-profile "${discovered[1].profileName}"`,
    )
  }

  console.log(
    `\n✅ 开始同步源数据: [${bestSource.browser}] -> ${bestSource.profileName} (${bestSource.extId})`,
  )

  requireClosedBrowsers()
  const dstSettingsBase = path.join(devProfileDir, "Local Extension Settings")
  fs.mkdirSync(dstSettingsBase, { recursive: true })
  const targetIds = fs
    .readdirSync(dstSettingsBase, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        /^[a-p]{32}$/.test(entry.name) &&
        (KNOWN_STORE_IDS.includes(entry.name) ||
          hasAllApiHubData(path.join(dstSettingsBase, entry.name))),
    )
    .map((entry) => entry.name)
  const devId = "ilmdkchpeoeeehbkcejjkblilohglfnp"
  if (!targetIds.includes(devId)) targetIds.push(devId)
  for (const id of targetIds) {
    const backup = replaceProfileDatabase(
      bestSource.extPath,
      path.join(dstSettingsBase, id),
    )
    console.log(
      `   -> 已同步开发扩展 ${id}${backup ? `，备份: ${backup}` : ""}`,
    )
  }
  if (includeCookies) {
    const sourceProfile = path.join(bestSource.rootPath, bestSource.profileName)
    const cookies = path.join(sourceProfile, "Network", "Cookies")
    if (
      fs.existsSync(`${cookies}-wal`) &&
      fs.statSync(`${cookies}-wal`).size > 0
    )
      throw new Error("cookie_database_has_pending_writes")
    fs.mkdirSync(path.join(devProfileDir, "Network"), { recursive: true })
    // Preserve previous encryption metadata and cookie data before replacing them.
    for (const [source, target] of [
      [
        path.join(bestSource.rootPath, "Local State"),
        path.join(devBaseDir, "Local State"),
      ],
      [cookies, path.join(devProfileDir, "Network", "Cookies")],
    ]) {
      if (fs.existsSync(target))
        fs.copyFileSync(target, `${target}.backup-${Date.now()}`)
      fs.copyFileSync(source, target)
    }
  }
  if (
    includeCookies ||
    args.includes("--storage") ||
    args.includes("--local-storage")
  ) {
    replaceProfileDatabase(
      path.join(
        bestSource.rootPath,
        bestSource.profileName,
        "Local Storage",
        "leveldb",
      ),
      path.join(devProfileDir, "Local Storage", "leveldb"),
    )
    console.log("✅ 网页 Local Storage 完整快照已同步。")
  }
  console.log("✅ 所有请求的同步步骤已完成；原有目标数据库备份已保留。")

  if (
    !includeCookies &&
    !args.includes("--storage") &&
    !args.includes("--local-storage")
  ) {
    console.log(
      `\n💡 提示：如需连同网页端 Cookie 和 Local Storage 登录态一并同步，请加参数: --cookies`,
    )
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("同步失败:", err.message)
    process.exitCode = 1
  })
}
