import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"

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
  cap?: GuardCheckMessageResponse | null
  cloudflare?: GuardCheckMessageResponse | null
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
    typeof response.success === "boolean"

  if (!isValid) {
    return { passed: false, response: null }
  }

  return { passed: Boolean(response.success && response.passed), response }
}

/** Checks CAP and Cloudflare readiness for a temporary-context tab. */
export async function checkTempContextProtectionGuards(params: {
  tabId: number
  requestId?: string
}): Promise<TempContextProtectionGuardStatus> {
  const [capResult, cloudflareResult] = await Promise.allSettled([
    sendTabMessageWithRetry(params.tabId, {
      action: RuntimeActionIds.ContentCheckCapGuard,
      requestId: params.requestId,
    }),
    sendTabMessageWithRetry(params.tabId, {
      action: RuntimeActionIds.ContentCheckCloudflareGuard,
      requestId: params.requestId,
    }),
  ])

  const cap = parseGuardCheckResult(capResult)
  const cloudflare = parseGuardCheckResult(cloudflareResult)

  return {
    passed: cap.passed && cloudflare.passed,
    capPassed: cap.passed,
    cloudflarePassed: cloudflare.passed,
    cap: cap.response,
    cloudflare: cloudflare.response,
  }
}
