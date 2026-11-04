export const DOC_SCREENSHOT_PAGES = {
  overview: ["options-overview.png"],
  account: ["account-manage.png"],
  models: ["model-list.png"],
  keys: ["api-key-list.png"],
  profiles: ["api-credential-profile-list.png"],
  checkin: ["auto-check-in.png"],
  usage: ["account-model-usage-overview.png"],
  latency: ["account-model-latency-overview.png"],
  balance: ["balance-history.png"],
  bookmark: ["bookmark-manage.png"],
  channels: ["new-api-channel-manage.png"],
  sync: ["new-api-channel-sync.png"],
  "web-ai-api-check": [
    "web-ai-api-check-trigger.png",
    "web-ai-api-check-page.png",
    "web-ai-api-check-dialog.png",
    "web-ai-api-check-results.png",
  ],
}

/**
 * Screenshot batches to render. `ui` is the extension locale, `chrome` is the
 * browser locale launched with, and `output` is the image directory relative to
 * docs/docs/static/image.
 */
export const DOC_SCREENSHOT_LOCALES = {
  zh: { ui: "zh-CN", chrome: "zh-CN", output: "" },
  en: { ui: "en", chrome: "en-US", output: "en" },
  ja: { ui: "ja", chrome: "ja-JP", output: "ja" },
}

export const DOC_SCREENSHOT_LANGUAGE_ALIASES = {
  "zh-cn": "zh",
  "en-us": "en",
  "ja-jp": "ja",
}
