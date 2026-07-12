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
  it("does not render groups when the model has no displayable capabilities", () => {
    const { container } = render(
      <ModelCapabilityBadges
        modelMetadata={{
          id: "example/text-only",
          name: "Text Only",
          provider_id: "example",
          modalities: {
            input: ["text"],
            output: ["text"],
          },
        }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(
      screen.queryByText("modelCapabilityFilter.groups.input"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("modelCapabilityFilter.groups.output"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("modelCapabilityFilter.groups.capabilities"),
    ).not.toBeInTheDocument()
  })

  it("skips empty capability groups while rendering populated groups", () => {
    render(
      <ModelCapabilityBadges
        modelMetadata={{
          id: "example/image-input",
          name: "Image Input",
          provider_id: "example",
          modalities: {
            input: ["text", "image"],
            output: ["text"],
          },
        }}
      />,
    )

    expect(
      screen.getByText("modelCapabilityFilter.groups.input"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelCapabilityFilter.groups.output"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("modelCapabilityFilter.groups.capabilities"),
    ).not.toBeInTheDocument()
  })

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
