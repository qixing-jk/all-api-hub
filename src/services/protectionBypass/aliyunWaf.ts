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
