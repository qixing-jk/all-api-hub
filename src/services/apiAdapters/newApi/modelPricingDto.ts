import type { PricingResponse } from "~/services/modelList/pricingModel"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { isPlainObject, isRecord } from "~/utils/core/object"

const INVALID_RESPONSE_MESSAGE = "Invalid New API model pricing response"

type NativePricingRow = Record<string, unknown> & {
  vendor_id?: unknown
}

type NativePricingResponse = Record<string, unknown> & {
  data: NativePricingRow[]
  group_ratio: Record<string, unknown>
  success: boolean
  usable_group: Record<string, unknown>
  vendors?: unknown
}

/** Require the canonical pricing response envelope before native enrichment. */
function parseNativePricingResponse(value: unknown): NativePricingResponse {
  if (
    !isPlainObject(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isPlainObject) ||
    !isRecord(value.group_ratio) ||
    typeof value.success !== "boolean" ||
    !isRecord(value.usable_group)
  ) {
    throw new TypeError(INVALID_RESPONSE_MESSAGE)
  }

  return value as NativePricingResponse
}

/** Build an unambiguous registry from valid native vendor definitions. */
function buildVendorRegistry(value: unknown): Map<number, string> {
  const vendorsById = new Map<number, string>()
  const ambiguousIds = new Set<number>()

  if (!Array.isArray(value)) {
    return vendorsById
  }

  for (const vendor of value) {
    if (
      !isPlainObject(vendor) ||
      typeof vendor.id !== "number" ||
      !Number.isFinite(vendor.id) ||
      !Number.isInteger(vendor.id) ||
      typeof vendor.name !== "string"
    ) {
      continue
    }

    const name = vendor.name.trim()
    if (!name) {
      continue
    }

    if (vendorsById.has(vendor.id) || ambiguousIds.has(vendor.id)) {
      vendorsById.delete(vendor.id)
      ambiguousIds.add(vendor.id)
      continue
    }

    vendorsById.set(vendor.id, name)
  }

  return vendorsById
}

/** Convert New API's native pricing extensions into the product contract. */
export function normalizeNewApiModelPricingResponse(
  value: unknown,
): PricingResponse {
  const response = parseNativePricingResponse(value)
  const vendorsById = buildVendorRegistry(response.vendors)
  const canonicalResponse: Record<string, unknown> = { ...response }
  delete canonicalResponse.vendors

  canonicalResponse.data = response.data.map((row) => {
    const canonicalRow: Record<string, unknown> = { ...row }
    const vendorId = canonicalRow.vendor_id

    delete canonicalRow.vendor_id
    delete canonicalRow.vendorEvidence

    const vendorName =
      typeof vendorId === "number" &&
      Number.isFinite(vendorId) &&
      Number.isInteger(vendorId)
        ? vendorsById.get(vendorId)
        : undefined

    if (vendorName !== undefined) {
      // New API exposes row-level `vendor_id` plus a response-level admin
      // registry; this is deployment category metadata, not publisher truth.
      // https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/model/pricing.go
      // https://github.com/QuantumNous/new-api/blob/7c28993f6bd9e92616f3f578212577f8b7c40b45/controller/pricing.go
      canonicalRow.vendorEvidence = {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        name: vendorName,
        externalId: String(vendorId),
      }
    }

    return canonicalRow
  })

  return canonicalResponse as unknown as PricingResponse
}
