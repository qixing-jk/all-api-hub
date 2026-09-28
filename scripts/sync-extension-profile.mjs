#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

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

function copyRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
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
  fs.mkdirSync(devProfileDir, { recursive: true })

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

  // 1. 同步扩展数据
  const dstSettingsBase = path.join(devProfileDir, "Local Extension Settings")
  fs.mkdirSync(dstSettingsBase, { recursive: true })

  let targetIds = []
  try {
    targetIds = fs
      .readdirSync(dstSettingsBase, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    /* ignore */
  }

  // 默认补上常用 dev ID
  if (!targetIds.includes("ilmdkchpeoeeehbkcejjkblilohglfnp")) {
    targetIds.push("ilmdkchpeoeeehbkcejjkblilohglfnp")
  }

  for (const id of targetIds) {
    const targetDir = path.join(dstSettingsBase, id)
    fs.rmSync(targetDir, { recursive: true, force: true })
    copyRecursive(bestSource.extPath, targetDir)
    console.log(`   -> 成功同步到开发扩展: ${id}`)
  }

  console.log(`\n🎉 扩展账户数据同步成功！所有中转站配置已写入共享开发沙盒。`)

  // 2. Cookie 同步（可选）
  if (includeCookies) {
    console.log(`\n正在尝试同步网页 Cookies...`)
    const srcCookies = path.join(
      bestSource.rootPath,
      bestSource.profileName,
      "Network",
      "Cookies",
    )
    const dstCookies = path.join(devProfileDir, "Network", "Cookies")
    const srcLocalState = path.join(bestSource.rootPath, "Local State")
    const dstLocalState = path.join(devBaseDir, "Local State")

    try {
      if (fs.existsSync(srcLocalState)) {
        fs.copyFileSync(srcLocalState, dstLocalState)
      }
      fs.mkdirSync(path.dirname(dstCookies), { recursive: true })
      fs.copyFileSync(srcCookies, dstCookies)
      console.log(`✅ 网页 Cookies 同步完成！`)
    } catch (err) {
      console.warn(
        `⚠️ 无法直接读取 Cookies（通常因为日常浏览器正在打开并锁定了该文件）: ${err.message}`,
      )
      console.warn(
        `提示：如需同步 Cookies，可短暂关闭日常浏览器 2 秒后再带 --cookies 运行。`,
      )
    }
  } else {
    console.log(
      `\n💡 提示：如需连同网页端 Cookie 登录态一并同步，请加参数: --cookies`,
    )
  }
}

main().catch((err) => {
  console.error("同步失败:", err)
  process.exit(1)
})
