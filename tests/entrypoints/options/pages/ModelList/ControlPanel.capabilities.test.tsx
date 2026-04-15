import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ControlPanel } from "~/features/ModelList/components/ControlPanel"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

describe("ControlPanel profile capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it("hides account-only pricing and group controls for profile-backed sources", async () => {
    const profileSource = createProfileSource({
      id: "profile-1",
      name: "Reusable Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://profile.example.com",
      apiKey: "sk-secret",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 2,
    })

    render(
      <ControlPanel
        selectedSource={profileSource}
        sourceCapabilities={profileSource.capabilities}
        searchTerm=""
        setSearchTerm={vi.fn()}
        sortMode={MODEL_LIST_SORT_MODES.DEFAULT}
        setSortMode={vi.fn()}
        selectedGroup="default"
        setSelectedGroup={vi.fn()}
        availableGroups={["default", "vip"]}
        pricingData={{ group_ratio: { default: 1, vip: 2 } }}
        loadPricingData={vi.fn()}
        isLoading={false}
        showRealPrice={false}
        setShowRealPrice={vi.fn()}
        showRatioColumn={false}
        setShowRatioColumn={vi.fn()}
        showEndpointTypes={true}
        setShowEndpointTypes={vi.fn()}
        totalModels={2}
        filteredModels={[
          { model: { model_name: "gpt-4o-mini" } },
          { model: { model_name: "claude-3-5-sonnet" } },
        ]}
      />,
    )

    expect(
      await screen.findByText("modelList:profileSourceNotice.title"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("modelList:profileSourceNotice.description"),
    ).toBeInTheDocument()
    expect(screen.queryByText("modelList:userGroup")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:realAmount")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:showRatio")).not.toBeInTheDocument()
    expect(screen.queryByText("modelList:sortBy")).not.toBeInTheDocument()
    expect(
      await screen.findByText("modelList:endpointTypes"),
    ).toBeInTheDocument()
  })

  it("renders group ratio labels, uses the group fallback ratio, and copies visible model names", async () => {
    const setSearchTerm = vi.fn()
    const setSortMode = vi.fn()
    const setSelectedGroup = vi.fn()
    const setShowRealPrice = vi.fn()
    const setShowRatioColumn = vi.fn()
    const setShowEndpointTypes = vi.fn()
    const loadPricingData = vi.fn()

    render(
      <ControlPanel
        selectedSource={{ kind: "account" } as any}
        sourceCapabilities={
          {
            supportsGroupFiltering: true,
            supportsPricing: true,
          } as any
        }
        searchTerm="gpt"
        setSearchTerm={setSearchTerm}
        sortMode={MODEL_LIST_SORT_MODES.DEFAULT}
        setSortMode={setSortMode}
        selectedGroup={undefined as any}
        setSelectedGroup={setSelectedGroup}
        availableGroups={["vip", "default"]}
        pricingData={{ group_ratio: { vip: 2 } }}
        loadPricingData={loadPricingData}
        isLoading={false}
        showRealPrice={false}
        setShowRealPrice={setShowRealPrice}
        showRatioColumn={true}
        setShowRatioColumn={setShowRatioColumn}
        showEndpointTypes={true}
        setShowEndpointTypes={setShowEndpointTypes}
        totalModels={5}
        filteredModels={[
          { model: { model_name: "gpt-4o-mini" } },
          { model: { model_name: "claude-3-5-sonnet" } },
        ]}
      />,
    )

    const searchInput = await screen.findByPlaceholderText(
      "modelList:searchPlaceholder",
    )
    fireEvent.change(searchInput, { target: { value: "claude" } })
    expect(setSearchTerm).toHaveBeenCalledWith("claude")

    const comboboxes = await screen.findAllByRole("combobox")
    const [sortSelect, groupSelect] = comboboxes
    expect(sortSelect).toHaveTextContent("modelList:sortOptions.default")
    fireEvent.click(sortSelect)
    fireEvent.click(await screen.findByText("modelList:sortOptions.priceAsc"))
    expect(setSortMode).toHaveBeenCalledWith(MODEL_LIST_SORT_MODES.PRICE_ASC)

    expect(groupSelect).toHaveTextContent("modelList:allGroups")
    fireEvent.click(groupSelect)

    expect(await screen.findByText("vip (2x)")).toBeInTheDocument()
    expect(screen.getByText("default (1x)")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "modelList:refreshData" }),
    )
    expect(loadPricingData).toHaveBeenCalledTimes(1)

    fireEvent.click(
      screen.getByRole("switch", { name: "modelList:realAmount" }),
    )
    expect(setShowRealPrice).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole("switch", { name: "modelList:showRatio" }))
    expect(setShowRatioColumn).toHaveBeenCalledWith(false)

    fireEvent.click(
      screen.getByRole("switch", { name: "modelList:endpointTypes" }),
    )
    expect(setShowEndpointTypes).toHaveBeenCalledWith(false)

    fireEvent.click(
      screen.getByRole("button", { name: "modelList:copyAllNames" }),
    )

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "gpt-4o-mini,claude-3-5-sonnet",
      ),
    )
    expect(toast.success).toHaveBeenCalledWith(
      "modelList:messages.modelNamesCopied",
    )
    expect(await screen.findByText("modelList:totalModels")).toBeInTheDocument()
    expect(await screen.findByText("modelList:showing")).toBeInTheDocument()
  })

  it("shows a toast error instead of copying when no models match the current filters", async () => {
    render(
      <ControlPanel
        selectedSource={{ kind: "account" } as any}
        sourceCapabilities={
          {
            supportsGroupFiltering: false,
            supportsPricing: false,
          } as any
        }
        searchTerm=""
        setSearchTerm={vi.fn()}
        sortMode={MODEL_LIST_SORT_MODES.DEFAULT}
        setSortMode={vi.fn()}
        selectedGroup="all"
        setSelectedGroup={vi.fn()}
        availableGroups={[]}
        pricingData={null}
        loadPricingData={vi.fn()}
        isLoading={false}
        showRealPrice={false}
        setShowRealPrice={vi.fn()}
        showRatioColumn={false}
        setShowRatioColumn={vi.fn()}
        showEndpointTypes={true}
        setShowEndpointTypes={vi.fn()}
        totalModels={0}
        filteredModels={[]}
      />,
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "modelList:copyAllNames" }),
    )

    expect(toast.error).toHaveBeenCalledWith("modelList:noMatchingModels")
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
    expect(screen.queryByText("modelList:userGroup")).toBeNull()
    expect(screen.queryByText("modelList:realAmount")).toBeNull()
    expect(screen.queryByText("modelList:showRatio")).toBeNull()
    expect(screen.queryByText("modelList:sortBy")).toBeNull()
  })
})
