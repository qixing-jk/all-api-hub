import { fireEvent, render } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { SiteFavicon } from "~/components/icons/SiteFavicon"

const pageUrl = "https://site.example/docs?q=one&lang=en#intro"
const tabIcon = "https://site.example/icon.png"

function stubRuntime(
  protocol: string,
  permissions = ["favicon"],
  manifestVersion = 3,
) {
  vi.stubGlobal("browser", {
    runtime: {
      getManifest: () => ({ manifest_version: manifestVersion, permissions }),
      getURL: (path: string) => `${protocol}://extension${path}`,
    },
  })
}

afterEach(() => vi.unstubAllGlobals())

it("tries the encoded Chromium cache URL first and recovers through the tab image to the globe", () => {
  stubRuntime("chrome-extension")
  const { container } = render(
    <SiteFavicon pageUrl={pageUrl} favIconUrl={tabIcon} />,
  )
  const image = () => container.querySelector("img")!

  expect(image()).toHaveAttribute(
    "src",
    "chrome-extension://extension/_favicon/?pageUrl=https%3A%2F%2Fsite.example%2Fdocs%3Fq%3Done%26lang%3Den%23intro&size=32",
  )
  expect(image()).toHaveAttribute("referrerpolicy", "no-referrer")
  expect(image()).toHaveAttribute("aria-hidden", "true")
  fireEvent.error(image())
  expect(image()).toHaveAttribute("src", tabIcon)
  fireEvent.error(image())
  expect(container.querySelector("img")).toBeNull()
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
})

it.each([
  ["moz-extension", ["favicon"], 3],
  ["safari-web-extension", ["favicon"], 3],
  ["chrome-extension", ["tabs"], 3],
  ["chrome-extension", ["favicon"], 2],
] as const)(
  "uses the tab image directly for %s with permissions %j on MV%s",
  (protocol, permissions, version) => {
    stubRuntime(protocol, [...permissions], version)
    const { container } = render(
      <SiteFavicon pageUrl={pageUrl} favIconUrl={tabIcon} />,
    )
    expect(container.querySelector("img")).toHaveAttribute("src", tabIcon)
  },
)

it("ignores unsafe sources and tries a new image after a previous source has failed", () => {
  vi.stubGlobal("browser", undefined)
  const { container, rerender } = render(
    <SiteFavicon pageUrl={pageUrl} favIconUrl="about:logo" />,
  )
  expect(container.querySelector("img")).toBeNull()
  rerender(<SiteFavicon pageUrl={pageUrl} favIconUrl={tabIcon} />)
  fireEvent.error(container.querySelector("img")!)
  expect(container.querySelector("img")).toBeNull()
  rerender(
    <SiteFavicon pageUrl={pageUrl} favIconUrl="data:image/png;base64,AA==" />,
  )
  expect(container.querySelector("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,AA==",
  )
})
