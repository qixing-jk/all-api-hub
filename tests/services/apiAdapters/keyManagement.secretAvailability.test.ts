import { describe, expect, it } from "vitest"

import { aihubmixKeyManagement } from "~/services/apiAdapters/aihubmix/keyManagement"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"

describe("key-management inventory secret availability", () => {
  it("defaults compatible adapters to recoverable stored secrets", () => {
    const capability = {} as KeyManagementCapability

    expect(getInventorySecretAvailability(capability)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.Recoverable,
    )
  })

  it("declares AIHubMix inventory secrets as create-response-only", () => {
    expect(getInventorySecretAvailability(aihubmixKeyManagement)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    )
  })
})
