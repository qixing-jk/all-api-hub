import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ModelItem from "~/features/ModelList/components/ModelItem"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  createProfileModelVerificationHistoryTarget,
  createVerificationHistorySummary,
} from "~/services/verification/verificationResultHistory"
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

  it("shows persisted verification status for a profile-backed row", async () => {
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

    const verificationSummary = createVerificationHistorySummary({
      target: createProfileModelVerificationHistoryTarget(
        "profile-1",
        "gpt-4o-mini",
      ),
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      results: [
        {
          id: "models",
          status: "pass",
          latencyMs: 12,
          summary: "Stored model history",
        },
      ],
    })

    if (!verificationSummary) {
      throw new Error("Expected verification summary")
    }

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
        verificationSummary={verificationSummary}
        onVerifyModel={() => {}}
        onVerifyCliSupport={() => {}}
      />,
    )

    expect(
      await screen.findByText(
        "aiApiVerification:verifyDialog.history.lastVerified",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("aiApiVerification:verifyDialog.status.pass"),
    ).toBeInTheDocument()
  })
})
