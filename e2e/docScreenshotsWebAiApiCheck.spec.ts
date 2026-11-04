import path from "node:path"
import { pathToFileURL } from "node:url"
import type { BrowserContext, Page } from "@playwright/test"

import {
  getWebAiApiCheckProbeTestId,
  WEB_AI_API_CHECK_TEST_IDS,
} from "~/features/WebAiApiCheck/content/testIds"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

/**
 * Captures documentation screenshots for the in-page Web AI API Check modal.
 *
 * The modal lives in a content-script shadow root, so it cannot be reached by
 * the options-page capture pass in `scripts/generate-doc-screenshots.mjs`.
 * This spec copies credentials on an external page, opens the detected-key
 * prompt and runs real UI probes against intercepted APIs. It writes the
 * images when `AAH_DOC_SHOT_DIR` is set.
 */

const { waitForDocVisuals } = await import(
  pathToFileURL(path.resolve("scripts/doc-screenshot-readiness.mjs")).href
)

const TEST_PAGE_URL = "https://api-console.example.test/console"
const API_BASE_URL = "https://api-console.example.test/api"
const API_KEY = "sk-e2e-content-api-check-key"
// Deterministic model-response fixture; the extension renders and checks this SVG.
const DRAWING_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 320">
<rect width="560" height="320" rx="18" fill="#eaf5fa"/>
<circle cx="464" cy="60" r="25" fill="#ffdb81"/>
<path d="M0 255 Q120 210 240 250 T560 240 V320 H0Z" fill="#cce4d6"/>
<path d="M65 284 H485" stroke="#93b9a5" stroke-width="3"/>
<g fill="#fafcff" stroke="#33475b" stroke-width="8"><circle cx="180" cy="245" r="48"/><circle cx="380" cy="245" r="48"/></g>
<g fill="none" stroke="#e57455" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M180 245 L242 165 L285 245 Z M242 165 H345 L285 245 M345 165 L380 245 M345 165 L335 143 H364"/></g>
<path d="M228 163 H259" stroke="#33475b" stroke-width="9" stroke-linecap="round"/>
<path d="M285 245 L313 259" stroke="#33475b" stroke-width="5"/><path d="M302 259 H324" stroke="#33475b" stroke-width="6"/>
<path d="M265 160 L285 206 L306 222" stroke="#e7aa48" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M215 144 Q173 90 220 77 Q250 59 281 89 Q299 109 285 142 Q264 175 215 144Z" fill="#fffdf6" stroke="#6f8b9b" stroke-width="3"/>
<path d="M221 95 Q259 82 276 123 Q254 153 218 123Z" fill="#dde9ef" stroke="#6f8b9b" stroke-width="2"/>
<path d="M271 97 Q285 75 284 57 Q280 29 306 26 Q333 24 335 48 Q334 69 314 76 L301 120" fill="#fffdf6" stroke="#6f8b9b" stroke-width="3"/>
<path d="M326 48 L417 61 L329 78 Q345 59 326 48Z" fill="#edb552" stroke="#b78235" stroke-width="2"/>
<circle cx="317" cy="43" r="4" fill="#263747"/>
<path d="M283 120 L319 142 L337 147" fill="none" stroke="#6f8b9b" stroke-width="5" stroke-linecap="round"/>
</svg>`

const LOCALES = {
  zh: {
    ui: "zh-CN",
    heading: "【实测可用】中转站额度分享 · 第 42 期",
    body: "整理了一下这个月还算稳定的站，测试 key 如下，需要的自取：",
    tag: "实测可用",
    reply: "感谢分享，已经用上了。",
    nav: ["社区", "文档", "API"],
    open: "打开",
    pass: "通过",
  },
  en: {
    ui: "en",
    heading: "Working relay keys — weekly thread #42",
    body: "Collected the sites that still work this month. Test key below:",
    tag: "Verified",
    reply: "Thanks for sharing, already using it.",
    nav: ["Community", "Docs", "API"],
    open: "Open",
    pass: "Pass",
  },
  ja: {
    ui: "ja",
    heading: "【実測で利用可】中継サイトの共有 · 第 42 期",
    body: "今月も安定していたサイトをまとめました。テスト用キーは以下です：",
    tag: "動作確認済み",
    reply: "共有ありがとうございます。さっそく使っています。",
    nav: ["コミュニティ", "ドキュメント", "API"],
    open: "開く",
    pass: "成功",
  },
} as const

type LocaleKey = keyof typeof LOCALES

const localeKey = (process.env.AAH_DOC_SHOT_LOCALE ?? "zh") as LocaleKey
const copy = LOCALES[localeKey] ?? LOCALES.zh
const outDir = process.env.AAH_DOC_SHOT_DIR

function buildForumHtml(): string {
  return `<!doctype html><html lang="${copy.ui}"><head><meta charset="utf-8">
<title>${copy.heading}</title>
<style>
 body{margin:0;font-family:-apple-system,"Segoe UI","Microsoft YaHei","Hiragino Sans",sans-serif;background:#f3f4f6;color:#111827}
 .top{height:56px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;padding:0 24px;gap:20px}
 .logo{width:28px;height:28px;border-radius:8px;background:#4f46e5}
 .nav{color:#6b7280;font-size:14px}
 .wrap{max-width:1100px;margin:0;padding:28px 24px 80px}
 h1{font-size:22px;margin:0 0 20px}
 .post{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px}
 .row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
 .av{width:36px;height:36px;border-radius:50%;background:#dbeafe}
 .meta{color:#6b7280;font-size:13px}
 .tag{display:inline-block;background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px;margin-right:8px}
 pre{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:13px;line-height:1.7;overflow:auto}
</style></head>
<body>
 <div class="top"><div class="logo"></div>${copy.nav.map((n) => `<span class="nav">${n}</span>`).join("")}</div>
 <div class="wrap">
  <h1>${copy.heading}</h1>
  <div class="post">
   <div class="row"><div class="av"></div><div><b>neko_dev</b><div class="meta">2h · #3</div></div></div>
   <div><span class="tag">${copy.tag}</span><span class="tag">Claude</span><span class="tag">GPT</span></div>
   <p>${copy.body}</p>
<pre id="copy-credentials">base_url=${API_BASE_URL}
api_key=${API_KEY}</pre>
  </div>
  <div class="post"><b>another_user</b><p>${copy.reply}</p></div>
 </div>
</body></html>`
}

async function openApiCheckModal(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  const serviceWorker = await getServiceWorker(context)
  await seedUserPreferences(serviceWorker, {
    language: copy.ui,
    webAiApiCheck: {
      enabled: true,
      contextMenu: { enabled: true },
      autoDetect: {
        enabled: true,
        urlWhitelist: {
          patterns: ["^https://api-console\\.example\\.test/console"],
        },
      },
    },
  })

  await context.route(TEST_PAGE_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: buildForumHtml(),
    }),
  )
  await context.route(`${API_BASE_URL}/v1/models`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [{ id: "gpt-4o-mini" }, { id: "claude-3-7-sonnet" }],
      }),
    }),
  )
  await context.route(`${API_BASE_URL}/v1/chat/completions`, (route) => {
    const request = route.request().postDataJSON() as {
      stream?: boolean
      messages?: Array<{ content?: string }>
    }
    const drawing = request.messages?.some((message) =>
      message.content?.includes("pelican"),
    )
    const content = drawing ? DRAWING_SVG : "OK"
    const completion = {
      id: "chatcmpl-ui-fixture",
      created: 0,
      model: "gpt-4o-mini",
    }
    if (request.stream) {
      return route.fulfill({
        contentType: "text/event-stream",
        body:
          [
            {
              ...completion,
              object: "chat.completion.chunk",
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content },
                  finish_reason: null,
                },
              ],
            },
            {
              ...completion,
              object: "chat.completion.chunk",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
          ]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("") + "data: [DONE]\n\n",
      })
    }
    return route.fulfill({
      json: {
        ...completion,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      },
    })
  })

  await forceExtensionLanguage(page, copy.ui)
  await page.goto(TEST_PAGE_URL)
  await page.locator("#copy-credentials").evaluate((target, text) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)
    const clipboardData = new DataTransfer()
    clipboardData.setData("text", text)
    target.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    )
  }, `base_url=${API_BASE_URL}\napi_key=${API_KEY}`)

  const host = page.locator("all-api-hub-redemption-toast")
  const open = host.getByRole("button", { name: copy.open, exact: true })
  await expect(open).toBeVisible()
  if (outDir) {
    await page.screenshot({
      path: `${outDir}/web-ai-api-check-trigger.png`,
      clip: { x: 0, y: 0, width: 1600, height: 660 },
      animations: "disabled",
    })
  }
  await open.click()
  const modal = host.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  await expect(modal).toBeVisible()
  await expect(
    modal.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
  ).toContainText("gpt-4o-mini")
}

test(`captures web AI API check screenshots (${localeKey})`, async ({
  context,
  page,
}) => {
  test.skip(!outDir, "AAH_DOC_SHOT_DIR not set")

  await page.setViewportSize({ width: 1600, height: 960 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openApiCheckModal(context, page)

  const contentHost = page.locator("all-api-hub-redemption-toast")
  const modal = contentHost.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
  const dialog = modal.getByRole("dialog")
  const shotDir = outDir as string

  // 1. Modal in the host page, showing the source post behind the overlay.
  // The dialog takes focus on mount, which paints a focus ring down the right
  // edge of the card; blur it so the frame reads as a plain screenshot.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.())
  await expect(dialog).toBeVisible()
  await waitForDocVisuals(page)
  await page.screenshot({
    path: `${shotDir}/web-ai-api-check-page.png`,
    animations: "disabled",
  })

  // 2. Dialog alone, top of the form.
  await dialog.screenshot({
    path: `${shotDir}/web-ai-api-check-dialog.png`,
    animations: "disabled",
  })

  // 3. Run the probes so the result rows are populated, then capture again.
  // The probe rows live in the scroll container; each has a run control whose
  // label flips to Retry after the first run.
  for (const probeId of [
    API_VERIFICATION_PROBE_IDS.Models,
    API_VERIFICATION_PROBE_IDS.TextGeneration,
  ]) {
    const probe = modal.getByTestId(getWebAiApiCheckProbeTestId(probeId))
    await expect(probe).toBeVisible()
    const runButton = probe
      .getByRole("button", {
        name: /^(测试|Test|Run|テスト|再試行|Retry)$/,
      })
      .first()
    await expect(runButton).toBeEnabled()
    await runButton.click()
    // The row flips to a stop control while it runs; wait for the run control
    // to come back instead of guessing at a fixed delay.
    await expect(
      probe.getByRole("button", {
        name: /^(测试|Test|重试|Retry|テスト|再試行)$/,
      }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(probe.getByText(copy.pass, { exact: true })).toBeAttached()
  }

  // Bring the probe cards (and their pass badges) into view.
  const modelsProbe = modal.getByTestId(
    getWebAiApiCheckProbeTestId(API_VERIFICATION_PROBE_IDS.Models),
  )
  await modelsProbe.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  )

  // Collapse the execution-result disclosures so both passing cards fit in one
  // frame; the JSON payloads are noise at README scale.
  for (const probeId of [
    API_VERIFICATION_PROBE_IDS.Models,
    API_VERIFICATION_PROBE_IDS.TextGeneration,
  ]) {
    const disclosure = modal
      .getByTestId(getWebAiApiCheckProbeTestId(probeId))
      .getByRole("button", { name: /执行结果|Execution result|実行結果/ })
    if (
      (await disclosure.count()) > 0 &&
      (await disclosure.first().getAttribute("aria-expanded")) === "true"
    ) {
      await disclosure.first().click()
    }
  }
  await modelsProbe.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  )
  await modal
    .getByRole("button", {
      name: /^(生成绘图|Run drawing test|描画テストを実行)$/,
    })
    .click()
  const preview = modal.getByTestId("pelican-svg-preview")
  await expect(preview).toBeVisible({ timeout: 10000 })
  await expect
    .poll(() =>
      preview.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true)
  // Keep the capability list as the main subject; a drawing is one available test.
  await modal
    .getByTestId("verification-tools")
    .getByRole("button", { name: /执行结果|Execution result|実行結果/ })
    .first()
    .click()
  await expect(preview).toBeHidden()
  await modelsProbe.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  )
  for (const id of [
    API_VERIFICATION_PROBE_IDS.Models,
    API_VERIFICATION_PROBE_IDS.TextGeneration,
    API_VERIFICATION_PROBE_IDS.ToolCalling,
    API_VERIFICATION_PROBE_IDS.StructuredOutput,
    API_VERIFICATION_PROBE_IDS.WebSearch,
  ]) {
    await expect(
      modal.getByTestId(getWebAiApiCheckProbeTestId(id)),
    ).toBeInViewport()
  }
  await expect(modal.getByTestId("verification-tools")).toBeInViewport()
  await waitForDocVisuals(page)
  await page.screenshot({
    path: `${shotDir}/web-ai-api-check-results.png`,
    animations: "disabled",
  })
})
