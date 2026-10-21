import * as THREE from 'three'

export function createRenderer(host: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.localClippingEnabled = true
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.tabIndex = 0
  host.append(renderer.domElement)
  return renderer
}
