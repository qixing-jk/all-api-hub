import { describe, expect, it } from "vitest"

import type { ZifeiyuGameState } from "~/services/apiService/newApiFamily/zifeiyuGame"
import {
  chooseZifeiyuGameInput,
  planZifeiyuGameInputs,
} from "~/services/checkin/autoCheckin/providers/zifeiyuGamePlanner"

const state = (changes: Partial<ZifeiyuGameState> = {}): ZifeiyuGameState => ({
  version: 4,
  tick: 10,
  clock_tick: 10,
  pause_ticks: 0,
  rng: 42,
  x: 5_000,
  y: 3_500,
  hp: 100,
  max_hp: 100,
  score: 0,
  kills: 0,
  collected: 0,
  picked_tokens: 0,
  power: 3,
  speed: 140,
  upgrades: 0,
  haste: 0,
  extra_targets: 0,
  attack_charge: 0,
  dash_until: 0,
  dash_ready: 0,
  hurt_until: 0,
  beam_x: 0,
  beam_y: 0,
  beam_until: 0,
  next_id: 0,
  enemies: [],
  tokens: [],
  ...changes,
})

describe("ZIFEIYU daily-game movement planner", () => {
  it("moves toward a token reported in the current server state", () => {
    expect(
      chooseZifeiyuGameInput(
        state({ tokens: [{ x: 6_000, y: 4_000, value: 10 }] }),
      ),
    ).toBe(4)
  })

  it("evades a nearby enemy and dashes only when the server cooldown allows it", () => {
    const threatened = state({
      enemies: [{ id: 1, x: 5_500, y: 3_500, hp: 4, kind: 0 }],
    })
    expect(chooseZifeiyuGameInput(threatened)).toBe(23)
    expect(
      chooseZifeiyuGameInput(
        state({ ...threatened, tick: 10, dash_ready: 100 }),
      ),
    ).toBe(7)
  })

  it("chooses a valid upgrade when an upgrade pause arrives mid-batch", () => {
    const planned = planZifeiyuGameInputs(
      state({
        tick: 199,
        clock_tick: 199,
        tokens: [{ x: 6_000, y: 3_500, value: 10 }],
      }),
      4,
    )

    expect(planned).toHaveLength(4)
    expect(planned[0]).toBe(3)
    expect(planned[1]).toBe(96)
    expect(planned.slice(2).every((value) => value >= 0 && value <= 127)).toBe(
      true,
    )
  })

  it("caps each normal sync chunk and rejects invalid frame counts", () => {
    expect(planZifeiyuGameInputs(state(), 300)).toHaveLength(20)
    expect(() => planZifeiyuGameInputs(state(), 0)).toThrow(
      "Invalid ZIFEIYU game input count",
    )
    expect(() => planZifeiyuGameInputs(state(), 301)).toThrow(
      "Invalid ZIFEIYU game input count",
    )
  })
})
