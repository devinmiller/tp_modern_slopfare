/** Meters. `[x, y, z]`. */
export type Vec3 = readonly [number, number, number]

/** Surface ids that can be assigned to a solid. */
export type MaterialId = 'ground' | 'plaster' | 'wood'

/**
 * An axis-aligned box. `at` is the center, `size` is the full extent.
 * These records are the collision source. The meshes are only a view of them.
 */
export type MapSolid = {
  size: Vec3
  at: Vec3
  material: MaterialId
}

export type SpawnSide = 'force' | 'counterforce'

/** Yaw 0 looks down -Z. Positive yaw turns left. */
export type SpawnMarker = {
  id: string
  kind: 'spawn'
  side: SpawnSide
  at: Vec3
  yaw: number
}

/** `size` is the ground footprint, x then z, in meters. `at` is the center. */
export type ObjectiveMarker = {
  id: string
  kind: 'objective'
  at: Vec3
  size: readonly [number, number]
}

export type MapMarker = SpawnMarker | ObjectiveMarker

export type GameMap = {
  id: string
  name: string
  solids: readonly MapSolid[]
  markers: readonly MapMarker[]
}
