import { isRecord } from "~/utils/core/object"

export const MODEL_VENDOR_EVIDENCE_KINDS = {
  Publisher: "publisher",
  DeploymentCategory: "deployment_category",
  RoutingProvider: "routing_provider",
} as const

export type ModelVendorEvidenceKind =
  (typeof MODEL_VENDOR_EVIDENCE_KINDS)[keyof typeof MODEL_VENDOR_EVIDENCE_KINDS]

export interface ModelVendorEvidence {
  kind: ModelVendorEvidenceKind
  name: string
  externalId?: string
}

export interface ModelDescriptor {
  id: string
  vendorEvidence?: ModelVendorEvidence
}

interface ModelDescriptorState {
  descriptor: ModelDescriptor
  hasConflictingEvidence: boolean
}

/** Returns whether a value is an allowed neutral vendor-evidence kind. */
function isModelVendorEvidenceKind(
  value: unknown,
): value is ModelVendorEvidenceKind {
  return Object.values(MODEL_VENDOR_EVIDENCE_KINDS).some(
    (kind) => kind === value,
  )
}

/** Validates and trims vendor evidence received at the model boundary. */
function normalizeVendorEvidence(
  value: unknown,
): ModelVendorEvidence | undefined {
  if (
    !isRecord(value) ||
    !isModelVendorEvidenceKind(value.kind) ||
    typeof value.name !== "string"
  ) {
    return undefined
  }

  const name = value.name.trim()
  if (!name) {
    return undefined
  }

  if (value.externalId !== undefined && typeof value.externalId !== "string") {
    return undefined
  }

  return {
    kind: value.kind,
    name,
    ...(value.externalId === undefined
      ? {}
      : { externalId: value.externalId.trim() }),
  }
}

/** Compares normalized evidence structurally. */
function isSameVendorEvidence(
  left: ModelVendorEvidence,
  right: ModelVendorEvidence,
) {
  return (
    left.kind === right.kind &&
    left.name === right.name &&
    left.externalId === right.externalId
  )
}

/** Normalizes model descriptors and removes ambiguous vendor evidence. */
export function normalizeModelDescriptors(
  values: readonly unknown[],
): ModelDescriptor[] {
  const descriptorsById = new Map<string, ModelDescriptorState>()

  for (const value of values) {
    if (!isRecord(value) || typeof value.id !== "string") {
      continue
    }

    const id = value.id.trim()
    if (!id) {
      continue
    }

    const vendorEvidence = normalizeVendorEvidence(value.vendorEvidence)
    const existing = descriptorsById.get(id)

    if (!existing) {
      descriptorsById.set(id, {
        descriptor: {
          id,
          ...(vendorEvidence === undefined ? {} : { vendorEvidence }),
        },
        hasConflictingEvidence: false,
      })
      continue
    }

    if (existing.hasConflictingEvidence || vendorEvidence === undefined) {
      continue
    }

    if (existing.descriptor.vendorEvidence === undefined) {
      existing.descriptor.vendorEvidence = vendorEvidence
      continue
    }

    if (
      !isSameVendorEvidence(existing.descriptor.vendorEvidence, vendorEvidence)
    ) {
      delete existing.descriptor.vendorEvidence
      existing.hasConflictingEvidence = true
    }
  }

  return Array.from(descriptorsById.values(), ({ descriptor }) => descriptor)
}
