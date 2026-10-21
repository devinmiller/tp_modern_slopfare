import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = '/models/weapons/glock.glb'
/** A Glock 17 is about 20 cm long. The file is a different size. */
const LENGTH_M = 0.2

/**
 * CC0 low-poly Glock from Poly Pizza (CreativeTrio). The long axis is Z and the
 * muzzle is −Z. The grip hangs toward +X. The thin axis is Y.
 */
export async function loadGlock(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
  const fitted = new THREE.Group()
  fitted.add(gltf.scene)
  gltf.scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  gltf.scene.scale.multiplyScalar(LENGTH_M / longest)
  gltf.scene.updateMatrixWorld(true)
  const fittedBox = new THREE.Box3().setFromObject(gltf.scene)
  const center = fittedBox.getCenter(new THREE.Vector3())
  gltf.scene.position.set(-center.x, -fittedBox.min.y, -center.z)
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  return fitted
}

export function disposeGlock(template: THREE.Group): void {
  template.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material.dispose()
  })
}
