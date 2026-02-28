/**
 * Migration for New API configuration
 * Converts flat new-api fields to nested object structure
 */

import { DEFAULT_NEW_API_CONFIG } from "~/types/newApiConfig"
import { createLogger } from "~/utils/logger"

import type { UserPreferences } from "../../userPreferences"

const logger = createLogger("NewApiConfigMigration")

/**
 * Checks if the given user preferences object contains any of the old flat new-api fields.
 * If any of the old fields are present, it means that the user preferences object needs to be migrated
 * to use the new nested newApi object.
 * @param prefs - User preferences object to check
 * @returns - True if the user preferences object needs to be migrated, false otherwise
 */
export function needNewApiConfigMigration(prefs: UserPreferences): boolean {
  return (
    "newApiBaseUrl" in prefs ||
    "newApiAdminToken" in prefs ||
    "newApiUserId" in prefs
  )
}

/**
 * Migrate old flat new-api fields to nested object structure
 * @param prefs - User preferences object to migrate
 * @returns - Migrated user preferences object with nested newApi object
 */
export function migrateNewApiConfig(prefs: UserPreferences): UserPreferences {
  const hasNestedNewApi =
    "newApi" in prefs &&
    typeof prefs.newApi === "object" &&
    prefs.newApi !== null

  // If no old flat fields and has nested newApi, return as-is
  if (!needNewApiConfigMigration(prefs) && hasNestedNewApi) {
    return prefs
  }

  // Migrate old flat fields to nested object
  const newApiSettings = {
    baseUrl: prefs?.newApiBaseUrl ?? DEFAULT_NEW_API_CONFIG.baseUrl,
    adminToken: prefs?.newApiAdminToken ?? DEFAULT_NEW_API_CONFIG.adminToken,
    userId: prefs?.newApiUserId ?? DEFAULT_NEW_API_CONFIG.userId,
  }

  logger.debug("Migrated newApi settings", {
    baseUrl: newApiSettings.baseUrl,
    userId: newApiSettings.userId,
    hasAdminToken: Boolean(newApiSettings.adminToken),
  })

  const { newApiBaseUrl, newApiAdminToken, newApiUserId, ...restOfPrefs } =
    prefs

  return {
    ...restOfPrefs,
    newApi: newApiSettings,
  }
}
