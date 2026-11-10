import { isAliyunWafChallengeHtml } from "./aliyunWaf"

/** Identifies an actual challenge response, independently of site and HTTP status. */
export function isProtectionResponse(
  body: unknown,
  headers?: HeadersInit,
): boolean {
  // Cloudflare documents this response header for all Challenge Page types:
  // https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/
  if (new Headers(headers).get("cf-mitigated") === "challenge") return true
  return typeof body === "string" && isAliyunWafChallengeHtml(body)
}
