// @vitest-environment jsdom
import { expect, it } from "vitest"

import {
  detectAliyunWafChallenge,
  isAliyunWafChallengeHtml,
} from "~/services/protectionBypass/aliyunWaf"

it.each(["aa", "bb"])(
  "recognizes the observed Aliyun WAF %s document marker",
  (suffix) => {
    const page = new DOMParser().parseFromString(
      `<meta name="aliyun_waf_${suffix}" content="private-challenge-value">`,
      "text/html",
    )
    expect(detectAliyunWafChallenge(page)).toEqual({ isChallenge: true })
    expect(isAliyunWafChallengeHtml(page.documentElement.outerHTML)).toBe(true)
  },
)

it.each([
  '<script src="https://o.alicdn.com/captcha/AliyunCaptcha.js"></script><div id="aliyunCaptcha-sliding-slider"></div>',
  '<script>const example = "<meta name=aliyun_waf_aa>"</script>',
  '<form><input name="password" type="password"></form>',
  '<!-- <meta name="aliyun_waf_aa"> -->',
  '<textarea><meta name="aliyun_waf_aa"></textarea>',
  "<div title='<meta name=\"aliyun_waf_aa\">'>Normal page</div>",
  '<template><meta name="aliyun_waf_aa"></template>',
  '<meta content="name=aliyun_waf_aa" name="description">',
])(
  "does not mistake ordinary CAPTCHA integration or marker text for a WAF document",
  (html) => {
    const page = new DOMParser().parseFromString(html, "text/html")
    expect(detectAliyunWafChallenge(page)).toEqual({ isChallenge: false })
    expect(isAliyunWafChallengeHtml(html)).toBe(false)
  },
)

it("does not parse a JSON string as a challenge document", () => {
  expect(
    isAliyunWafChallengeHtml('{"example":"<meta name=aliyun_waf_aa>"}'),
  ).toBe(false)
})
