const MAX_BATCH_KEYS = 500
const KNOWN_KEY_START =
  "(?:sk-|AIza|AKIA|ASIA|xai-|gsk_|hf_|ghp_|github_pat_|key-)"
const QUOTA_PATTERN = "(?:x|[$¥￥]?\\d+(?:\\.\\d+)?(?:u|刀|美元)?)"
const NUMERIC_QUOTA_PATTERN = /^[$¥￥]?(\d+(?:\.\d+)?)(?:u|刀|美元)?$/i

const isQuotaText = (value) =>
  new RegExp(`^${QUOTA_PATTERN}$`, "i").test(String(value || "").trim())

const parseQuotaText = (value) => {
  const text = String(value || "").trim()
  if (!text || text.toLowerCase() === "x") return null
  const match = text.match(NUMERIC_QUOTA_PATTERN)
  return match ? Number(match[1]) : Number.NaN
}

function splitSmartBatchLines(value) {
  const raw = String(value || "").trim()
  if (!raw || raw.startsWith("{") || raw.startsWith("[")) return [raw]

  const keyBoundary = new RegExp(`[\\s,，;；]+(?=${KNOWN_KEY_START})`, "g")
  const lines = raw
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.split(keyBoundary))
    .map((line) => line.trim())
    .filter(Boolean)

  if (
    lines.length >= 2 &&
    lines.length % 2 === 0 &&
    lines.every((line, index) =>
      index % 2 === 0 ? !isQuotaText(line) : isQuotaText(line),
    )
  ) {
    return Array.from(
      { length: lines.length / 2 },
      (_, index) => `${lines[index * 2]} | ${lines[index * 2 + 1]}`,
    )
  }

  if (lines.length !== 1) return lines

  // Some supplier exports use one long row: "key quota key quota". For
  // keys without a recognizable prefix, alternating tokens are the only
  // unambiguous boundary available.
  const tokens = lines[0].split(/\s+/)
  if (
    tokens.length >= 4 &&
    tokens.length % 2 === 0 &&
    tokens.every((token, index) =>
      index % 2 === 0 ? !isQuotaText(token) : isQuotaText(token),
    )
  ) {
    return Array.from(
      { length: tokens.length / 2 },
      (_, index) => `${tokens[index * 2]} | ${tokens[index * 2 + 1]}`,
    )
  }
  return lines
}

export function parseBatchKeys(
  value,
  defaultQuota,
  { allowInlineQuota = true, deduplicate = true } = {},
) {
  const fallbackQuota = String(defaultQuota ?? "").trim()
  const parsedFallback =
    fallbackQuota === "" || fallbackQuota.toLowerCase() === "x"
      ? null
      : parseQuotaText(fallbackQuota)
  if (
    parsedFallback != null &&
    (!Number.isFinite(parsedFallback) || parsedFallback < 0)
  ) {
    throw new Error("默认额度必须是大于或等于 0 的数字")
  }

  const rawValue = String(value || "").trim()
  const lines = splitSmartBatchLines(rawValue)
  const entries = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Take only a final numeric/x value as quota, so composite credentials
      // such as AK|SK|Region remain intact.
      const quotaMatch = allowInlineQuota
        ? line.match(
            new RegExp(
              `^(.*?\\S)(?:\\s*\\|\\s*|\\s*[,，:：=]\\s*|\\s+)(${QUOTA_PATTERN})$`,
              "i",
            ),
          )
        : null
      const invalidQuotaMatch =
        allowInlineQuota && !quotaMatch
          ? line.match(/^(.*\S)\s+\|\s+(\S+)$/)
          : null
      if (invalidQuotaMatch) {
        throw new Error(
          `Key 尾号 ${invalidQuotaMatch[1].slice(-4)} 的额度格式不正确`,
        )
      }
      const apiKey = (quotaMatch ? quotaMatch[1] : line).trim()
      const quotaText = quotaMatch ? quotaMatch[2] : ""
      const quota =
        quotaText === "" || quotaText.toLowerCase() === "x"
          ? quotaText === ""
            ? parsedFallback
            : null
          : parseQuotaText(quotaText)
      if (!apiKey) throw new Error("存在空 Key，请检查批量输入")
      if (quota != null && (!Number.isFinite(quota) || quota < 0)) {
        throw new Error(`Key 尾号 ${apiKey.slice(-4)} 的额度格式不正确`)
      }
      return { apiKey, quota }
    })

  if (entries.length === 0) throw new Error("请至少输入一条 Key")
  if (entries.length > MAX_BATCH_KEYS) {
    throw new Error(`一次最多导入 ${MAX_BATCH_KEYS} 条 Key`)
  }
  if (!deduplicate) return entries
  const unique = new Map()
  for (const entry of entries) unique.set(entry.apiKey, entry)
  return [...unique.values()]
}

export function applyQuotaLines(entries, value) {
  const raw = String(value || "").trim()
  if (!raw) throw new Error("请在额度输入框逐行填写额度，未知填 x")
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  if (lines.some((line) => !line)) {
    throw new Error("额度不能留空，未知额度请填写 x")
  }
  if (lines.length !== entries.length) {
    throw new Error(
      `Key 有 ${entries.length} 条，但额度有 ${lines.length} 条，请逐行对应`,
    )
  }
  return entries.map((entry, index) => {
    const text = lines[index]
    const quota = parseQuotaText(text)
    if (quota != null && (!Number.isFinite(quota) || quota < 0)) {
      throw new Error(`第 ${index + 1} 行额度格式不正确，未知请填 x`)
    }
    return { ...entry, quota }
  })
}

export function keyNameHint(apiKey) {
  let value = String(apiKey || "")
    .trim()
    .split("|", 1)[0]
  if (value.startsWith("{")) {
    try {
      const credential = JSON.parse(value)
      value = String(
        credential.project_id ||
          credential.client_email?.split("@", 1)[0] ||
          "json",
      )
    } catch {
      value = "json"
    }
  }
  value = value
    .replace(/^sk-ant-api\d+-/i, "")
    .replace(/^sk-or-v\d+-/i, "")
    .replace(/^sk-proj-/i, "")
    .replace(/^sk-/i, "")
    .replace(/^(?:AKIA|ASIA|AIza|xai-|gsk_|hf_|ghp_|github_pat_|key-)/i, "")
  return value.replace(/[^a-z0-9_-]/gi, "").slice(0, 8) || "unknown"
}

export function buildResourceChannelName(
  providerName,
  entries,
  { date = new Date(), index = null, total = 1 } = {},
) {
  const dateText = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
  const quota = entries.every((entry) => Number.isFinite(entry.quota))
    ? entries.reduce((sum, entry) => sum + entry.quota, 0)
    : "x"
  const suffix = total > 1 && Number.isInteger(index) ? `-${index + 1}` : ""
  const hint =
    entries.length === 1
      ? keyNameHint(entries[0].apiKey)
      : `${entries.length}Keys`
  return `${dateText}-${providerName}-Key-${hint}-额度为${quota}资源${suffix}`.slice(
    0,
    80,
  )
}
