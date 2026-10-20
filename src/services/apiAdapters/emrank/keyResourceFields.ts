import { EMRANK_KEY_EXPIRATION_MODES } from "~/services/apiService/emrank/constants"

/** Keep is an editor-only choice that deliberately omits the wire field. */
export const EMRANK_EXPIRATION_MODES = {
  Keep: "keep",
  ...EMRANK_KEY_EXPIRATION_MODES,
} as const

/** Stable editor field ids shared by the EMRank adapter and its presentation. */
export const emrankKeyFields = {
  Name: "name",
  Unlimited: "unlimited",
  Quota: "quota",
  Remaining: "remaining",
  Used: "used",
  ExpirationMode: "expiration_mode",
  ExpiresAt: "expires_at",
  Enabled: "enabled",
} as const
