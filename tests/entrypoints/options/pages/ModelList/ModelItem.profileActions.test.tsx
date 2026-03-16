import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen } from "~~/tests/test-utils/render"

describe("ModelItem profile actions", () => {
  it("exposes credential-based API and CLI verification for profile-backed rows", async () => {
    const user = userEvent.setup()
    const onVerifyModel = vi.fn()
    const onVerifyCliSupport = vi.fn()

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
      <ModelItem
        model={{
          model_name: "gpt-4o-mini",
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: [],
        }}
        calculatedPrice={{
          inputUSD: 0,
          outputUSD: 0,
          inputCNY: 0,
          outputCNY: 0,
        }}
        exchangeRate={1}
        showRealPrice={false}
        showRatioColumn={false}
        showEndpointTypes={true}
        userGroup="default"
        availableGroups={[]}
        source={profileSource}
        onVerifyModel={onVerifyModel}
        onVerifyCliSupport={onVerifyCliSupport}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:actions.keyForModel",
      }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "modelList:expandDetails",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyApi",
      }),
    )

    expect(onVerifyModel).toHaveBeenCalledWith(profileSource, "gpt-4o-mini")

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:actions.verifyCliSupport",
      }),
    )

    expect(onVerifyCliSupport).toHaveBeenCalledWith(
      profileSource,
      "gpt-4o-mini",
    )
  })
})
