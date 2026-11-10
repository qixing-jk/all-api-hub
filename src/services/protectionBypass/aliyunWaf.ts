/** Shared with self-contained page-world observers through their arguments. */
export const ALIYUN_WAF_CHALLENGE_SELECTOR =
  'meta[name="aliyun_waf_aa"], meta[name="aliyun_waf_bb"]'

/**
 * Recognize challenge-document markers observed in Aliyun WAF responses.
 * CAPTCHA SDKs, slider widgets and cookies alone also occur on normal pages.
 * These document fingerprints are not a versioned public vendor contract.
 */
export function detectAliyunWafChallenge(page: Document) {
  return {
    isChallenge: Boolean(page.querySelector(ALIYUN_WAF_CHALLENGE_SELECTOR)),
  }
}

/**
 * Recognizes the observed document markers without DOM APIs (MV3 workers have
 * no DOMParser). Ignore comments, raw-text elements and quoted attributes so
 * examples in scripts or normal CAPTCHA integrations are not challenges.
 */
export function isAliyunWafChallengeHtml(html: string): boolean {
  if (!html.trimStart().startsWith("<")) return false
  const tokens = html.matchAll(
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
  )
  let rawText: string | undefined
  let templateDepth = 0
  for (const [token, rawName] of tokens) {
    if (!rawName) continue
    const name = rawName.toLowerCase()
    const closing = token.startsWith("</")
    if (rawText) {
      if (closing && name === rawText) rawText = undefined
      continue
    }
    if (
      !closing &&
      /^(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|plaintext)$/.test(
        name,
      )
    ) {
      rawText = name
      continue
    }
    if (name === "template") {
      templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1))
      continue
    }
    if (closing || templateDepth || name !== "meta") continue
    const attributes = token
      .slice(5)
      .matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)
    for (const [
      ,
      attribute,
      doubleQuoted,
      singleQuoted,
      unquoted,
    ] of attributes) {
      if (attribute?.toLowerCase() !== "name") continue
      if (
        /^aliyun_waf_(aa|bb)$/.test(
          doubleQuoted ?? singleQuoted ?? unquoted ?? "",
        )
      )
        return true
      break
    }
  }
  return false
}
