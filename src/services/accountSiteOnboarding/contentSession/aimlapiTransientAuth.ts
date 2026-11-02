import {
  AIMLAPI_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import {
  AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
  type AimlApiConsoleTransientAuth,
  type ContentSessionTransientAuthContext,
} from "../contracts"

/** Admits completion-only console authentication for its exact site origin. */
export function normalizeAimlApiTransientAuth(
  value: unknown,
  context: ContentSessionTransientAuthContext,
): AimlApiConsoleTransientAuth | undefined {
  if (
    !isRecord(value) ||
    value.kind !== AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND ||
    value.origin !== AIMLAPI_WEB_ORIGIN ||
    typeof value.token !== "string" ||
    !value.token.trim() ||
    typeof value.userId !== "string" ||
    !value.userId
  )
    return
  try {
    if (
      new URL(context.baseUrl).origin !== AIMLAPI_WEB_ORIGIN ||
      (context.siteType !== SITE_TYPES.AIMLAPI &&
        !(
          context.siteType === SITE_TYPES.UNKNOWN &&
          context.siteTypeHint === SITE_TYPES.AIMLAPI
        ))
    )
      return
  } catch {
    return
  }
  return {
    kind: AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND,
    origin: AIMLAPI_WEB_ORIGIN,
    token: value.token,
    userId: value.userId,
  }
}
