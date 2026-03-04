/**
 * Heuristic check for copy-like UI controls to gate clipboard reads on click.
 *
 * This helper is intentionally "best effort": we aim to avoid privacy-invasive
 * clipboard reads unless the user interacted with something that strongly looks
 * like a "copy" control. It supports multiple languages including Chinese,
 * Japanese, Korean, etc.
 */
export function isLikelyCopyActionTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const COPY_SELECTORS = [
    "button",
    "[role='button']",
    "a",
    "input[type='button']",
    "input[type='submit']",
    "[data-clipboard-text]",
    "[data-clipboard-target]",
    "[data-copy]",
    "[data-copy-text]",
    "[data-clipboard]",
    "[data-clipboard-value]",
  ].join(", ")

  const candidate = target.closest(COPY_SELECTORS) as HTMLElement | null
  if (!candidate) return false

  // 多语言复制关键词（包括常见的变体）
  const COPY_KEYWORDS = [
    // 英文
    "copy",
    "clipboard",
    "clip",
    // 中文（简体和繁体）
    "复制",
    "複製",
    "拷贝",
    "拷貝",
    "剪贴板",
    "剪貼板",
    // 日文
    "コピー",
    "クリップボード",
    "複写",
    // 韩文
    "복사",
    "클립보드",
    // 西班牙文
    "copiar",
    // 法文
    "copier",
    // 德文
    "kopieren",
    // 葡萄牙文
    "copiar",
    // 俄文
    "копировать",
    // 阿拉伯文
    "نسخ",
  ]

  // 构建正则表达式（单词边界对中文等不适用，改用前后匹配）
  const pattern = new RegExp(
    COPY_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(
      "|",
    ),
    "i",
  )

  // 1. 优先检查明确的 data 属性（存在即表示复制意图）
  const DATA_ATTRS = [
    "data-clipboard-text",
    "data-clipboard-target",
    "data-copy",
    "data-copy-text",
    "data-clipboard",
    "data-clipboard-value",
  ] as const

  for (const attr of DATA_ATTRS) {
    if (candidate.hasAttribute(attr)) return true
  }

  // 2. 检查语义化属性内容
  const SEMANTIC_ATTRS = [
    "aria-label",
    "title",
    "data-action",
    "data-tooltip",
    "data-tooltip-title",
  ] as const

  for (const attr of SEMANTIC_ATTRS) {
    const value = candidate.getAttribute(attr)
    if (value && pattern.test(value)) return true
  }

  // 3. 检查可见文本内容
  const textContent = candidate.textContent?.trim()
  if (textContent && pattern.test(textContent)) return true

  // 4. 检查 id 和 class
  if (candidate.id && pattern.test(candidate.id)) return true
  if (candidate.className && pattern.test(candidate.className)) return true

  return false
}
