import { Tab } from "@headlessui/react"
import { describe, expect, it, vi } from "vitest"

import { ProviderTabs } from "~/features/ModelList/components/ProviderTabs"
import {
  MODEL_PROVIDER_FILTER_VALUES,
  type ModelProviderFilterValue,
} from "~/services/models/utils/modelProviders"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const createProviders = () => ["OpenAI", "Claude", "Gemini"] as any
const TABLIST_CLIENT_WIDTH_PX = 100
const TABLIST_SCROLL_WIDTH_PX = 300
const BASE_FILTERED_MODELS_COUNT = 10
const PROVIDER_FILTERED_MODELS_COUNT = 1
const DEFAULT_PROVIDER_COUNTS = {
  OpenAI: 2,
  Claude: 1,
  Gemini: 1,
} as const

const renderProviderTabs = ({
  providerCounts = DEFAULT_PROVIDER_COUNTS,
  selectedProvider = MODEL_PROVIDER_FILTER_VALUES.ALL,
  allProvidersFilteredCount = BASE_FILTERED_MODELS_COUNT,
  setSelectedProvider = vi.fn(),
}: {
  providerCounts?: Record<string, number>
  selectedProvider?: ModelProviderFilterValue
  allProvidersFilteredCount?: number
  setSelectedProvider?: ReturnType<typeof vi.fn>
} = {}) => {
  render(
    <ProviderTabs
      providers={createProviders()}
      selectedProvider={selectedProvider}
      setSelectedProvider={setSelectedProvider}
      allProvidersFilteredCount={allProvidersFilteredCount}
      getProviderFilteredCount={(provider) => providerCounts[provider] ?? 0}
    >
      <Tab.Panels>
        <Tab.Panel>All</Tab.Panel>
        <Tab.Panel>OpenAI</Tab.Panel>
        <Tab.Panel>Claude</Tab.Panel>
        <Tab.Panel>Gemini</Tab.Panel>
      </Tab.Panels>
    </ProviderTabs>,
  )

  return { setSelectedProvider }
}

describe("ProviderTabs scroll arrows", () => {
  it("enables right arrow when tab list overflows", async () => {
    renderProviderTabs({
      providerCounts: {
        OpenAI: PROVIDER_FILTERED_MODELS_COUNT,
        Claude: PROVIDER_FILTERED_MODELS_COUNT,
        Gemini: PROVIDER_FILTERED_MODELS_COUNT,
      },
    })

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
    renderProviderTabs({
      providerCounts: {
        OpenAI: PROVIDER_FILTERED_MODELS_COUNT,
        Claude: PROVIDER_FILTERED_MODELS_COUNT,
        Gemini: PROVIDER_FILTERED_MODELS_COUNT,
      },
    })

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
    fireEvent.click(rightArrow)

    expect(scrollBy).toHaveBeenCalled()
    const callArg = scrollBy.mock.calls[0]?.[0]
    expect(callArg).toEqual(
      expect.objectContaining({
        behavior: "auto",
      }),
    )
    expect(callArg.left).toBeGreaterThan(0)
  })
})

describe("ProviderTabs selection", () => {
  it("filters out zero-count providers and falls back to the all tab when the selected provider is unavailable", async () => {
    renderProviderTabs({
      selectedProvider: "Claude",
      allProvidersFilteredCount: 3,
      providerCounts: {
        OpenAI: 2,
        Claude: 0,
        Gemini: 1,
      },
    })

    const allProvidersTab = await screen.findByRole("tab", {
      name: /allProviders.*\(3\)/,
    })
    const openAiTab = screen.getByRole("tab", {
      name: /OpenAI \(2\)/,
    })

    expect(screen.queryByRole("tab", { name: /Claude/ })).toBeNull()
    expect(allProvidersTab).toHaveAttribute("aria-selected", "true")
    expect(allProvidersTab).toHaveClass("text-blue-700")
    expect(openAiTab).toHaveAttribute("aria-selected", "false")
    expect(openAiTab).toHaveClass("text-gray-700")
  })

  it("selects a provider tab and reports the chosen provider", async () => {
    const { setSelectedProvider } = renderProviderTabs()

    fireEvent.click(await screen.findByRole("tab", { name: /Claude \(1\)/ }))

    expect(setSelectedProvider).toHaveBeenCalledWith("Claude")
  })

  it("keeps a provider tab selected when a non-all provider is active and lets users switch back to all", async () => {
    const { setSelectedProvider } = renderProviderTabs({
      selectedProvider: "OpenAI",
    })

    const allProvidersTab = await screen.findByRole("tab", {
      name: /allProviders.*\(10\)/,
    })
    const openAiTab = screen.getByRole("tab", {
      name: /OpenAI \(2\)/,
    })

    expect(openAiTab).toHaveAttribute("aria-selected", "true")
    expect(openAiTab).toHaveClass("text-blue-700")
    expect(allProvidersTab).toHaveAttribute("aria-selected", "false")
    expect(allProvidersTab).toHaveClass("text-gray-700")

    fireEvent.click(allProvidersTab)

    expect(setSelectedProvider).toHaveBeenCalledWith(
      MODEL_PROVIDER_FILTER_VALUES.ALL,
    )
  })
})
