/* global chrome */
import path from "node:path"
import { chromium } from "@playwright/test"

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222"

async function main() {
  console.log(`正在连接 Edge CDP: ${CDP_URL}...`)

  let browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL)
  } catch (err) {
    console.error(`\n❌ 连接失败: 无法连接到 ${CDP_URL}`)
    console.error(
      `请确认 Edge 是否已经携带 '--remote-debugging-port=9222' 参数启动。`,
    )
    console.error(`详细错误: ${err.message}\n`)
    process.exit(1)
  }

  console.log("✅ 成功连接到已运行的 Edge 浏览器！")

  const contexts = browser.contexts()
  if (contexts.length === 0) {
    console.error("未找到任何浏览器上下文 (Context)。")
    process.exit(1)
  }

  const context = contexts[0]

  // 1. 查找已加载的目标扩展（严格校验扩展身份并匹配当前构建）
  let targetExtId = null

  try {
    const session = await browser.newBrowserCDPSession()
    const { targetInfos } = await session.send("Target.getTargets")
    const currentWorktree = path.basename(process.cwd()).toLowerCase()
    for (const t of targetInfos) {
      if (t.url && t.url.startsWith("chrome-extension://")) {
        const id = new URL(t.url).hostname
        const lowerTitle = (t.title || "").toLowerCase()
        const isAah =
          lowerTitle.includes("all api hub") ||
          lowerTitle.includes("all-api-hub")

        if (isAah) {
          // 如果是本地开发版（含有 dev 标识），必须匹配当前 worktree 构建，拒绝其它 worktree 的残留扩展
          const isDev = lowerTitle.includes("dev")
          if (isDev && !lowerTitle.includes(currentWorktree)) {
            continue
          }
          targetExtId = id
          console.log(
            `- 通过 CDP 探测到目标扩展: [${t.title}] ID: ${id} (${t.type})`,
          )
          break
        }
      }
    }
    await session.detach()
  } catch {
    // 忽略并降级
  }

  if (!targetExtId) {
    const currentWorktree = path.basename(process.cwd()).toLowerCase()
    let serviceWorkers = context.serviceWorkers()
    for (const sw of serviceWorkers) {
      const swUrl = sw.url()
      try {
        const parsed = new URL(swUrl)
        if (parsed.protocol === "chrome-extension:") {
          const extId = parsed.hostname
          const manifestName = await sw.evaluate(() => {
            try {
              return chrome.runtime.getManifest()?.name || ""
            } catch {
              return ""
            }
          })
          const lowerName = manifestName.toLowerCase()
          const isAah =
            lowerName.includes("all api hub") ||
            lowerName.includes("all-api-hub")

          if (isAah) {
            // 如果是开发版，严格检查是否属于当前 worktree
            const isDev = lowerName.includes("dev")
            if (isDev && !lowerName.includes(currentWorktree)) {
              continue
            }
            targetExtId = extId
            console.log(
              `- 通过 Service Worker 匹配到目标扩展: [${manifestName}] ID: ${extId}`,
            )
            break
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!targetExtId) {
    // 如果没有通过 manifest 匹配到，检查是否直接提供了 ID 或者查找首个未匹配扩展
    const extWorkers = context
      .serviceWorkers()
      .filter((sw) => sw.url().startsWith("chrome-extension://"))
    if (extWorkers.length > 0) {
      console.log(
        "提示: 未通过名称精确匹配到 All API Hub，请在 Edge 中确认是否已加载开发版扩展 (edge://extensions)。",
      )
    }
  }

  // 2. 演示自动化打开并控制扩展页面
  if (targetExtId) {
    console.log(`\n🚀 准备控制扩展: ${targetExtId}`)
    const targetUrl = `chrome-extension://${targetExtId}/options.html`
    console.log(`正在新建标签页访问: ${targetUrl}`)

    const page = await context.newPage()
    await page.goto(targetUrl)
    await page.waitForLoadState("domcontentloaded")

    console.log("✅ 页面加载成功！标题:", await page.title())

    // 等待扩展界面实际渲染可见且交互控件挂载
    const appShell = page.locator('[data-testid="options-app"], #root')
    await appShell.first().waitFor({ state: "visible", timeout: 10000 })
    const mainButton = page.getByRole("button").first()
    await mainButton.waitFor({ state: "visible", timeout: 10000 })

    // 读取页面上的菜单项作为自动化控制演示
    const buttons = await page.getByRole("button").allInnerTexts()
    if (buttons.length === 0) {
      throw new Error("Options 页面未渲染任何可见的交互按钮或控件。")
    }
    console.log(
      `✅ 扩展界面渲染完成，检测到 ${buttons.length} 个交互按钮:`,
      buttons.slice(0, 5),
    )

    console.log("\n🎉 全流程验证成功！Edge 上的扩展界面已实现自动化直接控制！")
  } else {
    console.log(
      "\n⚠️ 请在 Edge 中打开 'edge://extensions' 开启【开发者模式】并【加载已解压的扩展】:",
    )
    console.log("   目录路径: .output/chrome-mv3-dev (或 .output/chrome-mv3)")
    process.exitCode = 1
  }

  // 断开 CDP 连接（不会关闭用户的 Edge 浏览器）
  await browser.close()
}

main().catch((err) => {
  console.error("执行出错:", err)
  process.exit(1)
})
