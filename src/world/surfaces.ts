import * as THREE from 'three'
import type { MaterialId } from './types'

type SurfaceMaps = {
  color: string
  roughness: string
  normal: string
}

type SurfaceSpec = {
  /** Real-world width of one texture tile, in meters. */
  tileMeters: number
  /** Used when the texture files cannot be loaded. */
  fallbackColor: number
  maps: SurfaceMaps
}

/**
 * CC0 scans from ambientCG. Physical sizes are the published scan size,
 * except plaster: ambientCG did not publish one, so the wall tile is 2 m.
 * Color maps are sRGB. Roughness and OpenGL normals stay linear.
 */
const SURFACES: Record<MaterialId, SurfaceSpec> = {
  ground: {
    tileMeters: 2.1,
    fallbackColor: 0x6d734f,
    maps: {
      color: '/textures/ground/color.jpg',
      roughness: '/textures/ground/roughness.jpg',
      normal: '/textures/ground/normal.jpg',
    },
  },
  plaster: {
    tileMeters: 2,
    fallbackColor: 0xc2b6a2,
    maps: {
      color: '/textures/plaster/color.jpg',
      roughness: '/textures/plaster/roughness.jpg',
      normal: '/textures/plaster/normal.jpg',
    },
  },
  wood: {
    tileMeters: 0.8,
    fallbackColor: 0x8a623c,
    maps: {
      color: '/textures/wood/color.jpg',
      roughness: '/textures/wood/roughness.jpg',
      normal: '/textures/wood/normal.jpg',
    },
  },
}

export type Surface = {
  material: THREE.MeshStandardMaterial
  tileMeters: number
}

export type SurfaceSet = {
  byId: Record<MaterialId, Surface>
  dispose: () => void
}

const loader = new THREE.TextureLoader()

async function loadMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
): Promise<THREE.Texture> {
  const texture = await loader.loadAsync(url)
  texture.colorSpace = colorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

async function loadSurface(spec: SurfaceSpec): Promise<{
  surface: Surface
  textures: THREE.Texture[]
}> {
  try {
    const [color, roughness, normal] = await Promise.all([
      loadMapTexture(spec.maps.color, THREE.SRGBColorSpace),
      loadMapTexture(spec.maps.roughness, THREE.NoColorSpace),
      loadMapTexture(spec.maps.normal, THREE.NoColorSpace),
    ])
    const material = new THREE.MeshStandardMaterial({
      map: color,
      roughnessMap: roughness,
      normalMap: normal,
      roughness: 1,
      metalness: 0,
    })
    return {
      surface: { material, tileMeters: spec.tileMeters },
      textures: [color, roughness, normal],
    }
  } catch {
    return {
      surface: {
        material: new THREE.MeshStandardMaterial({
          color: spec.fallbackColor,
          roughness: 0.92,
          metalness: 0,
        }),
        tileMeters: spec.tileMeters,
      },
      textures: [],
    }
  }
}

export async function loadSurfaces(): Promise<SurfaceSet> {
  const textures: THREE.Texture[] = []
  const materials: THREE.Material[] = []
  const entries = await Promise.all(
    (Object.keys(SURFACES) as MaterialId[]).map(async (id) => {
      const loaded = await loadSurface(SURFACES[id])
      textures.push(...loaded.textures)
      materials.push(loaded.surface.material)
      return [id, loaded.surface] as const
    }),
  )

  return {
    byId: Object.fromEntries(entries) as Record<MaterialId, Surface>,
    dispose() {
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
    },
  }
}
