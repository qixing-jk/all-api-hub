import type { TFunction } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NEW_API_MANAGED_RESOURCE_FIELD_IDS,
  NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
} from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import { createManagedResourcePresentationMapper } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import {
  createManagedResourceColumns,
  getManagedResourcePresentationSemantics,
} from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { newApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/newApi"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  list: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))

vi.mock("~/services/apiAdapters/managedSites/newApi", () => ({
  newApiManagedSiteCapabilities: {
    channels: {
      list: mocks.list,
    },
    channelDrafts: {},
    queries: {},
  },
}))

describe("New API managed-resource presentation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({
      newApi: {
        baseUrl: "https://new-api.example.invalid/",
        adminToken: "admin-token",
        userId: "42",
      },
    })
    mocks.list.mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 17,
          name: "Primary channel",
          base_url: "https://gateway.example.invalid/v1",
          status: 3,
        }),
      ],
      total: 1,
    })
  })

  it("keeps the base URL in the channel summary without a duplicate column", async () => {
    const workspace = await newApiManagedResourceRegistration.open()
    const page = await workspace.list()
    const resolveLabel = ((key: string) =>
      key === "managedSiteChannels:statusLabels.autoDisabled"
        ? "Localized auto disabled"
        : key) as TFunction
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel,
      fieldIds: NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      semantics: getManagedResourcePresentationSemantics(SITE_TYPES.NEW_API),
    })

    const row = mapper.map(page.items[0]!)

    expect(row.baseURL).toBe("https://gateway.example.invalid/v1")
    expect(row.cells[NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]).toMatchObject({
      value: "OpenAI",
      sortValue: "1",
    })
    expect(row.cells.status).toEqual({
      kind: "status",
      value: "Localized auto disabled",
      sortValue: "auto-disabled",
      tone: "warning",
    })
    expect(row.cells["newApi.status"]).toBeUndefined()

    const productPolicy = getAccountSiteDefinition(
      SITE_TYPES.NEW_API,
    )?.managedResource
    expect(productPolicy).toBeDefined()
    const columns = createManagedResourceColumns(
      resolveLabel,
      SITE_TYPES.NEW_API,
      productPolicy!,
      {},
    )
    const idColumn = columns.find(
      ({ id }) => id === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id,
    )
    const statusColumn = columns.find(
      ({ id }) => id === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status,
    )
    expect(
      columns.some(
        ({ id }) => id === NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      ),
    ).toBe(false)
    expect(idColumn).toMatchObject({
      renderer: "value",
      accessor: { kind: "cell", key: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id },
      routeFilter: { kind: "exact", queryKey: "channelId" },
    })
    expect(statusColumn).toMatchObject({
      accessor: { kind: "cell", key: "status" },
      sort: { accessor: { kind: "cellSortValue", key: "status" } },
      facet: { kind: "status" },
    })
  })

  it("preserves the manually disabled status label and warning tone", async () => {
    mocks.list.mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 17,
          name: "Paused channel",
          status: 2,
        }),
      ],
      total: 1,
    })
    const workspace = await newApiManagedResourceRegistration.open()
    const page = await workspace.list()
    const resolveLabel = ((key: string) =>
      key === "managedSiteChannels:statusLabels.manualPause"
        ? "Localized manual pause"
        : key) as TFunction
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel,
      fieldIds: NEW_API_MANAGED_RESOURCE_TABLE_FIELD_IDS,
      semantics: getManagedResourcePresentationSemantics(SITE_TYPES.NEW_API),
    })

    expect(mapper.map(page.items[0]!).cells.status).toEqual({
      kind: "status",
      value: "Localized manual pause",
      sortValue: "manually-disabled",
      tone: "warning",
    })
  })
})
