import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { toNewApiTokenWrite } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

/**
 * Row as Rix API 6.x returns it: the New API columns plus the fields its console
 * configures (verified 2026-09-28 on platform.ephone.ai).
 */
const rixToken = {
  id: 46799,
  user_id: 1,
  key: "sk-ep-masked********b72j",
  key_mask: "sk-ep-Ka81**********b72j",
  key_format: "sk-ep-",
  status: 1,
  name: "user group (auto)",
  created_time: 1759000000,
  accessed_time: 1759000000,
  expired_time: -1,
  remain_quota: "0",
  unlimited_quota: true,
  used_quota: "0",
  remain_count: 0,
  unlimited_count: true,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  exclude_ips: "10.9.9.9",
  rate_limits: "5,60",
  group: "openai",
  group_only: true,
  group_sort: "price",
  group_ignore: "xai",
  storage_location: "global",
  max_channel_cost: 3,
  mj_mode: "默认",
  fixed_key_index: -1,
  DeletedAt: null,
} as unknown as NewApiToken

describe("Rix token write fields", () => {
  it("keeps the deployment-managed columns and drops the secret", () => {
    const preserved = resolveNewApiKeyVariant(
      SITE_TYPES.RIX_API,
    ).readPreservedFields(rixToken)

    expect(preserved).toMatchObject({
      unlimited_count: true,
      remain_count: 0,
      exclude_ips: "10.9.9.9",
      rate_limits: "5,60",
      group_only: true,
      group_sort: "price",
      group_ignore: "xai",
      storage_location: "global",
      max_channel_cost: 3,
      mj_mode: "默认",
      status: 1,
    })
    for (const field of [
      "id",
      "user_id",
      "key",
      "key_mask",
      "key_format",
      "created_time",
      "accessed_time",
      "used_quota",
      "DeletedAt",
    ]) {
      expect(preserved).not.toHaveProperty(field)
    }
  })

  it("leaves other site types on the plain projection", () => {
    expect(
      resolveNewApiKeyVariant(SITE_TYPES.NEW_API).readPreservedFields(rixToken),
    ).toEqual({})

    const body = toNewApiTokenWrite(
      rixToken,
      resolveNewApiKeyVariant(SITE_TYPES.NEW_API),
    )
    expect(body).not.toHaveProperty("unlimited_count")
    expect(body).not.toHaveProperty("group_only")
    expect(body.name).toBe("user group (auto)")
  })

  it("applies the owned projection on top of the preserved columns", () => {
    const body = toNewApiTokenWrite(
      { ...rixToken, remain_quota: 0, model_limits: "gpt-6-luna" },
      resolveNewApiKeyVariant(SITE_TYPES.RIX_API),
    )

    expect(body).toMatchObject({
      name: "user group (auto)",
      group: "openai",
      remain_quota: 0,
      model_limits: "gpt-6-luna",
      unlimited_count: true,
      group_only: true,
      mj_mode: "默认",
    })
    expect(body).not.toHaveProperty("key")
  })
})
