import { SITE_TYPES } from "~/constants/siteType"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { toFacts } from "~/services/apiAdapters/openrouter/accountKeyDisplayFacts"
import {
  drainMembers,
  getOpenRouterKeyResource,
  listOpenRouterKeyResources,
  loadWorkspaceScopeInventory,
  openOpenRouterKeyResourceConfig,
} from "~/services/apiAdapters/openrouter/accountKeyInventory"
import {
  createOpenRouterKeyResource,
  deleteOpenRouterKeyResource,
  updateOpenRouterKeyResource,
} from "~/services/apiAdapters/openrouter/accountKeyMutations"
import {
  mapFailure,
  read,
} from "~/services/apiAdapters/openrouter/accountKeyRuntime"
import {
  createOpenRouterKeyEditorSession,
  createOpenRouterKeyEditSession,
  type OpenRouterKeyDetail,
} from "~/services/apiAdapters/openrouter/keyEditorSession"

/** OpenRouter native key resources use only the documented Management API fields. */
export const openRouterAccountKeyResources = defineAccountKeyResourceCapability(
  {
    siteType: SITE_TYPES.OPENROUTER,
    defaultCreation: "editor-defaults",
    // OpenRouter returns plaintext only from key creation; existing inventory
    // rows expose an opaque hash and masked key. Local profile associations are
    // the only supported historical recovery source.
    inventorySecretAvailability:
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    openConfig: openOpenRouterKeyResourceConfig,
    listScopes: async (config, options) =>
      (await loadWorkspaceScopeInventory(config, options)).scopes,
    listScopeInventory: loadWorkspaceScopeInventory,
    defaultScopeKey: (config) => config.defaultWorkspace.id,
    encodeLocator: (hash) => hash,
    decodeLocator: (resourceId) => resourceId,
    locatorFromListItem: (item: OpenRouterKeyDetail) => item.key.hash,
    locatorFromDetail: (detail: OpenRouterKeyDetail) => detail.key.hash,
    list: listOpenRouterKeyResources,
    get: getOpenRouterKeyResource,
    toListFacts: (item, ref) => toFacts(item, ref),
    toDetailFacts: (detail, ref) => toFacts(detail, ref),
    createEditor: async (config, scope, options, scopeInventory, intent) => {
      const scopeEntries =
        scopeInventory?.scopes ??
        (await loadWorkspaceScopeInventory(config, options)).scopes
      return createOpenRouterKeyEditorSession({
        scope,
        scopeEntries,
        intent,
        loadMembers: (workspaceId, loadOptions) =>
          read(config, () => drainMembers(config, workspaceId, loadOptions), [
            workspaceId,
          ]),
      })
    },
    editEditor: (_config, scope, detail) =>
      createOpenRouterKeyEditSession(scope, detail),
    create: createOpenRouterKeyResource,
    update: updateOpenRouterKeyResource,
    delete: deleteOpenRouterKeyResource,
    mapFailure,
  },
)
