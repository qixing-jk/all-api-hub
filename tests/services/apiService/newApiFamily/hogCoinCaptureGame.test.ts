import { describe, expect, it } from "vitest"

import {
  buildHogCoinCaptureMovements,
  HOG_COIN_CAPTURE_RULES,
  parseHogCoinCaptureEnabled,
  parseHogCoinCaptureView,
  type HogCoinCaptureGameState,
} from "~/services/apiService/newApiFamily/variants/hogCoinCaptureGame"

const game: HogCoinCaptureGameState = {
  player: { x: 450, y: 270, tx: 450, ty: 270, r: 12 },
  coins: [
    { x: 80, y: 75, value: 1, r: 9, alive: true },
    { x: 185, y: 75, value: 3, r: 12, alive: true },
    { x: 815, y: 435, value: 1, r: 9, alive: true },
  ],
}

describe("Hog Coin Capture public protocol", () => {
  it("parses only the current server round and the fields needed for replay", () => {
    const view = parseHogCoinCaptureView({
      round: {
        round_id: "round-1",
        game_day: "2026-11-27",
        status: 1,
        score: 0,
        reward_cents: 0,
        quota: 0,
        started_at: 100,
        settled_at: 0,
        sequence: 0,
      },
      game,
      server_time: 200,
      reward_amount: "0.00",
    })

    expect(view?.round?.round_id).toBe("round-1")
    expect(view?.game?.coins).toHaveLength(3)
    expect(parseHogCoinCaptureView({ round: null, server_time: 200 })).toEqual({
      round: null,
      server_time: 200,
    })
  })

  it.each([
    { round: null, server_time: Number.NaN },
    { round: { round_id: "round-1", status: 3 }, server_time: 200 },
    {
      round: null,
      game: {
        player: { x: 1, y: 2, tx: 900, ty: 2, r: 12 },
        coins: [],
      },
      server_time: 200,
    },
  ])("rejects malformed status payloads: %o", (payload) => {
    expect(parseHogCoinCaptureView(payload)).toBeUndefined()
  })

  it("honors the server feature gate and the server's enabled default", () => {
    expect(
      parseHogCoinCaptureEnabled({
        SidebarModulesAdmin: {
          personal: { enabled: true, welfareAirdrop: true },
        },
      }),
    ).toBe(true)
    expect(
      parseHogCoinCaptureEnabled({
        SidebarModulesAdmin: { personal: { enabled: false } },
      }),
    ).toBe(false)
    expect(parseHogCoinCaptureEnabled({ SidebarModulesAdmin: "" })).toBe(true)
    expect(parseHogCoinCaptureEnabled({})).toBeUndefined()
  })

  it("creates a deterministic, bounded chronological route through known coins", () => {
    const first = buildHogCoinCaptureMovements(game)
    expect(first).toEqual(buildHogCoinCaptureMovements(game))
    expect(first).toHaveLength(3)
    expect(first[0]?.elapsed_ms).toBe(0)
    for (const [index, movement] of first.entries()) {
      expect(movement.elapsed_ms % HOG_COIN_CAPTURE_RULES.stepMs).toBe(0)
      expect(movement.elapsed_ms).toBeLessThan(
        HOG_COIN_CAPTURE_RULES.durationMs,
      )
      expect(movement.x).toBeGreaterThanOrEqual(27)
      expect(movement.x).toBeLessThanOrEqual(873)
      expect(movement.y).toBeGreaterThanOrEqual(27)
      expect(movement.y).toBeLessThanOrEqual(513)
      if (index > 0)
        expect(movement.elapsed_ms).toBeGreaterThan(
          first[index - 1]?.elapsed_ms ?? -1,
        )
    }
    expect(first.length).toBeLessThanOrEqual(
      HOG_COIN_CAPTURE_RULES.maxMovements,
    )
    expect(buildHogCoinCaptureMovements({ ...game, coins: [] })).toEqual([])
  })
})
