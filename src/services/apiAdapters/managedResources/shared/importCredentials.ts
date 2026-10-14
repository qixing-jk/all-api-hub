import type { ManagedChannelImportCreateSeed } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ResourceSecretListValue } from "~/services/apiAdapters/contracts/resourceNative"

/** Structured rows let each native editor retain its own defaults and write rules. */
export function importCredentialList(
  seed: ManagedChannelImportCreateSeed,
): ResourceSecretListValue {
  return {
    kind: "secret-list",
    entries: (seed.credentials ?? [seed.credential]).map((value, index) => ({
      id: `import-${index}`,
      secret: { kind: "replace", value },
      fields: {},
    })),
  }
}

/** Preserve existing scalar imports while making multi-key intent explicit. */
export function importCredentialValue(seed: ManagedChannelImportCreateSeed) {
  return seed.credentials
    ? importCredentialList(seed)
    : { kind: "replace" as const, value: seed.credential }
}
