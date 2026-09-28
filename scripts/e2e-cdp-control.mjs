import { connectDevExtension } from "./cdp/client.mjs"
import { openExtensionPage } from "./cdp/ui-driver.mjs"

const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222"

async function main() {
  console.log(`正在连接 Edge CDP: ${CDP_URL}...`)

  const dev = await connectDevExtension({ cdpUrl: CDP_URL })
  console.log("✅ 成功连接到已运行的 Edge 浏览器！")
  console.log(`- 目标扩展 ID: [${dev.extensionId}]`)

  try {
    console.log(`\n🚀 准备控制扩展: ${dev.extensionId}`)
    const page = await openExtensionPage({
      context: dev.context,
      extensionId: dev.extensionId,
      route: "options.html",
    })

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

    await page.close().catch(() => {})
    console.log("\n🎉 全流程验证成功！Edge 上的扩展界面已实现自动化直接控制！")
  } finally {
    await dev.close()
  }
}

main().catch((err) => {
  console.error("执行出错:", err.message)
  process.exit(1)
})
