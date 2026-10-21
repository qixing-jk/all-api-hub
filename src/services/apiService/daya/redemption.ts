import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { DAYA_ENDPOINTS } from "./constants"
import { fetchDayaIdentity } from "./identity"
import { fetchDayaData, withDayaSession } from "./transport"

/** Match the current purchase form without retrying through the legacy endpoint. */
export function redeemDayaCode(
  request: ApiServiceRequest,
  code: string,
  idempotencyKey: string,
) {
  return withDayaSession(request, async (scoped) => {
    await fetchDayaIdentity(scoped)
    return fetchDayaData(scoped, DAYA_ENDPOINTS.Redeem, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        code: code.trim(),
        channel: "purchase",
        ref: "console-topup",
        idempotency_key: idempotencyKey,
      }),
    })
  })
}
