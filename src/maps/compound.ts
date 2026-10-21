import type { GameMap } from '../world/types'

/**
 * Walled yard used as the first blockout.
 * Distances are meters. A solid's `at` is its center. The ground top is y = 0.
 * Yaw 0 looks down -Z. Positive yaw turns left.
 * Add cover by appending a solid. Spawns and the objective are markers.
 */
export const compound: GameMap = {
  id: 'compound',
  name: 'Compound',
  solids: [
    { size: [40, 0.2, 40], at: [0, -0.1, -1], material: 'ground' },

    // Ring wall, 3.2 m tall, with a gate in the south side.
    { size: [12, 3.2, 0.4], at: [-8, 1.6, 14], material: 'plaster' },
    { size: [12, 3.2, 0.4], at: [8, 1.6, 14], material: 'plaster' },
    { size: [28.4, 3.2, 0.4], at: [0, 1.6, -16], material: 'plaster' },
    { size: [0.4, 3.2, 30.4], at: [-14.2, 1.6, -1], material: 'plaster' },
    { size: [0.4, 3.2, 30.4], at: [14.2, 1.6, -1], material: 'plaster' },

    // West block. The gap to the west wall is the alley.
    { size: [6, 3.2, 7], at: [-8, 1.6, -6], material: 'plaster' },

    // Crouch-height line across the yard, with a gap in the middle.
    { size: [8, 1.2, 0.4], at: [-6, 0.6, 2], material: 'plaster' },
    { size: [8, 1.2, 0.4], at: [6, 0.6, 2], material: 'plaster' },

    // Stand-height cover on the east lane.
    { size: [0.5, 2, 2.4], at: [11, 1, 7], material: 'plaster' },

    // Crates. The third sits on the first.
    { size: [1.1, 1.1, 1.1], at: [9.2, 0.55, 5.2], material: 'wood' },
    { size: [1.1, 1.1, 1.1], at: [10.3, 0.55, 6.2], material: 'wood' },
    { size: [1.1, 0.7, 1.1], at: [9.2, 1.45, 5.2], material: 'wood' },

    // Cover in front of the north spawn.
    { size: [3, 2, 0.5], at: [-3, 1, -12], material: 'plaster' },
    { size: [2.4, 1.2, 0.5], at: [3.2, 0.6, -11], material: 'plaster' },

    // Cache the objective marker refers to.
    { size: [1.5, 1, 1.1], at: [0, 0.5, -4], material: 'wood' },
  ],
  markers: [
    {
      id: 'spawn-force',
      kind: 'spawn',
      side: 'force',
      at: [0, 0, 10],
      yaw: 0,
    },
    {
      id: 'spawn-counterforce',
      kind: 'spawn',
      side: 'counterforce',
      at: [0, 0, -14],
      yaw: Math.PI,
    },
    {
      id: 'objective-cache',
      kind: 'objective',
      at: [0, 0, -4],
      size: [4, 4],
    },
  ],
}
