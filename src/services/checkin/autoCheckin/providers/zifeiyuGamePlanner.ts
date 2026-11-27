import type { ZifeiyuGameState } from "~/services/apiService/newApiFamily/zifeiyuGame"

export const ZIFEIYU_GAME_DURATION_TICKS = 900
export const ZIFEIYU_GAME_CLOCK_LIMIT_TICKS = 930
export const ZIFEIYU_GAME_MAX_INPUT_BATCH = 300
const ZIFEIYU_GAME_INPUT_CHUNK_TICKS = 20

type Point = { x: number; y: number }

const distanceSquared = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** Maps a target vector to one of the game's nine valid movement inputs. */
function directionToward(dx: number, dy: number): number {
  const horizontal = dx > 0 ? 1 : dx < 0 ? -1 : 0
  const vertical = dy > 0 ? 1 : dy < 0 ? -1 : 0
  if (horizontal === 0 && vertical === 0) return 0
  if (horizontal === 0) return vertical < 0 ? 1 : 5
  if (vertical === 0) return horizontal > 0 ? 3 : 7
  if (horizontal > 0) return vertical < 0 ? 2 : 4
  return vertical > 0 ? 6 : 8
}

/** Selects ordinary directional movement from the server's latest game state. */
export function chooseZifeiyuGameInput(state: ZifeiyuGameState): number {
  const tick = state.tick
  const requiredUpgrades = Math.min(3, Math.floor(tick / 200))
  if (state.version >= 2 && state.upgrades < requiredUpgrades) {
    // Newer versions gain extra auto-attack targets; older versions gain power.
    const upgrade = state.version >= 3 ? 3 : 1
    return upgrade << 5
  }

  const player = { x: state.x, y: state.y }
  const nearestEnemy = state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => ({ enemy, distance: distanceSquared(player, enemy) }))
    .sort((left, right) => left.distance - right.distance)[0]
  const nearestToken = state.tokens
    .map((token) => ({ token, distance: distanceSquared(player, token) }))
    .sort((left, right) => left.distance - right.distance)[0]

  let direction: number
  const threat = nearestEnemy
  if (threat && threat.distance < 1_100 ** 2) {
    direction = directionToward(
      player.x - threat.enemy.x,
      player.y - threat.enemy.y,
    )
  } else if (nearestToken) {
    direction = directionToward(
      nearestToken.token.x - player.x,
      nearestToken.token.y - player.y,
    )
  } else if (threat && threat.distance > 2_000 ** 2) {
    // Move into the auto-attack radius while retaining room to evade later.
    direction = directionToward(
      threat.enemy.x - player.x,
      threat.enemy.y - player.y,
    )
  } else {
    // With no visible token, keep traversing toward the center of the arena.
    direction = directionToward(5_000 - player.x, 3_500 - player.y)
  }

  const dashReady = Number(state.dash_ready ?? 0)
  const dash =
    threat && threat.distance < 700 ** 2 && tick >= dashReady ? 16 : 0
  return direction | dash
}

/**
 * Plans at most one site's 2-second synchronization chunk. Inputs remain valid
 * dashboard controls; the server still simulates combat, pickups, and rewards.
 */
export function planZifeiyuGameInputs(
  state: ZifeiyuGameState,
  requestedTicks: number,
): number[] {
  if (
    !Number.isInteger(requestedTicks) ||
    requestedTicks <= 0 ||
    requestedTicks > ZIFEIYU_GAME_MAX_INPUT_BATCH
  ) {
    throw new Error("Invalid ZIFEIYU game input count")
  }

  const count = Math.min(requestedTicks, ZIFEIYU_GAME_INPUT_CHUNK_TICKS)
  const inputs: number[] = []
  let tick = state.tick
  let upgrades = state.upgrades
  for (let index = 0; index < count; index++) {
    const requiredUpgrades = Math.min(3, Math.floor(tick / 200))
    if (state.version >= 2 && upgrades < requiredUpgrades) {
      inputs.push(chooseZifeiyuGameInput({ ...state, tick, upgrades }))
      upgrades++
      continue
    }

    inputs.push(chooseZifeiyuGameInput({ ...state, tick, upgrades }))
    tick++
  }
  return inputs
}
