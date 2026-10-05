import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

/**
 * Build an `NewApiToken` fixture with stable defaults and shallow overrides.
 */
export function buildNewApiToken(
  overrides: Partial<NewApiToken> = {},
): NewApiToken {
  const base: NewApiToken = {
    id: 1,
    user_id: 1,
    key: "test-key",
    status: 1,
    name: "Test Token",
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    allow_ips: "",
    used_quota: 0,
    group: "default",
  }

  return { ...base, ...overrides }
}
