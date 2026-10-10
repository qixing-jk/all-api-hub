/* global chrome */

/** Runs in the extension origin and takes the same write lock as the app. */
export async function patchMagpieBrowserState(config) {
  return navigator.locks.request("all-api-hub:user-preferences", async () => {
    const keys = [
      "user_preferences",
      "api_credential_profiles",
      "managedSiteModelSync_lastExecution",
    ]
    const raw = await chrome.storage.local.get(keys)
    const parse = (value) =>
      typeof value === "string" ? JSON.parse(value) : value
    const prefs = parse(raw.user_preferences)
    if (!prefs) throw new Error("Extension preferences have not initialized")
    const patches = [
      { path: ["managedSiteType"], value: "magpie" },
      { path: ["magpie", "baseUrl"], value: config.baseUrl },
      { path: ["magpie", "webKey"], value: config.webKey },
      { path: ["openChangelogOnUpdate"], value: false },
      { path: ["managedSiteModelSync", "enabled"], value: false },
      { path: ["managedSiteModelSync", "maxRetries"], value: 0 },
      { path: ["managedSiteModelSync", "allowedModels"], value: [] },
      {
        path: ["managedSiteModelSync", "globalChannelModelFilters"],
        value: [],
      },
      { path: ["autoCheckin", "globalEnabled"], value: false },
      { path: ["autoCheckin", "pretriggerDailyOnUiOpen"], value: false },
    ]
    for (const patch of patches) {
      let owner = prefs
      for (const part of patch.path.slice(0, -1)) owner = owner[part] ??= {}
      const key = patch.path.at(-1)
      patch.before = owner[key]
      owner[key] = patch.value
    }
    prefs.lastUpdated = Date.now()
    await chrome.storage.local.set({
      user_preferences:
        typeof raw.user_preferences === "string"
          ? JSON.stringify(prefs)
          : prefs,
    })
    return {
      patches,
      credentialIds: (parse(raw.api_credential_profiles)?.profiles ?? []).map(
        (p) => p.id,
      ),
      history: raw.managedSiteModelSync_lastExecution,
    }
  })
}

/** Compare before restoring; an unrelated edit never causes whole-store rollback. */
export async function restoreMagpieBrowserState({
  snapshot,
  config,
  invalidKey,
  credentialNames,
  credentialIds,
  resourceIds,
}) {
  const parse = (value) =>
    typeof value === "string" ? JSON.parse(value) : value
  const write = async (key, value, raw) =>
    value === undefined
      ? chrome.storage.local.remove(key)
      : chrome.storage.local.set({
          [key]: typeof raw === "string" ? JSON.stringify(value) : value,
        })
  await navigator.locks.request("all-api-hub:user-preferences", async () => {
    const raw = (await chrome.storage.local.get("user_preferences"))
      .user_preferences
    const prefs = parse(raw)
    for (const patch of snapshot.patches) {
      let owner = prefs
      for (const part of patch.path.slice(0, -1)) owner = owner?.[part]
      if (!owner) continue
      const key = patch.path.at(-1)
      const matches =
        JSON.stringify(owner[key]) === JSON.stringify(patch.value) ||
        (patch.path.join(".") === "magpie.webKey" && owner[key] === invalidKey)
      if (matches) {
        if (patch.before === undefined) delete owner[key]
        else owner[key] = patch.before
      }
    }
    prefs.lastUpdated = Date.now()
    await write("user_preferences", prefs, raw)
  })
  await navigator.locks.request(
    "all-api-hub:api-credential-profiles",
    async () => {
      const key = "api_credential_profiles"
      const raw = (await chrome.storage.local.get(key))[key]
      const profiles = parse(raw)
      if (!profiles) return
      const owned = new Set(
        credentialIds.filter((id) => !snapshot.credentialIds.includes(id)),
      )
      for (const p of profiles.profiles ?? [])
        if (
          !snapshot.credentialIds.includes(p.id) &&
          credentialNames.includes(p.name)
        )
          owned.add(p.id)
      profiles.profiles = (profiles.profiles ?? []).filter(
        (p) => !owned.has(p.id),
      )
      profiles.links = (profiles.links ?? []).filter(
        (link) => !owned.has(link.profileId),
      )
      profiles.lastUpdated = Date.now()
      await write(key, profiles, raw)
    },
  )
  const historyKey = "managedSiteModelSync_lastExecution"
  const history = parse(
    (await chrome.storage.local.get(historyKey))[historyKey],
  )
  if (
    history?.items?.length &&
    history.items.every(
      (item) =>
        item.resourceRef?.siteType === "magpie" &&
        item.resourceRef.scopeKey === config.baseUrl.replace(/\/+$/, "") &&
        resourceIds.includes(item.resourceRef.resourceId),
    )
  ) {
    if (snapshot.history === undefined)
      await chrome.storage.local.remove(historyKey)
    else await chrome.storage.local.set({ [historyKey]: snapshot.history })
  }
}
