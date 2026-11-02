import { runLiveSuites } from "../../cdp/live-suites.mjs"

/** Keep model-sync coverage visible when the backend cannot reach a test upstream. */
export function runMagpieScenarios({ suite, hasUpstream, run, environment }) {
  return runLiveSuites({
    suite: suite === "ui" ? "all" : suite,
    environment,
    suites: ["management", "imports", "model-sync", "key-pool"].map((id) => ({
      id,
      covers: [`magpie.${id}`],
      prerequisite: () =>
        id === "model-sync" && !hasUpstream
          ? "Configure AAH_E2E_UPSTREAM_BASE_URL and AAH_E2E_UPSTREAM_API_KEY reachable by the remote backend"
          : undefined,
      run: () => run(id),
    })),
  })
}
