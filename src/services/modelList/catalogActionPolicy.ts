import type { ModelListSourceActionPolicy } from "./pricingModel"

/**
 * Catalogs without account context must not borrow a representative account.
 * Account-bound catalogs can use runtime keys, including exact credential-library
 * associations. A masked inventory is a secret-resolution concern, not a reason
 * to hide otherwise supported verification workflows.
 *
 * Use only for adapters that support the shared runtime-key verification flows;
 * provider-specific protocol restrictions still belong to their own policies.
 */
export function createAccountBoundCatalogActionPolicy({
  hasAccountContext,
  supportsAccountSummary = false,
}: {
  hasAccountContext: boolean
  supportsAccountSummary?: boolean
}): Required<ModelListSourceActionPolicy> {
  return {
    supportsGroupFiltering: false,
    supportsAccountSummary,
    supportsTokenCompatibility: hasAccountContext,
    supportsCredentialVerification: hasAccountContext,
    supportsBatchCredentialVerification: hasAccountContext,
    supportsCliVerification: hasAccountContext,
  }
}
