import { describe, expect, it } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedSiteDeploymentLink } from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteDeploymentLink"
import { render, screen } from "~~/tests/test-utils/render"

describe("ManagedSiteDeploymentLink", () => {
  it("follows the displayed provider and exposes the searchable link target", async () => {
    const { rerender } = render(
      <ManagedSiteDeploymentLink siteType={SITE_TYPES.NEW_API} />,
    )
    const link = await screen.findByRole("link", {
      name: "settings:managedSite.deploymentDocsLink",
    })
    expect(link).toHaveAttribute(
      "href",
      "https://docs.newapi.ai/en/docs/installation",
    )
    expect(link).toHaveAttribute(
      "id",
      SETTINGS_ANCHORS.MANAGED_SITE_DEPLOYMENT_DOCS,
    )
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    rerender(<ManagedSiteDeploymentLink siteType={SITE_TYPES.SUB2API} />)
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/Wei-Shaw/sub2api#deployment",
    )
  })
})
