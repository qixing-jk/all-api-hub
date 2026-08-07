const REAL_SITE_E2E_CATEGORIES = {
  account: "account",
  managedSite: "managed-site",
  webdav: "webdav",
}

const REAL_SITE_E2E_MATRIX = [
  {
    id: "new-api-account",
    category: REAL_SITE_E2E_CATEGORIES.account,
    label: "Account / New API",
    env_prefix: "NEW_API",
    kind: "account",
    spec: "e2e/realSite/newApiAccountAdd.spec.ts",
  },
  {
    id: "one-hub-account",
    category: REAL_SITE_E2E_CATEGORIES.account,
    label: "Account / OneHub",
    env_prefix: "ONE_HUB",
    kind: "account",
    spec: "e2e/realSite/oneHubAccountAdd.spec.ts",
  },
  {
    id: "done-hub-account",
    category: REAL_SITE_E2E_CATEGORIES.account,
    label: "Account / DoneHub",
    env_prefix: "DONE_HUB",
    kind: "account",
    spec: "e2e/realSite/doneHubAccountAdd.spec.ts",
  },
  {
    id: "veloera-account",
    category: REAL_SITE_E2E_CATEGORIES.account,
    label: "Account / Veloera",
    env_prefix: "VELOERA",
    kind: "account",
    spec: "e2e/realSite/veloeraAccountAdd.spec.ts",
  },
  {
    id: "sub2api-account",
    category: REAL_SITE_E2E_CATEGORIES.account,
    label: "Account / Sub2API",
    env_prefix: "SUB2API",
    kind: "account",
    spec: "e2e/realSite/sub2apiAccountAdd.spec.ts",
  },
  {
    id: "new-api-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / New API Channels",
    env_prefix: "NEW_API",
    kind: "managed-site",
    managed_site_target: "new-api",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "veloera-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / Veloera Channels",
    env_prefix: "VELOERA",
    kind: "managed-site",
    managed_site_target: "Veloera",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "done-hub-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / DoneHub Channels",
    env_prefix: "DONE_HUB",
    kind: "managed-site",
    managed_site_target: "done-hub",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "octopus-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / Octopus Channels",
    env_prefix: "OCTOPUS",
    kind: "managed-site",
    managed_site_target: "octopus",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "axonhub-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / AxonHub Channels",
    env_prefix: "AXON_HUB",
    kind: "managed-site",
    managed_site_target: "axonhub",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "claude-code-hub-managed-site",
    category: REAL_SITE_E2E_CATEGORIES.managedSite,
    label: "Managed Site / Claude Code Hub Channels",
    env_prefix: "CLAUDE_CODE_HUB",
    kind: "managed-site",
    managed_site_target: "claude-code-hub",
    spec: "e2e/realSite/managedSiteChannels.spec.ts",
  },
  {
    id: "nutstore-webdav",
    category: REAL_SITE_E2E_CATEGORIES.webdav,
    label: "WebDAV / Nutstore",
    env_prefix: "NUTSTORE_WEBDAV",
    kind: "webdav",
    provider_name: "Nutstore",
    provider_account_prefix: "nutstore",
    spec: "e2e/realSite/webdavProviderFlow.spec.ts",
  },
  {
    id: "ctfile-webdav",
    category: REAL_SITE_E2E_CATEGORIES.webdav,
    label: "WebDAV / CTFile",
    env_prefix: "CTFILE_WEBDAV",
    kind: "webdav",
    provider_name: "CTFile",
    provider_account_prefix: "ctfile",
    spec: "e2e/realSite/webdavProviderFlow.spec.ts",
  },
]

export function normalizeRealSiteE2eCategory(category = "all") {
  const normalized = category.trim().toLowerCase()

  if (normalized === "managed_site" || normalized === "managedsite") {
    return REAL_SITE_E2E_CATEGORIES.managedSite
  }

  return normalized
}

function normalizeRealSiteE2eTarget(target = "all") {
  return target.trim().toLowerCase().replaceAll("_", "-")
}

export function filterRealSiteE2eMatrix(category = "all", target = "all") {
  const normalized = normalizeRealSiteE2eCategory(category)
  const normalizedTarget = normalizeRealSiteE2eTarget(target)

  if (normalized === "all") {
    if (normalizedTarget === "all") {
      return REAL_SITE_E2E_MATRIX
    }

    const targetEntry = REAL_SITE_E2E_MATRIX.find(
      (entry) => entry.id === normalizedTarget,
    )

    if (!targetEntry) {
      throwUnknownTarget(target)
    }

    return [targetEntry]
  }

  const allowedCategories = new Set(Object.values(REAL_SITE_E2E_CATEGORIES))
  if (!allowedCategories.has(normalized)) {
    throw new Error(
      `Unknown real-site E2E category: ${category}. Expected all, account, managed-site, or webdav.`,
    )
  }

  if (normalizedTarget === "all") {
    return REAL_SITE_E2E_MATRIX.filter((entry) => entry.category === normalized)
  }

  const targetEntry = REAL_SITE_E2E_MATRIX.find(
    (entry) => entry.id === normalizedTarget,
  )

  if (!targetEntry) {
    throwUnknownTarget(target)
  }

  if (targetEntry.category !== normalized) {
    throw new Error(
      `Real-site E2E target ${target} does not belong to category ${category}.`,
    )
  }

  return [targetEntry]
}

function throwUnknownTarget(target) {
  const availableTargets = REAL_SITE_E2E_MATRIX.map((entry) => entry.id).join(
    ", ",
  )

  throw new Error(
    `Unknown real-site E2E target: ${target}. Expected all or one of: ${availableTargets}.`,
  )
}
