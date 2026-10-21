import * as THREE from 'three'
import { meterBox } from './meterBox'
import { loadDaylight } from './sky'
import { loadSurfaces } from './surfaces'
import type { GameMap, MapMarker, MapSolid, SpawnSide } from './types'

const SPAWN_PAD: Record<SpawnSide, number> = {
  force: 0x4d6a62,
  counterforce: 0x8a5340,
}

export type LoadedMap = {
  scene: THREE.Scene
  solids: readonly MapSolid[]
  markers: readonly MapMarker[]
  dispose: () => void
}

export async function loadMap(map: GameMap): Promise<LoadedMap> {
  const scene = new THREE.Scene()
  const [disposeDaylight, surfaces] = await Promise.all([
    loadDaylight(scene),
    loadSurfaces(),
  ])
  const geometries: THREE.BufferGeometry[] = []
  const extraMaterials: THREE.Material[] = []

  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: readonly [number, number, number],
    castShadow: boolean,
  ) => {
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(at[0], at[1], at[2])
    mesh.castShadow = castShadow
    mesh.receiveShadow = true
    scene.add(mesh)
  }

  for (const solid of map.solids) {
    const surface = surfaces.byId[solid.material]
    addMesh(
      meterBox(solid.size[0], solid.size[1], solid.size[2], surface.tileMeters),
      surface.material,
      solid.at,
      solid.material !== 'ground',
    )
  }

  const spawnMaterial = (side: SpawnSide) => {
    const material = new THREE.MeshStandardMaterial({
      color: SPAWN_PAD[side],
      roughness: 0.85,
      metalness: 0,
    })
    extraMaterials.push(material)
    return material
  }
  const forcePad = spawnMaterial('force')
  const counterPad = spawnMaterial('counterforce')

  const zoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xb08948,
    roughness: 0.9,
    metalness: 0,
  })
  extraMaterials.push(zoneMaterial)

  for (const marker of map.markers) {
    if (marker.kind === 'spawn') {
      addMesh(
        new THREE.BoxGeometry(1.2, 0.04, 1.2),
        marker.side === 'force' ? forcePad : counterPad,
        [marker.at[0], 0.02, marker.at[2]],
        false,
      )
      continue
    }
    addMesh(
      new THREE.BoxGeometry(marker.size[0], 0.04, marker.size[1]),
      zoneMaterial,
      [marker.at[0], 0.02, marker.at[2]],
      false,
    )
  }

  return {
    scene,
    solids: map.solids,
    markers: map.markers,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of extraMaterials) material.dispose()
      surfaces.dispose()
      disposeDaylight()
    },
  }
}
