import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import {
  clearRixApiDialectChoicesForTests,
  recordRixApiMajorVersion,
  reportsRixApiV6TokenColumns,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import { AuthTypeEnum } from "~/types"

/** Columns Rix API 6.x added next to the New API token projection. */
const DEPLOYMENT_FIELD_IDS = [
  "unlimited_count",
  "remain_count",
  "group_only",
  "exclude_ips",
  "storage_location",
] as const

const baseUrl = "https://rix.example.invalid"
const request = {
  baseUrl,
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "admin-key" },
}

/** Records a deployment's core generation directly into dialect memory. */
const probeCoreVersion = (majorVersion: number | undefined) => {
  recordRixApiMajorVersion(baseUrl, majorVersion)
}

const editorFieldIds = () =>
  createNewApiKeyEditor(
    resolveNewApiKeyVariant(SITE_TYPES.RIX_API),
    request,
  ).fields.map((field) => field.fieldId)

describe("Rix API deployment token columns", () => {
  beforeEach(() => {
    clearRixApiDialectChoicesForTests()
  })

  it("keeps the 6.x columns while the deployment is unprobed", () => {
    expect(reportsRixApiV6TokenColumns(baseUrl)).toBe(true)
    for (const fieldId of DEPLOYMENT_FIELD_IDS) {
      expect(editorFieldIds()).toContain(fieldId)
    }
  })

  it("declares the unconfigured storage node as a valid selectable empty value", () => {
    const editor = createNewApiKeyEditor(
      resolveNewApiKeyVariant(SITE_TYPES.RIX_API),
      request,
    )
    expect(
      editor.fields.find((field) => field.fieldId === "storage_location"),
    ).toMatchObject({ nullable: true })
    const values = { ...editor.initialValues, storage_location: null }
    expect(editor.validate(values)).toEqual({ valid: true })
    expect(editor.buildCommand(values).values.storage_location).toBe("")
  })

  it.each([6, 7])("keeps the 6.x columns on core version %s", async (major) => {
    await probeCoreVersion(major)

    expect(reportsRixApiV6TokenColumns(baseUrl)).toBe(true)
    for (const fieldId of DEPLOYMENT_FIELD_IDS) {
      expect(editorFieldIds()).toContain(fieldId)
    }
  })

  it.each([3, 5])("drops the 6.x columns on core version %s", async (major) => {
    await probeCoreVersion(major)

    expect(reportsRixApiV6TokenColumns(baseUrl)).toBe(false)
    for (const fieldId of DEPLOYMENT_FIELD_IDS) {
      expect(editorFieldIds()).not.toContain(fieldId)
    }
  })

  it("keeps the 6.x columns when the deployment reports no core version", async () => {
    await probeCoreVersion(undefined)

    expect(reportsRixApiV6TokenColumns(baseUrl)).toBe(true)
    for (const fieldId of DEPLOYMENT_FIELD_IDS) {
      expect(editorFieldIds()).toContain(fieldId)
    }
  })

  it("scopes the probe to the deployment it was made against", async () => {
    await probeCoreVersion(5)

    expect(reportsRixApiV6TokenColumns("https://other.example.invalid")).toBe(
      true,
    )
    expect(reportsRixApiV6TokenColumns(undefined)).toBe(true)
  })
})
