import { describe, expect, it } from "vitest"

import {
  AI_ROUTER_API_ORIGIN,
  AI_ROUTER_HOSTNAMES,
  createDeploymentOriginLookup,
  DEPLOYMENT_API_ROLES,
  resolveDeploymentApiOrigin,
  SPLIT_ORIGIN_DEPLOYMENTS,
} from "~/constants/deploymentApiOrigins"

describe("resolveDeploymentApiOrigin", () => {
  it("maps registered split-origin deployments to their API origin", () => {
    expect(resolveDeploymentApiOrigin("https://ai-router.dev")).toBe(
      "https://api.ai-router.dev",
    )
    expect(resolveDeploymentApiOrigin("https://ai-router.dev/")).toBe(
      "https://api.ai-router.dev",
    )
    expect(resolveDeploymentApiOrigin("https://ai-router.dev/dashboard")).toBe(
      "https://api.ai-router.dev",
    )
    expect(
      resolveDeploymentApiOrigin("https://ai-router.dev/keys?page=1#top"),
    ).toBe("https://api.ai-router.dev")
  })

  it("maps equivalent hosts and case-insensitive hostnames", () => {
    expect(resolveDeploymentApiOrigin("https://www.ai-router.dev")).toBe(
      "https://api.ai-router.dev",
    )
    expect(resolveDeploymentApiOrigin("https://AI-ROUTER.DEV")).toBe(
      "https://api.ai-router.dev",
    )
  })

  it("keeps the API origin when it is already the request base", () => {
    expect(resolveDeploymentApiOrigin("https://api.ai-router.dev")).toBe(
      "https://api.ai-router.dev",
    )
  })

  it("leaves unregistered origins byte-for-byte unchanged", () => {
    for (const value of [
      "https://sub2api.example.com",
      "https://sub2api.example.com/prefix",
      "https://ai-router.dev.evil.example",
      "https://notai-router.dev",
      "https://vip.ai-router.dev",
      "https://vip.ai-router.site",
      "http://localhost:3000",
    ]) {
      expect(resolveDeploymentApiOrigin(value)).toBe(value)
    }
  })

  it("leaves non-http, relative and malformed inputs unchanged", () => {
    for (const value of [
      "",
      "   ",
      "ai-router.dev",
      "/api/v1/keys",
      "chrome-extension://abc/dashboard",
      "ftp://ai-router.dev",
      "https://",
      "not a url",
    ]) {
      expect(resolveDeploymentApiOrigin(value)).toBe(value)
    }
  })

  it("does not resolve inherited Object properties such as constructor or toString", () => {
    for (const name of ["constructor", "toString", "valueOf", "__proto__"]) {
      expect(resolveDeploymentApiOrigin(`https://${name}`)).toBe(
        `https://${name}`,
      )
    }
  })
})

describe("deployment registration", () => {
  it("declares an absolute API origin and unique browser hostnames per deployment", () => {
    const seen = new Set<string>()

    for (const deployment of Object.values(SPLIT_ORIGIN_DEPLOYMENTS)) {
      const apiOrigin = new URL(deployment.apiOrigin)
      expect(apiOrigin.protocol).toBe("https:")
      expect(apiOrigin.origin).toBe(deployment.apiOrigin)

      expect(deployment.browserHostnames.length).toBeGreaterThan(0)
      for (const hostname of deployment.browserHostnames) {
        // Ambiguous ownership would make the lookup order-dependent.
        expect(seen.has(hostname)).toBe(false)
        seen.add(hostname)
      }
    }
  })

  it("resolves every declared browser hostname to the declared API origin", () => {
    for (const deployment of Object.values(SPLIT_ORIGIN_DEPLOYMENTS)) {
      for (const hostname of deployment.browserHostnames) {
        expect(resolveDeploymentApiOrigin(`https://${hostname}`)).toBe(
          deployment.apiOrigin,
        )
      }
    }
  })

  // Role-awareness is data, not a separate mechanism: the account API and the
  // inference gateway resolve to the same origin until a deployment declares
  // them apart. No observed deployment does.
  it("separates the account and inference origins when a deployment declares them", () => {
    const fixture = [
      {
        browserHostnames: ["split.example.invalid"],
        apiOrigin: "https://account.example.invalid",
        inferenceApiOrigin: "https://gateway.example.invalid",
      },
      {
        browserHostnames: ["single.example.invalid"],
        apiOrigin: "https://single.example.invalid",
      },
    ] as const

    const account = createDeploymentOriginLookup(
      fixture,
      DEPLOYMENT_API_ROLES.Account,
    )
    const inference = createDeploymentOriginLookup(
      fixture,
      DEPLOYMENT_API_ROLES.Inference,
    )

    expect(account["split.example.invalid"]).toBe(
      "https://account.example.invalid",
    )
    expect(inference["split.example.invalid"]).toBe(
      "https://gateway.example.invalid",
    )
    // A deployment that does not split them serves both roles on one origin.
    expect(account["single.example.invalid"]).toBe(
      "https://single.example.invalid",
    )
    expect(inference["single.example.invalid"]).toBe(
      "https://single.example.invalid",
    )
  })

  it("keeps the API origin out of the browser hostname list", () => {
    const apiHostname = new URL(AI_ROUTER_API_ORIGIN).hostname
    expect(AI_ROUTER_HOSTNAMES).not.toContain(apiHostname)
    expect(resolveDeploymentApiOrigin(AI_ROUTER_API_ORIGIN)).toBe(
      AI_ROUTER_API_ORIGIN,
    )
  })

  it("resolves the account role by default", () => {
    for (const hostname of AI_ROUTER_HOSTNAMES) {
      expect(resolveDeploymentApiOrigin(`https://${hostname}`)).toBe(
        resolveDeploymentApiOrigin(
          `https://${hostname}`,
          DEPLOYMENT_API_ROLES.Account,
        ),
      )
    }
  })
})
