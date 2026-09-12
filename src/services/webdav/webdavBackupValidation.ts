import { isPlainObject } from "~/utils/core/object"

/** Reject malformed sections before backup normalization can replace them with empty data. */
function validateSections(container: Record<string, unknown>) {
  if ("apiCredentialProfiles" in container) {
    const config = container.apiCredentialProfiles
    if (!isPlainObject(config) || !Array.isArray(config.profiles)) {
      throw new Error("API credential profiles section is invalid")
    }
    // Missing optional arrays are valid in older profile snapshots. Present
    // malformed arrays must not be coerced into empty replacement data.
    for (const key of ["profiles", "links", "linkTombstones"]) {
      if (
        key in config &&
        (!Array.isArray(config[key]) || !config[key].every(isPlainObject))
      ) {
        throw new Error(`API credential ${key} section is invalid`)
      }
    }
  }
  if ("accounts" in container) {
    if (Array.isArray(container.accounts)) {
      // Legacy V1 backups may put the account list directly in a data container.
    } else if (!container.accounts || typeof container.accounts !== "object") {
      throw new Error("accounts section is invalid")
    } else {
      const accountsSection = container.accounts as Record<string, unknown>
      const accountSectionKeys = [
        "accounts",
        "bookmarks",
        "pinnedAccountIds",
        "orderedAccountIds",
        "deletedEntryRecords",
        "last_updated",
      ]
      if (
        !accountSectionKeys.some((key) =>
          Object.prototype.hasOwnProperty.call(accountsSection, key),
        )
      ) {
        throw new Error("accounts section is empty")
      }
      for (const key of [
        "accounts",
        "bookmarks",
        "pinnedAccountIds",
        "orderedAccountIds",
      ]) {
        if (key in accountsSection && !Array.isArray(accountsSection[key])) {
          throw new Error(`${key} section is invalid`)
        }
      }
      if (
        "deletedEntryRecords" in accountsSection &&
        (!accountsSection.deletedEntryRecords ||
          typeof accountsSection.deletedEntryRecords !== "object" ||
          Array.isArray(accountsSection.deletedEntryRecords))
      ) {
        throw new Error("deletedEntryRecords section is invalid")
      }
    }
  }

  if (
    "preferences" in container &&
    (!container.preferences ||
      typeof container.preferences !== "object" ||
      Array.isArray(container.preferences))
  ) {
    throw new Error("preferences section is invalid")
  }
}

/** Validate recognized root and legacy sections before normalization can discard corruption. */
export function validateWebdavBackupData(
  root: Record<string, unknown>,
  options?: { requireBackupShape?: boolean },
) {
  if (options?.requireBackupShape) {
    // A valid selective backup may omit individual sections, but it must
    // still carry at least one data section. This prevents transport
    // failures, empty responses, and metadata-only objects from being
    // interpreted as an empty data set.
    const dataKeys = [
      "accounts",
      "preferences",
      "tagStore",
      "featureGuidance",
      "channelConfigs",
      "apiCredentialProfiles",
    ]
    const hasRootDataSection = dataKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(root, key),
    )
    const nestedData = root.data
    const hasNestedDataSection =
      nestedData &&
      typeof nestedData === "object" &&
      !Array.isArray(nestedData) &&
      dataKeys.some((key) =>
        Object.prototype.hasOwnProperty.call(nestedData, key),
      )

    if (!hasRootDataSection && !hasNestedDataSection) {
      throw new Error("backup has no recognized sections")
    }
  }

  validateSections(root)
  if (
    options?.requireBackupShape &&
    root.data &&
    typeof root.data === "object" &&
    !Array.isArray(root.data)
  ) {
    validateSections(root.data as Record<string, unknown>)
  }
}
