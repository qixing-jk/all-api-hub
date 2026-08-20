import { describe, expect, it } from "vitest"

import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  MANAGED_RESOURCE_SECRET_STATES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  RESOURCE_DISPLAY_FACT_KINDS,
  RESOURCE_FAILURE_CODES,
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES,
  RESOURCE_SECRET_EDIT_INTENT_KINDS,
  RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  RESOURCE_SECRET_STATES,
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
    expect(MANAGED_RESOURCE_DISPLAY_FACT_KINDS).toBe(
      RESOURCE_DISPLAY_FACT_KINDS,
    )
    expect(MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS).toBe(
      RESOURCE_SECRET_EDIT_INTENT_KINDS,
    )
    expect(MANAGED_RESOURCE_SECRET_STATES).toBe(RESOURCE_SECRET_STATES)
    expect(MANAGED_RESOURCE_FAILURE_CODES).toBe(RESOURCE_FAILURE_CODES)
    expect(MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS).toBe(
      RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
    )
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
      optionLoader: {
        dependsOn: ["workspace"],
        trigger: RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      },
      nullable: true,
    }
    const dateTime: ResourceFieldDescriptor = {
      fieldId: "expiresAt",
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
    }
    const nullableValue: ResourceFieldValue = null

    expect(select).toMatchObject({
      optionLoader: { dependsOn: ["workspace"], trigger: "manual" },
    })
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

  it("exposes an adapter-normalized failure message through the standard Error contract", () => {
    const error = new ManagedResourceError({
      code: RESOURCE_FAILURE_CODES.UpstreamRejected,
      message: "The example provider rejected this request",
    })

    expect(error.message).toBe("The example provider rejected this request")
  })
})
