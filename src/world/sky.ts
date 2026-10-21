import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

// Poly Haven, CC0. "Kloofendal 48d Partly Cloudy (Pure Sky)" by Greg Zaal,
// sky edits by Jarod Guest. 2K Radiance HDR, served from public/textures/sky.
const SKY_URL = '/textures/sky/day.hdr'

// Unit direction toward the sun disk in that HDR. Measured from the brightest
// pixels, about 48° up, toward +X and +Z. From spawn-force (looking down -Z)
// that puts the sun behind and to the right, so the faces ahead are lit.
const SUN_DIRECTION = new THREE.Vector3(0.5542, 0.7419, 0.3774).normalize()

const YARD_CENTER = new THREE.Vector3(0, 2, -1)

export async function loadDaylight(scene: THREE.Scene): Promise<() => void> {
  const sky = await new HDRLoader().loadAsync(SKY_URL)
  sky.mapping = THREE.EquirectangularReflectionMapping
  scene.background = sky
  scene.environment = sky
  // The HDR already contains the sun, so a full-strength environment fills
  // in the direct-light shadow. Keep the fill low and let the sun carry the key.
  scene.environmentIntensity = 0.22

  const sun = new THREE.DirectionalLight(0xfff5e6, 3)
  sun.target.position.copy(YARD_CENTER)
  sun.position.copy(YARD_CENTER).addScaledVector(SUN_DIRECTION, 28)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0003
  sun.shadow.normalBias = 0.035

  const shadowCamera = sun.shadow.camera
  shadowCamera.near = 0.5
  shadowCamera.far = 80
  shadowCamera.left = -32
  shadowCamera.right = 32
  shadowCamera.top = 32
  shadowCamera.bottom = -32
  shadowCamera.updateProjectionMatrix()

  scene.add(sun)
  scene.add(sun.target)

  return () => {
    sky.dispose()
    sun.shadow.dispose()
    scene.remove(sun)
    scene.remove(sun.target)
  }
}
