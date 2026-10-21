import * as THREE from 'three'

const VERTICES_PER_FACE = 4

/**
 * Unsegmented box with UVs in repeats of `tileMeters`.
 * Face order matches Three.js `BoxGeometry`: +X, -X, +Y, -Y, +Z, -Z.
 */
export function meterBox(
  width: number,
  height: number,
  depth: number,
  tileMeters: number,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const uv = geometry.getAttribute('uv')
  if (uv.count !== VERTICES_PER_FACE * 6) {
    throw new Error(`meterBox expects an unsegmented box, got ${uv.count} uv vertices`)
  }

  const faces: ReadonlyArray<readonly [number, number]> = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ]

  let vertex = 0
  for (const [faceWidth, faceHeight] of faces) {
    const uScale = faceWidth / tileMeters
    const vScale = faceHeight / tileMeters
    for (let i = 0; i < VERTICES_PER_FACE; i += 1) {
      uv.setXY(vertex, uv.getX(vertex) * uScale, uv.getY(vertex) * vScale)
      vertex += 1
    }
  }

  geometry.computeTangents()
  return geometry
}
