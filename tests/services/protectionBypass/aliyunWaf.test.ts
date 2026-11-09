// @vitest-environment jsdom
import { expect, it } from "vitest"

import { detectAliyunWafChallenge } from "~/services/protectionBypass/aliyunWaf"

it.each(["aa", "bb"])(
  "recognizes the observed Aliyun WAF %s document marker",
  (suffix) => {
    const page = new DOMParser().parseFromString(
      `<meta name="aliyun_waf_${suffix}" content="private-challenge-value">`,
      "text/html",
    )
    expect(detectAliyunWafChallenge(page)).toEqual({ isChallenge: true })
  },
)

it.each([
  '<script src="https://o.alicdn.com/captcha/AliyunCaptcha.js"></script><div id="aliyunCaptcha-sliding-slider"></div>',
  '<script>const example = "<meta name=aliyun_waf_aa>"</script>',
  '<form><input name="password" type="password"></form>',
])(
  "does not mistake ordinary CAPTCHA integration or marker text for a WAF document",
  (html) => {
    const page = new DOMParser().parseFromString(html, "text/html")
    expect(detectAliyunWafChallenge(page)).toEqual({ isChallenge: false })
  },
)
