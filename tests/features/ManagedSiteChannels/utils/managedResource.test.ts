import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  EMPTY_MANAGED_RESOURCE_CAPABILITIES,
  getManagedResourceRefKey,
  toSafeManagedResourceFailure,
} from "~/features/ManagedSiteChannels/utils/managedResource"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"

const createRef = (overrides: Partial<ManagedResourceRef> = {}) => ({
  siteType: SITE_TYPES.NEW_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://example.invalid",
  resourceId: "1",
  ...overrides,
})

describe("managed resource feature utilities", () => {
  it("keys every opaque ref identity field without delimiter collisions", () => {
    expect(
      getManagedResourceRefKey(
        createRef({ scopeKey: "https://example.invalid/a,b", resourceId: "c" }),
      ),
    ).not.toBe(
      getManagedResourceRefKey(
        createRef({ scopeKey: "https://example.invalid/a", resourceId: "b,c" }),
      ),
    )
  })

  it("preserves controlled failures and hides unknown errors", () => {
    const failure = { code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied }

    expect(
      toSafeManagedResourceFailure(new ManagedResourceError(failure)),
    ).toBe(failure)
    expect(toSafeManagedResourceFailure(new Error("private"))).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
  })

  it("provides one immutable empty capability set", () => {
    expect(EMPTY_MANAGED_RESOURCE_CAPABILITIES).toEqual({
      canSearch: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    })
    expect(Object.isFrozen(EMPTY_MANAGED_RESOURCE_CAPABILITIES)).toBe(true)
  })
})
