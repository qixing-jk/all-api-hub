#!/usr/bin/env node
import { execFileSync, execSync, spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  assertDevBrowserProfile,
  ensureDevExtensionReady,
} from "./cdp/browser-runtime.mjs"
import {
  buildDevBrowserIdentity,
  deriveUnpackedExtensionId,
  prepareDevBrowserProfile,
  skippedDevBrowserPreparation,
  waitForUserDataDirRelease,
} from "./cdp/dev-browser-identity.mjs"
import {
  classifyDevProfiles,
  describeBytes,
  devProfilesBaseDir,
  formatDebugBrowserReport,
  listDebugBrowserProcesses,
  planProfileCleanup,
  pruneProfileCaches,
  removeProfileDir,
} from "./cdp/dev-browser-registry.mjs"
import {
  applyIsolateFlag,
  isIsolatedDevProfile,
  resolveCdpPort,
  resolveDevProfileDir,
} from "./cdp/dev-profile.mjs"
import { reloadRunningExtension } from "./cdp/reload.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

// `--isolate` must seed the environment before the module-level profile/port
// constants below are evaluated, because they are baked at import time.
applyIsolateFlag(process.argv)

const CDP_PORT = resolveCdpPort()
const WORKTREE_NAME = path.basename(rootDir)

/**
 * 1. 跨平台解析浏览器可执行文件路径
 */
function findBrowserExecutable() {
  if (
    process.env.AAH_BROWSER_PATH &&
    fs.existsSync(process.env.AAH_BROWSER_PATH)
  ) {
    return process.env.AAH_BROWSER_PATH
  }

  const platform = os.platform()
  const candidates = []

  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || ""
    const programFiles = process.env["ProgramFiles"] || "C:\\Program Files"
    const programFilesX86 =
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"

    candidates.push(
      path.join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localAppData, "Microsoft\\Edge\\Application\\msedge.exe"),
    )
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    )
  } else {
    candidates.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    )
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * 2. 跨平台解析开发 Profile 目录（共享或按 worktree 隔离）
 */
function resolveSharedDevProfile() {
  return resolveDevProfileDir()
}

/**
 * 3. 检查 TCP 端口是否正在监听
 */
function checkPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(400)
    socket.on("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.on("timeout", () => {
      socket.destroy()
      resolve(false)
    })
    socket.on("error", () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, "127.0.0.1")
  })
}

/**
 * 检查系统进程是否正在运行
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 4. 动态解析当前 worktree 产物中绑定的 WXT 开发服务器信息
 * 不写死 3000，从 .output/chrome-mv3-dev/options.html 或 manifest.json 提取实际分配的端口
 */
function detectDevServerInfo(devExtDir, customPort) {
  if (customPort) {
    return {
      url: `http://127.0.0.1:${customPort}`,
      port: Number(customPort),
      origin: `http://127.0.0.1:${customPort}`,
    }
  }

  const optionsHtml = path.join(devExtDir, "options.html")
  if (fs.existsSync(optionsHtml)) {
    try {
      const html = fs.readFileSync(optionsHtml, "utf8")
      const match = html.match(
        /src=["'](https?:\/\/(?:localhost|127\.0\.0\.1):(\d+))\//i,
      )
      if (match) {
        const port = Number(match[2])
        return {
          url: `http://127.0.0.1:${port}`,
          port,
          origin: `http://127.0.0.1:${port}`,
        }
      }
    } catch {
      /* ignore */
    }
  }

  const manifestJson = path.join(devExtDir, "manifest.json")
  if (fs.existsSync(manifestJson)) {
    try {
      const json = fs.readFileSync(manifestJson, "utf8")
      const match = json.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i)
      if (match) {
        const port = Number(match[1])
        return {
          url: `http://127.0.0.1:${port}`,
          port,
          origin: `http://127.0.0.1:${port}`,
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 默认探测 3000
  return {
    url: "http://127.0.0.1:3000",
    port: 3000,
    origin: "http://127.0.0.1:3000",
  }
}

/**
 * 5. 校验指定 URL 对应的 Vite/WXT 开发服务器是否真实存活且响应
 */
async function isDevServerAlive(serverUrl) {
  if (!serverUrl) return false
  const urlsToTest = [serverUrl]
  if (serverUrl.includes("localhost")) {
    urlsToTest.push(serverUrl.replace("localhost", "127.0.0.1"))
  } else if (serverUrl.includes("127.0.0.1")) {
    urlsToTest.push(serverUrl.replace("127.0.0.1", "localhost"))
  }

  for (const u of urlsToTest) {
    try {
      const res = await fetch(`${u}/@vite/client`, {
        signal: AbortSignal.timeout(600),
      })
      if (res.ok || res.status === 200 || res.status === 304) {
        return true
      }
    } catch {
      /* ignore */
    }
  }
  return false
}

/**
 * 自动在后台静默启动 WXT 开发服务器（如果未运行），并主动禁止其弹出 Chrome
 */
async function ensureDevServerRunning(root, customPort) {
  const devExtDir = path.join(root, ".output", "chrome-mv3-dev")
  const scratchDir = path.join(root, ".scratch")
  fs.mkdirSync(scratchDir, { recursive: true })
  const logFile = path.join(scratchDir, "wxt-dev.log")
  const pidFile = path.join(scratchDir, "wxt-dev.pid")

  // 1. 先探测是否已有活跃的开发服务器
  let candidateInfo = detectDevServerInfo(devExtDir, customPort)
  if (await isDevServerAlive(candidateInfo.url)) {
    return { ok: true, info: candidateInfo, newlySpawned: false }
  }

  // 备用端口快速扫描 (3000..3005)
  if (!customPort) {
    for (let p = 3000; p <= 3005; p++) {
      if (await isDevServerAlive(`http://127.0.0.1:${p}`)) {
        const info = {
          url: `http://127.0.0.1:${p}`,
          port: p,
          origin: `http://127.0.0.1:${p}`,
        }
        return { ok: true, info, newlySpawned: false }
      }
    }
  }

  // 2. 没有活跃 dev server，自动在后台静默启动
  console.log(`\n⚡ 未检测到运行中的 WXT 开发服务器，正在自动于后台静默启动...`)
  console.log(
    `🔇 已主动禁用 WXT 默认 Chrome 弹窗，日志将静默记录至 .scratch/wxt-dev.log`,
  )

  process.env.WXT_OPEN_BROWSER = "0"
  process.env.AAH_NO_BROWSER = "1"

  const wxtBin = path.join(root, "node_modules", "wxt", "bin", "wxt.mjs")
  const wxtArgs = [wxtBin, "--host", "127.0.0.1"]
  if (customPort) {
    wxtArgs.push("--port", String(customPort))
  }

  let spawnedPid = null
  if (os.platform() === "win32") {
    const helperScript = path.join(__dirname, "spawn-browser-windows.ps1")
    const payload = JSON.stringify({
      command: process.execPath,
      args: wxtArgs,
      stdoutFile: logFile,
      cwd: root,
      env: {
        WXT_OPEN_BROWSER: "0",
        AAH_NO_BROWSER: "1",
      },
    })
    try {
      const out = execFileSync(
        "pwsh",
        ["-NoProfile", "-File", helperScript, "-ConfigJson", payload],
        { encoding: "utf8" },
      )
      spawnedPid = Number(out.trim()) || null
    } catch {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-File", helperScript, "-ConfigJson", payload],
        { encoding: "utf8" },
      )
      spawnedPid = Number(out.trim()) || null
    }
  } else {
    const logFd = fs.openSync(logFile, "a")
    const child = spawn(process.execPath, wxtArgs, {
      cwd: root,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        AAH_NO_BROWSER: "1",
        WXT_OPEN_BROWSER: "0",
      },
    })
    spawnedPid = child.pid
    child.unref()
  }

  if (spawnedPid) {
    fs.writeFileSync(pidFile, String(spawnedPid), "utf8")
  }

  console.log(`⏳ 正在等待首轮预编译完成并就绪...`)

  // 3. 轮询等待 dev server 就绪
  const startTime = Date.now()
  const timeoutMs = 25000
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600))

    // 检查 options.html / manifest.json 写入
    candidateInfo = detectDevServerInfo(devExtDir, customPort)
    if (await isDevServerAlive(candidateInfo.url)) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(
        `✅ WXT 开发服务器已就绪 (${candidateInfo.url})，耗时 ${elapsed} 秒`,
      )
      return { ok: true, info: candidateInfo, newlySpawned: true }
    }

    // 备用端口扫描
    if (!customPort) {
      for (let p = 3000; p <= 3005; p++) {
        if (await isDevServerAlive(`http://127.0.0.1:${p}`)) {
          const info = {
            url: `http://127.0.0.1:${p}`,
            port: p,
            origin: `http://127.0.0.1:${p}`,
          }
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          console.log(
            `✅ WXT 开发服务器已就绪 (${info.url})，耗时 ${elapsed} 秒`,
          )
          return { ok: true, info, newlySpawned: true }
        }
      }
    }
  }

  console.warn(
    `⚠️ 等待 WXT 开发服务器就绪超时（详情可查看 .scratch/wxt-dev.log）。`,
  )
  return { ok: false, info: null, newlySpawned: false }
}

/**
 * 终止后台运行的 WXT 开发服务器
 */
function stopDevServer(root, customPort) {
  const pidFile = path.join(root, ".scratch", "wxt-dev.pid")
  let pidToKill = null

  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim())
      if (pid && isProcessRunning(pid)) {
        pidToKill = pid
      }
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(pidFile)
    } catch {
      /* ignore */
    }
  }

  if (!pidToKill) {
    const port = customPort || 3000
    try {
      if (os.platform() === "win32") {
        const out = execSync(
          `netstat -ano | findstr 127.0.0.1:${port} | findstr LISTENING`,
          { encoding: "utf8" },
        )
        const match = out.trim().match(/\s+(\d+)$/)
        if (match) {
          pidToKill = Number(match[1])
        }
      } else {
        const out = execSync(`lsof -t -i :${port}`, { encoding: "utf8" })
        if (out.trim()) {
          pidToKill = Number(out.trim().split("\n")[0])
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (pidToKill) {
    try {
      if (os.platform() === "win32") {
        execSync(`taskkill /F /T /PID ${pidToKill}`, { stdio: "ignore" })
      } else {
        process.kill(pidToKill, "SIGTERM")
      }
      console.log(`🛑 已终止后台 WXT 开发服务器进程 (PID: ${pidToKill})`)
    } catch (err) {
      console.warn(`停止开发服务器提示: ${err.message}`)
    }
  } else {
    console.log(`ℹ️ 未找到运行中的后台开发服务器。`)
  }
}

/**
 * 6. 递归获取目录下文件的最新修改时间
 */
function getLatestMtime(
  dir,
  ignored = ["node_modules", ".git", ".output", ".wxt"],
) {
  let latest = 0
  let latestFile = ""
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (ignored.includes(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const { mtime, file } = getLatestMtime(full, ignored)
        if (mtime > latest) {
          latest = mtime
          latestFile = file
        }
      } else {
        const stat = fs.statSync(full)
        if (stat.mtimeMs > latest) {
          latest = stat.mtimeMs
          latestFile = full
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { mtime: latest, file: latestFile }
}

/**
 * 7. 检查静态产物 (.output/chrome-mv3) 是否过时
 */
function checkBuildStaleness(root, prodExtDir) {
  const manifestPath = path.join(prodExtDir, "manifest.json")
  if (!fs.existsSync(manifestPath)) {
    return { isStale: true, reason: "构建产物不存在" }
  }

  const manifestMtime = fs.statSync(manifestPath).mtimeMs

  // 关键根配置
  const rootFilesToCheck = [
    "wxt.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
  ]
  for (const rel of rootFilesToCheck) {
    const full = path.join(root, rel)
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full)
      if (stat.mtimeMs > manifestMtime) {
        return {
          isStale: true,
          reason: `根配置文件已更新: ${rel} (${new Date(stat.mtimeMs).toLocaleTimeString()})`,
        }
      }
    }
  }

  // 关键源码目录
  const dirsToCheck = ["src", "plugins"]
  for (const dirName of dirsToCheck) {
    const fullDir = path.join(root, dirName)
    if (fs.existsSync(fullDir)) {
      const { mtime, file } = getLatestMtime(fullDir)
      if (mtime > manifestMtime) {
        return {
          isStale: true,
          reason: `源码文件已更新: ${path.relative(root, file)} (${new Date(mtime).toLocaleTimeString()})`,
        }
      }
    }
  }

  return { isStale: false, manifestMtime }
}

/**
 * 8. 执行 pnpm build 构建最新生产产物
 */
function executeBuild(root) {
  console.log(`\n🔨 正在自动执行 pnpm build 确保加载最新编译产物...`)
  const startTime = Date.now()
  execSync("pnpm build", { stdio: "inherit", cwd: root })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`✅ 构建完成！耗时: ${elapsed} 秒\n`)
}

/**
 * 10. 通过 CDP 关闭现存的调试浏览器
 */
async function closeDevBrowserViaCdp(cdpPort) {
  try {
    const { chromium } = await import("@playwright/test")
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
    const context = browser.contexts()[0]
    if (context && context.pages().length > 0) {
      const session = await context.newCDPSession(context.pages()[0])
      await session.send("Browser.close")
    }
  } catch {
    /* ignore */
  }
}

async function verifyRunningProfile() {
  const { chromium } = await import("@playwright/test")
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  try {
    await assertDevBrowserProfile(browser)
  } finally {
    await browser.close()
  }
}

async function verifyExtensionReady(extensionDir) {
  const { chromium } = await import("@playwright/test")
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  try {
    await assertDevBrowserProfile(browser)
    await ensureDevExtensionReady(browser, extensionDir)
  } finally {
    await browser.close()
  }
}

/**
 * Inventory of debug browsers and profiles. `--clean` prunes caches;
 * `--prune-profiles` additionally deletes profiles no checkout owns any more.
 */
async function runProfileMaintenance({ clean, pruneProfiles }) {
  const profilesBaseDir = devProfilesBaseDir()
  // Only browsers reading this base directory hold profiles here; an instance of
  // another base (a scratch directory) is reported but does not block cleanup.
  const processes = (await listDebugBrowserProcesses()).filter((process) =>
    isInside(profilesBaseDir, process.userDataDir),
  )
  const profiles = classifyDevProfiles({
    profilesBaseDir,
    runningUserDataDirs: processes.map((process) => process.userDataDir),
  })
  console.log(formatDebugBrowserReport({ processes, profiles }))

  if (processes.length > 0) {
    console.log(
      `\n🛑 ${processes.length} 个调试浏览器仍在运行；关闭后再清理（或先 pnpm browser:cdp -- --stop-browsers）。`,
    )
  }

  const plan = planProfileCleanup(profiles, { pruneProfiles })
  const deletable = new Set(plan.deleteProfiles.map((profile) => profile.dir))
  let freedBytes = 0
  for (const profile of plan.orphans) {
    if (!deletable.has(profile.dir)) {
      console.log(
        `⚠️ 孤立 profile: ${profile.name} (${describeBytes(profile.sizeBytes)})，加 --prune-profiles 才会删除`,
      )
      continue
    }
    const before = profile.sizeBytes
    if (!removeProfileDir(profile.dir)) {
      console.warn(`⚠️ 删除失败，已跳过: ${profile.dir}`)
      continue
    }
    freedBytes += before
    console.log(
      `🧹 已删除孤立 profile: ${profile.name} (${describeBytes(before)})`,
    )
  }

  const closed = plan.pruneCacheTargets
  if (closed.length > 0 && clean) {
    for (const profile of closed) {
      const { removed, freedBytes: freed } = pruneProfileCaches(profile.dir)
      if (removed.length === 0) continue
      freedBytes += freed
      console.log(
        `🧽 ${profile.name}: 清理 ${removed.length} 项可再生缓存 (${describeBytes(freed)})`,
      )
    }
  } else if (closed.length > 0) {
    const potential = closed.reduce(
      (sum, profile) =>
        sum +
        (profile.sizeBytes < 1024 ? 0 : Math.round(profile.sizeBytes / 2)),
      0,
    )
    console.log(
      `🧽 加 --clean 可清理已关闭 profile 的可再生缓存（component_crx_cache、ProvenanceData、着色器缓存等），约 ${describeBytes(potential)}。`,
    )
  }

  if (freedBytes > 0) console.log(`✅ 共释放 ${describeBytes(freedBytes)}`)
  return freedBytes
}

/** Ask every running debug browser to exit through CDP, then wait for release. */
async function stopRunningDebugBrowsers(processes) {
  let allStopped = true
  for (const processEntry of processes) {
    try {
      await closeDevBrowserViaCdp(processEntry.port)
      const released = await waitForUserDataDirRelease(processEntry.userDataDir)
      if (!released) {
        allStopped = false
        console.warn(
          `⚠️ 关闭 :${processEntry.port} 失败: profile lock 在超时前未释放`,
        )
        continue
      }
      console.log(
        `🛑 已关闭 :${processEntry.port} (${path.basename(processEntry.userDataDir)})`,
      )
    } catch (error) {
      allStopped = false
      console.warn(`⚠️ 关闭 :${processEntry.port} 失败: ${error.message}`)
    }
  }
  return allStopped
}

/** Whether `child` sits below `parent`, used to scope processes to a base. */
function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  )
}

/**
 * Report what the window will look like, so the operator can tell this browser
 * apart from the daily one — and from other worktrees' debug browsers — without
 * opening the profile picker.
 */
function reportBrowserIdentity(identity, preparation) {
  if (!preparation.applied) {
    const reason =
      preparation.reason === "disabled"
        ? "已通过 --no-identity 关闭"
        : preparation.reason === "profile_in_use"
          ? "profile 仍被浏览器占用，重启后再写入"
          : `写入失败: ${preparation.reason}`
    console.log(`🏷️  跳过窗口标识 (${reason})`)
    return
  }

  const avatar =
    typeof preparation.avatarIndex === "number"
      ? `，头像 #${preparation.avatarIndex}`
      : ""
  console.log(
    preparation.namePreserved
      ? `🏷️  保留 profile 中已有的自定义名称${avatar}`
      : `🏷️  浏览器窗口标识: ${identity.displayName}${avatar}（窗口标题与配置卡片可见）`,
  )
  console.log(
    preparation.themeReserved
      ? `🎨 保留 profile 内已安装的主题，未套用调试配色`
      : `🎨 窗口配色: rgb(${identity.accentColor})，与日常浏览器一眼可分`,
  )
  if (preparation.pinnedExtensionIds.length > 0) {
    console.log(
      `📌 已固定到工具栏: ${preparation.pinnedExtensionIds.join(", ")}`,
    )
  }
}

async function main() {
  console.log("==========================================")
  console.log("   All API Hub 自动化 CDP 调试环境启动器   ")
  console.log("==========================================")
  console.log(`当前 Worktree: ${WORKTREE_NAME} (${rootDir})`)
  if (isIsolatedDevProfile()) {
    console.log(
      `🧪 隔离 Profile 模式：独占 user-data-dir 与 CDP 端口，不影响其它 worktree`,
    )
  }

  const cliArgs = process.argv.slice(2)
  // `--isolate` 由模块顶部在常量求值前解析；此处仅记录命中，避免重复 seed。
  const forceDev = cliArgs.includes("--dev")
  const forceProd = cliArgs.includes("--prod")
  const forceBuild = cliArgs.includes("--build")
  const skipBuild =
    cliArgs.includes("--skip-build") || cliArgs.includes("--no-build")
  const forceRestart = cliArgs.includes("--restart")
  const forceReloadOnly = cliArgs.includes("--reload")
  const stopDevOnly = cliArgs.includes("--stop-dev")
  // Profile name, frame tint and toolbar pin are written into the profile, so
  // they need the browser to be closed; opt out for a pristine shared profile.
  const skipIdentity = cliArgs.includes("--no-identity")
  const listProfilesOnly =
    cliArgs.includes("--list") || cliArgs.includes("--list-profiles")
  const cleanProfiles = cliArgs.includes("--clean")
  // Deleting a whole profile throws away logins and extension data, so it needs
  // its own switch rather than riding along with the cache cleanup.
  const pruneProfiles = cliArgs.includes("--prune-profiles")
  const stopBrowsersOnly = cliArgs.includes("--stop-browsers")

  if (listProfilesOnly || cleanProfiles || pruneProfiles || stopBrowsersOnly) {
    if (stopBrowsersOnly) {
      const allStopped = await stopRunningDebugBrowsers(
        await listDebugBrowserProcesses(),
      )
      process.exit(allStopped ? 0 : 1)
    } else {
      await runProfileMaintenance({
        clean: cleanProfiles || pruneProfiles,
        pruneProfiles,
      })
    }
    process.exit(0)
  }

  if (stopDevOnly) {
    stopDevServer(rootDir)
    process.exit(0)
  }

  const devPortIdx = cliArgs.indexOf("--dev-port")
  const customDevPort =
    devPortIdx !== -1
      ? cliArgs[devPortIdx + 1]
      : process.env.WXT_DEV_PORT || process.env.VITE_PORT

  // 若只是纯触发刷新
  if (forceReloadOnly) {
    const isRunning = await checkPortOpen(CDP_PORT)
    if (isRunning) {
      await verifyRunningProfile()
      console.log(`正在向 127.0.0.1:${CDP_PORT} 发送扩展热重载信号...`)
      await reloadRunningExtension(
        CDP_PORT,
        path.join(
          rootDir,
          ".output",
          forceProd ? "chrome-mv3" : "chrome-mv3-dev",
        ),
      )
      process.exit(0)
    } else {
      console.error(
        `❌ 调试浏览器未在端口 ${CDP_PORT} 运行，无法发送刷新信号。`,
      )
      process.exit(1)
    }
  }

  // 1. 判定当前扩展产物目录及保新状态
  const devExtDir = path.join(rootDir, ".output", "chrome-mv3-dev")
  const prodExtDir = path.join(rootDir, ".output", "chrome-mv3")

  let extDir = null
  let _rebuilt = false

  // 核心决策：优先采用开发模式（HMR 增量更新与实时调试），除非明确指定 --prod
  const preferDev = !forceProd

  if (preferDev) {
    const devStatus = await ensureDevServerRunning(rootDir, customDevPort)
    if (devStatus.ok) {
      extDir = devExtDir
      console.log(
        `⚡ 使用热重载构建 (.output/chrome-mv3-dev)，关联开发服务器: ${devStatus.info.url}`,
      )
    } else {
      if (forceDev) {
        console.error(
          `\n❌ 指定了 --dev 模式，但 WXT 开发服务器启动或连接失败。详情见 .scratch/wxt-dev.log`,
        )
        process.exit(1)
      }
      console.warn(
        `⚠️ 开发模式未能就绪，自动降级至独立静态产物模式 (.output/chrome-mv3)...`,
      )
    }
  }

  if (!extDir) {
    // 独立静态产物模式 (.output/chrome-mv3)
    extDir = prodExtDir

    // 检查产物保新状态
    const staleness = checkBuildStaleness(rootDir, prodExtDir)

    if (forceBuild) {
      console.log(`🔧 指定了 --build 参数，强制重新编译最新产物...`)
      executeBuild(rootDir)
      _rebuilt = true
    } else if (staleness.isStale && !skipBuild) {
      console.log(`\n📦 产物保新检查: ${staleness.reason}`)
      executeBuild(rootDir)
      _rebuilt = true
    } else if (staleness.isStale && skipBuild) {
      console.warn(`⚠️ 产物已过时，但由于指定了 --skip-build 跳过重新编译。`)
    } else {
      console.log(`📦 产物保新检查通过: 已是最新构建产物 (.output/chrome-mv3)`)
    }
  }

  if (!extDir || !fs.existsSync(extDir)) {
    console.error(`\n❌ 未找到扩展编译产物目录: ${extDir}`)
    console.error(`请先在当前 worktree 运行: pnpm build 或 pnpm dev`)
    process.exit(1)
  }

  // 2. 查找浏览器可执行文件
  const browserPath = findBrowserExecutable()
  if (!browserPath) {
    console.error(
      "\n❌ 未能自动检测到已安装的 Chromium 浏览器 (Edge / Chrome / Brave)。",
    )
    console.error("请设置环境变量 AAH_BROWSER_PATH 指向浏览器可执行文件路径。")
    process.exit(1)
  }

  // 3. 共享 Profile 目录
  const devProfileDir = resolveSharedDevProfile()
  fs.mkdirSync(devProfileDir, { recursive: true })

  console.log(`浏览器内核: ${path.basename(browserPath)}`)
  console.log(`共享数据目录: ${devProfileDir}`)
  console.log(`加载扩展目录: ${extDir}`)

  // 4. 检查调试浏览器是否已经在运行
  const isRunning = await checkPortOpen(CDP_PORT)
  if (isRunning) {
    await verifyRunningProfile()
    if (forceRestart) {
      console.log(`\n🔄 检测到 --restart 参数，正在关闭旧调试实例并重新启动...`)
      await closeDevBrowserViaCdp(CDP_PORT)
      const released = await waitForUserDataDirRelease(devProfileDir)
      if (!released) {
        throw new Error(
          `旧调试浏览器仍占用 Profile 目录，请关闭该浏览器后重试: ${devProfileDir}`,
        )
      }
    } else {
      await verifyExtensionReady(extDir)
      console.log(`\n✅ 端口 ${CDP_PORT} 已经在监听中！调试浏览器已就绪。`)
      console.log(`🔄 正在通过 CDP 唤醒运行中的浏览器刷新扩展...`)
      await reloadRunningExtension(CDP_PORT, extDir)
      console.log(
        `👉 现存调试窗口可以直接复用（加 --reload 可直接刷新扩展，加 --restart 可重启浏览器）。`,
      )
      console.log(
        `🏷️  窗口标识（配置名 / 窗口配色 / 工具栏固定）只在启动时写入，需要最新标识请加 --restart。`,
      )
      process.exit(0)
    }
  }

  // 5. 启动浏览器
  console.log(
    `\n正在启动独立调试浏览器（挂载当前分支扩展，不干扰日常主浏览器）...`,
  )
  // A running browser owns the profile and would overwrite these files on exit.
  const identity = buildDevBrowserIdentity({
    profileDir: devProfileDir,
    worktreeName: WORKTREE_NAME,
    isolated: isIsolatedDevProfile(),
  })
  const preparation = skipIdentity
    ? skippedDevBrowserPreparation(devProfileDir, "disabled")
    : prepareDevBrowserProfile({
        userDataDir: devProfileDir,
        identity,
        extensionIds: [deriveUnpackedExtensionId(extDir)],
      })
  reportBrowserIdentity(identity, preparation)

  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${devProfileDir}`,
    // Pin the profile the identity above was written for, instead of whichever
    // profile this user data directory opened last.
    `--profile-directory=${preparation.profileDirectory}`,
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    // Enable the supported CDP unpacked installer; readiness is verified below.
    "--enable-unsafe-extension-debugging",
    "--enable-automation",
    "--no-first-run",
    "--no-default-browser-check",
  ]
  if (preparation.applied && !preparation.themeReserved) {
    args.push(`--install-autogenerated-theme=${identity.accentColor}`)
  }

  if (os.platform() === "win32") {
    const helperScript = path.join(__dirname, "spawn-browser-windows.ps1")
    const payload = JSON.stringify({ browserPath, args })
    try {
      execFileSync("pwsh", [
        "-NoProfile",
        "-File",
        helperScript,
        "-ConfigJson",
        payload,
      ])
    } catch {
      execFileSync("powershell", [
        "-NoProfile",
        "-File",
        helperScript,
        "-ConfigJson",
        payload,
      ])
    }
  } else {
    const child = spawn(browserPath, args, {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
  }

  // 6. 等待端口就绪
  let ready = false
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await checkPortOpen(CDP_PORT)) {
      ready = true
      break
    }
  }

  if (ready) {
    await verifyExtensionReady(extDir)
    console.log(`🎉 成功！调试浏览器已启动，CDP 监听在 127.0.0.1:${CDP_PORT}`)
    console.log(
      `👉 日常浏览器与该独立沙盒已同时运行，随时可用 pnpm e2e:cdp 执行全自动控制！`,
    )
  } else {
    throw new Error(`等待端口 ${CDP_PORT} 超时，请检查浏览器是否已弹出。`)
  }
}

main().catch((err) => {
  console.error("启动失败:", err)
  process.exit(1)
})
