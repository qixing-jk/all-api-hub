import { describe, expect, it } from "vitest"

import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  RESOURCE_FAILURE_CODES,
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
  RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldValue,
} from "~/services/apiAdapters/contracts/resourceNative"

describe("resource-native contracts", () => {
  it("keeps field kinds and managed compatibility aliases on one runtime source", () => {
    expect(RESOURCE_FIELD_TYPES).toMatchObject({
      Text: "text",
      Number: "number",
      DateTime: "date-time",
      Select: "select",
    })
    expect(MANAGED_RESOURCE_FIELD_TYPES).toBe(RESOURCE_FIELD_TYPES)
    expect(MANAGED_RESOURCE_FAILURE_CODES).toBe(RESOURCE_FAILURE_CODES)
    expect(MANAGED_RESOURCE_FIELD_ISSUE_CODES).toBe(RESOURCE_FIELD_ISSUE_CODES)
    expect(MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS).toBe(
      RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
    )
  })

  it("describes nullable dynamic selects and date-time fields", () => {
    const select: ResourceFieldDescriptor = {
      fieldId: "model",
      type: RESOURCE_FIELD_TYPES.Select,
      options: [],
      optionLoader: { dependsOn: ["workspace"] },
      nullable: true,
    }
    const dateTime: ResourceFieldDescriptor = {
      fieldId: "expiresAt",
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
    }
    const nullableValue: ResourceFieldValue = null

    expect(select).toMatchObject({ optionLoader: { dependsOn: ["workspace"] } })
    expect(dateTime.type).toBe("date-time")
    expect(nullableValue).toBeNull()
  })

  it("keeps controlled failure detail JSON-safe", () => {
    const failure: ResourceFailure = {
      code: RESOURCE_FAILURE_CODES.UpstreamRejected,
      message: "The provider rejected this change",
      upstreamCode: "example_rejection",
    }

    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
  })
})
