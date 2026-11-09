import { detectAliyunWafChallenge } from "~/services/protectionBypass/aliyunWaf"

/** Read the live document without disclosing challenge values. */
export function handleCheckAliyunGuard(
  sendResponse: (result: unknown) => void,
) {
  const detection = detectAliyunWafChallenge(document)
  sendResponse({ success: true, passed: !detection.isChallenge, detection })
  return true
}
