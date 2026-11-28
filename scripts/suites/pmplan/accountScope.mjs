/* global chrome */
import assert from "node:assert/strict"

import {
  PMPLAN_WEB_ORIGIN,
  SITE_TYPES,
} from "../../../src/services/accountSiteDefinitions/identifiers.ts"
import { STORAGE_KEYS } from "../../../src/services/core/storageKeys.ts"

/** Bind live acceptance to the hosted console's deployment and verified identity. */
export function requirePmplanAccount(accounts, userId) {
  const matches = accounts.filter((account) => {
    if (
      account.site_type !== SITE_TYPES.PMPLAN ||
      String(account.account_info.id) !== String(userId)
    )
      return false
    try {
      const url = new URL(account.site_url)
      return url.origin === PMPLAN_WEB_ORIGIN && !url.username && !url.password
    } catch {
      return false
    }
  })
  assert.equal(
    matches.length,
    1,
    "Requires exactly one saved PM-Plan account for the hosted deployment and console user",
  )
  return matches[0]
}

/** Read the stored result used by the native-notice acceptance scenario. */
export function readPmplanAnnouncementStatus(serviceWorker, account) {
  return serviceWorker.evaluate(
    async ({ key, siteType, accountId, origin }) => {
      const raw = (await chrome.storage.local.get(key))[key]
      const store = typeof raw === "string" ? JSON.parse(raw) : raw
      return Object.values(store?.sites ?? {}).find((site) => {
        if (
          site.siteType !== siteType ||
          site.sourceScope !== "account" ||
          site.accountId !== accountId
        )
          return false
        try {
          return new URL(site.baseUrl).origin === origin
        } catch {
          return false
        }
      })?.status
    },
    {
      key: STORAGE_KEYS.SITE_ANNOUNCEMENTS_STORE,
      siteType: SITE_TYPES.PMPLAN,
      accountId: account.id,
      origin: new URL(account.site_url).origin,
    },
  )
}
