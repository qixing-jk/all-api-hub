import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"

/** A loaded protection page remained blocked throughout the bounded wait. */
export class ProtectionPageTimeoutError extends Error {
  constructor(message = "Protection page did not clear") {
    super(message)
    this.name = "ProtectionPageTimeoutError"
  }
}

type GuardCheckMessageResponse = {
  success: boolean
  passed: boolean
  detection?: unknown
  error?: string
}

type TempContextProtectionGuardStatus = {
  passed: boolean
  capPassed: boolean
  cloudflarePassed: boolean
  aliyunPassed: boolean
  verificationRequired: boolean
  cap?: GuardCheckMessageResponse | null
  cloudflare?: GuardCheckMessageResponse | null
  aliyun?: GuardCheckMessageResponse | null
}

/** Parses an untrusted guard-check result into a stable status. */
function parseGuardCheckResult(result: PromiseSettledResult<any>): {
  passed: boolean
  response: GuardCheckMessageResponse | null
} {
  if (result.status === "rejected") {
    return { passed: false, response: null }
  }

  const response = result.value as GuardCheckMessageResponse | null | undefined
  const isValid =
    !!response &&
    typeof response === "object" &&
    typeof response.success === "boolean" &&
    typeof response.passed === "boolean"

  if (!isValid) {
    return { passed: false, response: null }
  }

  return { passed: Boolean(response.success && response.passed), response }
}

/** Checks protection-page readiness for a temporary-context tab. */
export async function checkTempContextProtectionGuards(params: {
  tabId: number
  requestId?: string
}): Promise<TempContextProtectionGuardStatus> {
  const [capResult, cloudflareResult, aliyunResult] = await Promise.allSettled([
    sendTabMessageWithRetry(params.tabId, {
      action: RuntimeActionIds.ContentCheckCapGuard,
      requestId: params.requestId,
    }),
    sendTabMessageWithRetry(params.tabId, {
      action: RuntimeActionIds.ContentCheckCloudflareGuard,
      requestId: params.requestId,
    }),
    sendTabMessageWithRetry(params.tabId, {
      action: RuntimeActionIds.ContentCheckAliyunGuard,
      requestId: params.requestId,
    }),
  ])

  const cap = parseGuardCheckResult(capResult)
  const cloudflare = parseGuardCheckResult(cloudflareResult)
  const aliyun = parseGuardCheckResult(aliyunResult)

  return {
    passed: cap.passed && cloudflare.passed && aliyun.passed,
    verificationRequired: [cap, cloudflare, aliyun].some(
      ({ response }) => response?.success === true && response.passed === false,
    ),
    capPassed: cap.passed,
    cloudflarePassed: cloudflare.passed,
    aliyunPassed: aliyun.passed,
    cap: cap.response,
    cloudflare: cloudflare.response,
    aliyun: aliyun.response,
  }
}
