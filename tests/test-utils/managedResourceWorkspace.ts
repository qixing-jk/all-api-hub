import { vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type {
  ManagedResourceRef,
  ManagedResourceWorkspace,
  ResourceDisplayFacts,
  ResourceEditor,
} from "~/services/apiAdapters/contracts/managedResourceNative"

export const EXAMPLE_MANAGED_RESOURCE_REF: ManagedResourceRef = {
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://console.example.invalid",
  resourceId: "opaque-resource-id",
}

export const createManagedResourceFacts = (
  resourceId = "opaque-resource-id",
  displayName = "Example resource",
): ResourceDisplayFacts => ({
  ref: { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId },
  displayName,
  status: "enabled",
  fields: [
    { fieldId: "baseURL", kind: "text", value: "https://api.example.invalid" },
    { fieldId: "supportedModels", kind: "list", value: ["model-example"] },
    { fieldId: "orderingWeight", kind: "number", value: 10 },
    { fieldId: "tags", kind: "list", value: ["tag-example"] },
  ],
  actions: { canUpdate: true, canDelete: true },
})

export const createManagedResourceEditor = (
  overrides: Partial<ResourceEditor> = {},
): ResourceEditor => ({
  fields: [{ fieldId: "name", type: "text", required: true }],
  initialValues: { name: "Example resource" },
  validate: vi.fn(() => ({ valid: true as const })),
  submit: vi.fn(async () => createManagedResourceFacts()),
  ...overrides,
})

export const createManagedResourceWorkspace = (
  overrides: Partial<ManagedResourceWorkspace> = {},
): ManagedResourceWorkspace => ({
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  list: vi.fn(async () => ({ items: [createManagedResourceFacts()] })),
  get: vi.fn(async () => createManagedResourceFacts()),
  openCreateEditor: vi.fn(async () => createManagedResourceEditor()),
  openEditEditor: vi.fn(async () => createManagedResourceEditor()),
  delete: vi.fn(async () => undefined),
  ...overrides,
})
