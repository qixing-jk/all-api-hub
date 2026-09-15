import { describe, expect, it } from "vitest"

import { aihubmixAccountKeyResources } from "~/services/apiAdapters/aihubmix/accountKeyResource"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"

describe("key-management inventory secret availability", () => {
  it("defaults compatible adapters to recoverable stored secrets", () => {
    const capability = {}

    expect(getInventorySecretAvailability(capability)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.Recoverable,
    )
  })

  it("declares AIHubMix inventory secrets as create-response-only", () => {
    expect(getInventorySecretAvailability(aihubmixAccountKeyResources)).toBe(
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    )
  })
})
