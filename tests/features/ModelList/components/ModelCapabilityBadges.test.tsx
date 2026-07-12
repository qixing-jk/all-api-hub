import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ModelCapabilityBadges } from "~/features/ModelList/components/ModelItem/ModelCapabilityBadges"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

describe("ModelCapabilityBadges", () => {
  it("renders granular model capability badges with explanations", () => {
    render(
      <ModelCapabilityBadges
        modelMetadata={{
          id: "openai/gpt-image-1",
          name: "GPT Image 1",
          provider_id: "openai",
          capabilities: {
            reasoning: true,
            toolCall: true,
            structuredOutput: true,
          },
          modalities: {
            input: ["text", "image", "audio", "video", "pdf"],
            output: ["text", "image", "audio", "video"],
          },
        }}
      />,
    )

    expect(
      screen.getByText("modelCapabilityFilter.groups.input"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.groups.output"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.groups.capabilities"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.imageInput"),
    ).toHaveAttribute(
      "title",
      "modelCapabilityFilter.options.imageInput: modelCapabilityFilter.descriptions.imageInput",
    )
    expect(
      screen.getByText("modelCapabilityFilter.options.imageOutput"),
    ).toHaveAttribute(
      "title",
      "modelCapabilityFilter.options.imageOutput: modelCapabilityFilter.descriptions.imageOutput",
    )
    expect(
      screen.getByText("modelCapabilityFilter.options.audioInput"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.audioOutput"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.videoInput"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.videoOutput"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.pdf"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.reasoning"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.toolCall"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("modelCapabilityFilter.options.structuredOutput"),
    ).toBeInTheDocument()
  })
})
