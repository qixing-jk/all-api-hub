import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TabsContent } from "~/components/ui"
import {
  getProviderFilterAnalyticsResultCount,
  ProviderTabs,
} from "~/features/ModelList/components/ProviderTabs"
import type { ModelVendorCatalogEntry } from "~/services/models/modelMetadata/types"
import {
  MODEL_VENDOR_FILTER_VALUES,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const { trackProductAnalyticsActionCompletedMock } = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
}))

vi.mock("@heroicons/react/24/outline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@heroicons/react/24/outline")>()
  const CpuChipIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="generic" {...props} />
  )

  return { ...actual, CpuChipIcon }
})

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  const createIcon = (name: string) =>
    function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
      return <svg role="img" data-filter-icon={name} {...props} />
    }

  return {
    ...actual,
    CircleHelp: createIcon("unknown-vendor"),
    LayoutGrid: createIcon("all-vendors"),
  }
})

vi.mock("@lobehub/icons/es/Google/components/Color", () => ({
  default: (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="Google-color" {...props} />
  ),
}))

vi.mock("@lobehub/icons/es/Google/components/Mono", () => ({
  default: (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="Google-mono" {...props} />
  ),
}))

vi.mock("@lobehub/icons/es/OpenAI/components/Mono", () => ({
  default: (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="OpenAI-mono" {...props} />
  ),
}))

vi.mock("@lobehub/icons/es/Anthropic/components/Mono", () => ({
  default: (props: React.SVGProps<SVGSVGElement>) => (
    <svg role="img" data-publisher-icon="Anthropic-mono" {...props} />
  ),
}))

type CountedVendor = ModelVendorCatalogEntry & { count: number }

const VENDOR_CATALOG: CountedVendor[] = [
  {
    kind: "known",
    key: "known:openai",
    knownId: "openai",
    label: "OpenAI",
    count: 2,
  },
  {
    kind: "known",
    key: "known:anthropic",
    knownId: "anthropic",
    label: "Anthropic",
    count: 1,
  },
  {
    kind: "custom",
    key: "custom:example%20lab",
    label: "Example Lab",
    count: 1,
  },
]
const GOOGLE_VENDOR: CountedVendor = {
  kind: "known",
  key: "known:google",
  knownId: "google",
  label: "Google",
  count: 1,
}
const TABLIST_CLIENT_WIDTH_PX = 100
const TABLIST_SCROLL_WIDTH_PX = 300
const BASE_FILTERED_MODELS_COUNT = 10

beforeEach(() => {
  vi.clearAllMocks()
})

const renderProviderTabs = ({
  vendorCatalog = VENDOR_CATALOG,
  effectiveSelectedVendor = MODEL_VENDOR_FILTER_VALUES.All,
  allVendorsFilteredCount = BASE_FILTERED_MODELS_COUNT,
  unclassifiedVendorCount = 0,
  setSelectedProvider = vi.fn(),
}: {
  vendorCatalog?: CountedVendor[]
  effectiveSelectedVendor?: ModelVendorFilterValue
  allVendorsFilteredCount?: number
  unclassifiedVendorCount?: number
  setSelectedProvider?: ReturnType<typeof vi.fn>
} = {}) => {
  const createElement = (catalog: CountedVendor[]) => (
    <ProviderTabs
      vendorCatalog={catalog}
      effectiveSelectedVendor={effectiveSelectedVendor}
      setSelectedProvider={setSelectedProvider}
      allVendorsFilteredCount={allVendorsFilteredCount}
      unclassifiedVendorCount={unclassifiedVendorCount}
    >
      <TabsContent value={MODEL_VENDOR_FILTER_VALUES.All}>All</TabsContent>
      {catalog.map((vendor) => (
        <TabsContent key={vendor.key} value={vendor.key}>
          {vendor.label}
        </TabsContent>
      ))}
      {unclassifiedVendorCount > 0 && (
        <TabsContent value={MODEL_VENDOR_FILTER_VALUES.Unclassified}>
          Unclassified
        </TabsContent>
      )}
    </ProviderTabs>
  )
  const renderResult = render(createElement(vendorCatalog))

  return {
    setSelectedProvider,
    rerenderVendorCatalog: (nextCatalog: CountedVendor[]) =>
      renderResult.rerender(createElement(nextCatalog)),
  }
}

describe("ProviderTabs scroll arrows", () => {
  it("enables right arrow when tab list overflows", async () => {
    renderProviderTabs()

    const tabList = await screen.findByRole("tablist")
    Object.defineProperty(tabList, "clientWidth", {
      value: TABLIST_CLIENT_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollWidth", {
      value: TABLIST_SCROLL_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    })

    fireEvent.scroll(tabList)

    const leftArrow = screen.getByLabelText("modelList:providerTabs.scrollLeft")
    const rightArrow = screen.getByLabelText(
      "modelList:providerTabs.scrollRight",
    )

    await waitFor(() => expect(leftArrow).toBeDisabled())
    await waitFor(() => expect(rightArrow).toBeEnabled())
  })

  it("scrolls the tab list when clicking arrows", async () => {
    const user = userEvent.setup()
    renderProviderTabs()

    const tabList = await screen.findByRole("tablist")
    Object.defineProperty(tabList, "clientWidth", {
      value: TABLIST_CLIENT_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollWidth", {
      value: TABLIST_SCROLL_WIDTH_PX,
      configurable: true,
    })
    Object.defineProperty(tabList, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    })

    const scrollBy = vi.fn()
    Object.defineProperty(tabList, "scrollBy", {
      value: scrollBy,
      configurable: true,
    })

    fireEvent.scroll(tabList)

    const rightArrow = screen.getByLabelText(
      "modelList:providerTabs.scrollRight",
    )
    await waitFor(() => expect(rightArrow).toBeEnabled())
    await user.click(rightArrow)

    expect(scrollBy).toHaveBeenCalled()
    const callArg = scrollBy.mock.calls[0]?.[0]
    expect(callArg).toEqual(
      expect.objectContaining({
        behavior: "auto",
      }),
    )
    expect(callArg.left).toBeGreaterThan(0)
  })

  it("refreshes arrow availability when same-length dynamic labels change overflow", async () => {
    let scrollWidth = TABLIST_CLIENT_WIDTH_PX
    const shortCatalog: CountedVendor[] = [
      {
        kind: "custom",
        key: "custom:example%20lab",
        label: "Lab",
        count: 1,
      },
    ]
    const longCatalog: CountedVendor[] = [
      {
        ...shortCatalog[0],
        label: "Example Vendor With A Much Longer Dynamic Label",
      },
    ]
    const { rerenderVendorCatalog } = renderProviderTabs({
      vendorCatalog: shortCatalog,
    })
    const tabList = await screen.findByRole("tablist")
    Object.defineProperties(tabList, {
      clientWidth: {
        configurable: true,
        get: () => TABLIST_CLIENT_WIDTH_PX,
      },
      scrollWidth: {
        configurable: true,
        get: () => scrollWidth,
      },
      scrollLeft: {
        configurable: true,
        writable: true,
        value: 0,
      },
    })
    const rightArrow = screen.getByRole("button", {
      name: "modelList:providerTabs.scrollRight",
    })

    expect(rightArrow).toBeDisabled()

    scrollWidth = TABLIST_SCROLL_WIDTH_PX
    rerenderVendorCatalog(longCatalog)
    await waitFor(() => expect(rightArrow).toBeEnabled())

    scrollWidth = TABLIST_CLIENT_WIDTH_PX
    rerenderVendorCatalog(shortCatalog)
    await waitFor(() => expect(rightArrow).toBeDisabled())
  })
})

describe("ProviderTabs selection", () => {
  it("reports zero analytics results for a stale vendor absent from the catalog", () => {
    expect(
      getProviderFilterAnalyticsResultCount(
        "custom:missing-vendor",
        VENDOR_CATALOG,
        BASE_FILTERED_MODELS_COUNT,
        0,
      ),
    ).toBe(0)
  })

  it("renders namespaced dynamic vendor labels, counts, and the effective selection", async () => {
    const vendorCatalog = [GOOGLE_VENDOR, ...VENDOR_CATALOG]

    renderProviderTabs({
      vendorCatalog,
      effectiveSelectedVendor: "custom:example%20lab",
      allVendorsFilteredCount: 4,
    })

    const allProvidersTab = await screen.findByRole("tab", {
      name: /allProviders.*\(4\)/,
    })
    const customVendorTab = screen.getByRole("tab", {
      name: /Example Lab \(1\)/,
    })

    expect(allProvidersTab).toHaveAttribute("aria-selected", "false")
    expect(customVendorTab).toHaveAttribute("aria-selected", "true")
    expect(
      screen.queryByRole("tab", { name: /unclassified/i }),
    ).not.toBeInTheDocument()

    const orderedTabs = screen.getAllByRole("tab")
    expect(orderedTabs).toEqual([
      allProvidersTab,
      screen.getByRole("tab", { name: /Google \(1\)/ }),
      screen.getByRole("tab", { name: /OpenAI \(2\)/ }),
      screen.getByRole("tab", { name: /Anthropic \(1\)/ }),
      customVendorTab,
    ])

    const decorativeIcons = screen.getAllByRole("img", { hidden: true })
    expect(decorativeIcons).toHaveLength(5)
    expect(
      within(allProvidersTab).getByRole("img", { hidden: true }),
    ).toHaveAttribute("data-filter-icon", "all-vendors")
    expect(
      within(screen.getByRole("tab", { name: /Google \(1\)/ })).getByRole(
        "img",
        { hidden: true },
      ),
    ).toHaveAttribute("data-publisher-icon", "Google-color")
    expect(
      within(screen.getByRole("tab", { name: /OpenAI \(2\)/ })).getByRole(
        "img",
        { hidden: true },
      ),
    ).toHaveAttribute("data-publisher-icon", "OpenAI-mono")
    expect(
      within(screen.getByRole("tab", { name: /Anthropic \(1\)/ })).getByRole(
        "img",
        { hidden: true },
      ),
    ).toHaveAttribute("data-publisher-icon", "Anthropic-mono")
    expect(
      within(customVendorTab).getByRole("img", { hidden: true }),
    ).toHaveAttribute("data-publisher-icon", "generic")
    for (const icon of decorativeIcons) {
      expect(icon).toHaveAttribute("aria-hidden", "true")
    }
    expect(screen.queryAllByRole("img")).toHaveLength(0)
    expect(screen.queryByText(/https?:\/\//)).not.toBeInTheDocument()
  })

  it("renders the unclassified tab after every vendor with a distinct unknown presentation and explanatory copy", async () => {
    renderProviderTabs({
      effectiveSelectedVendor: MODEL_VENDOR_FILTER_VALUES.Unclassified,
      allVendorsFilteredCount: 6,
      unclassifiedVendorCount: 2,
    })

    const unclassifiedTab = await screen.findByRole("tab", {
      name: /unclassified.*\(2\)/i,
    })
    expect(unclassifiedTab).toHaveAttribute("aria-selected", "true")
    expect(unclassifiedTab).toHaveAttribute(
      "title",
      "modelList:providerTabs.unclassifiedDescription",
    )
    expect(screen.getAllByRole("tab").at(-1)).toBe(unclassifiedTab)

    const allProvidersTab = screen.getByRole("tab", {
      name: /allProviders.*\(6\)/,
    })
    expect(
      within(allProvidersTab).getByRole("img", { hidden: true }),
    ).toHaveAttribute("data-filter-icon", "all-vendors")
    expect(
      within(unclassifiedTab).getByRole("img", { hidden: true }),
    ).toHaveAttribute("data-filter-icon", "unknown-vendor")
  })

  it("reuses provider-filter analytics with the unclassified result count", async () => {
    const user = userEvent.setup()
    const { setSelectedProvider } = renderProviderTabs({
      unclassifiedVendorCount: 3,
    })

    await user.click(
      await screen.findByRole("tab", { name: /unclassified.*\(3\)/i }),
    )

    expect(setSelectedProvider).toHaveBeenCalledWith(
      MODEL_VENDOR_FILTER_VALUES.Unclassified,
    )
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter,
        filterCount: 1,
        resultCount: 3,
      },
    })
  })

  it("selects a vendor tab and reports the namespaced key", async () => {
    const user = userEvent.setup()
    const { setSelectedProvider } = renderProviderTabs()

    await user.click(
      await screen.findByRole("tab", { name: /Anthropic \(1\)/ }),
    )

    expect(setSelectedProvider).toHaveBeenCalledWith("known:anthropic")
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter,
        filterCount: 1,
        resultCount: 1,
      },
    })
  })

  it("keeps a vendor tab selected and lets users switch back to all", async () => {
    const user = userEvent.setup()
    const { setSelectedProvider } = renderProviderTabs({
      effectiveSelectedVendor: "known:openai",
    })

    const allProvidersTab = await screen.findByRole("tab", {
      name: /allProviders.*\(10\)/,
    })
    const openAiTab = screen.getByRole("tab", {
      name: /OpenAI \(2\)/,
    })

    expect(openAiTab).toHaveAttribute("aria-selected", "true")
    expect(allProvidersTab).toHaveAttribute("aria-selected", "false")

    await user.click(allProvidersTab)

    expect(setSelectedProvider).toHaveBeenCalledWith(
      MODEL_VENDOR_FILTER_VALUES.All,
    )
  })

  it("preserves Radix arrow-key selection semantics", async () => {
    const user = userEvent.setup()
    const { setSelectedProvider } = renderProviderTabs()
    const allVendorsTab = await screen.findByRole("tab", {
      name: /allProviders.*\(10\)/,
    })

    await user.click(allVendorsTab)
    setSelectedProvider.mockClear()
    await user.keyboard("{ArrowRight}")

    expect(screen.getByRole("tab", { name: /OpenAI \(2\)/ })).toHaveFocus()
    expect(setSelectedProvider).toHaveBeenCalledWith("known:openai")
  })
})
