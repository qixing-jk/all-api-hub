import { createElement, type ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { buttonVariants, type Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

/** Exercise shared variant classes with real CSS; component tests cover prop wiring. */
function sizingControl({
  size,
  variant,
  className,
  leftIcon,
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return createElement(
    "button",
    { ...props, className: cn(buttonVariants({ size, variant }), className) },
    leftIcon && createElement("span", null, leftIcon),
    children,
  )
}

test("shared buttons grow for wrapped text and preserve compact and icon sizes", async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await waitForExtensionRoot(page)

  // Measure the shared variants with the extension's built stylesheet.
  // DOM-only component tests cannot establish intrinsic sizing support.
  const sizes = { default: 36, sm: 32, lg: 40 } as const
  const markup = renderToStaticMarkup(
    createElement(
      "section",
      { "aria-label": "Button sizing", style: { display: "grid", gap: 16 } },
      ...Object.keys(sizes).map((size) =>
        sizingControl({
          size: size as keyof typeof sizes,
          variant: "outline",
          "aria-label": size,
          style: { width: 320, justifySelf: "start" },
          leftIcon: createElement("svg", {
            width: 16,
            height: 16,
            "aria-hidden": true,
          }),
          children: "Save account changes",
        }),
      ),
      createElement(
        "a",
        {
          href: "#",
          "aria-label": "Linked action",
          className: cn(buttonVariants()),
          style: { width: 320, justifySelf: "start" },
        },
        "Save account changes",
      ),
      sizingControl({
        className: "h-6 min-h-0 px-2 py-0 text-xs whitespace-nowrap",
        style: { justifySelf: "start" },
        children: "Compact action",
      }),
      sizingControl({
        className: "h-auto min-h-0 p-0 text-xs",
        style: { justifySelf: "start" },
        children: "Inline action",
      }),
      ...(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((size) =>
        sizingControl({ size, "aria-label": size }),
      ),
    ),
  )
  await page.evaluate((html) => {
    const host = document.createElement("div")
    host.style.cssText =
      "position:fixed;inset:0;z-index:9999;background:white;padding:16px;overflow:auto"
    host.innerHTML = html
    document.body.append(host)
  }, markup)
  await page.evaluate(() => document.fonts.ready)
  const fixture = page.getByRole("region", { name: "Button sizing" })

  for (const [size, height] of Object.entries(sizes)) {
    const button = fixture.getByRole("button", { name: size, exact: true })
    await expect
      .poll(async () => (await button.boundingBox())?.height)
      .toBe(height)
    await button.evaluate((node) => {
      node.style.width = "96px"
    })
    await expect
      .poll(async () => (await button.boundingBox())?.height)
      .toBeGreaterThan(height)
    expect(
      await button.evaluate((node) => node.scrollHeight <= node.clientHeight),
    ).toBe(true)
  }
  const link = fixture.getByRole("link", { name: "Linked action" })
  await expect.poll(async () => (await link.boundingBox())?.height).toBe(36)
  await link.evaluate((node) => {
    node.style.width = "80px"
  })
  await expect
    .poll(async () => (await link.boundingBox())?.height)
    .toBeGreaterThan(36)
  for (const [name, height] of Object.entries({
    "Compact action": 24,
    "Inline action": 16,
    "icon-xs": 24,
    "icon-sm": 32,
    icon: 36,
    "icon-lg": 40,
  })) {
    await expect
      .poll(
        async () =>
          (
            await fixture
              .getByRole("button", { name, exact: true })
              .boundingBox()
          )?.height,
      )
      .toBe(height)
  }
  await fixture.screenshot({ path: testInfo.outputPath("button-sizing.png") })
})
