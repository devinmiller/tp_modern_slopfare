import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'

/** Feet, facing, and stance. Yaw 0 looks down -Z, same as the camera. */
export type CharacterPose = {
  x: number
  y: number
  z: number
  yaw: number
  crouched: boolean
  grounded: boolean
}

export type CharacterTemplate = {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  dispose: () => void
}

const MODEL_URL = '/models/human/AnimationLibrary_Godot_Standard.gltf'
const TARGET_HEIGHT_M = 1.72

const CLIPS = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  sprint: 'Sprint_Loop',
  crouchIdle: 'Crouch_Idle_Loop',
  crouchMove: 'Crouch_Fwd_Loop',
  jumpStart: 'Jump_Start',
  jumpLoop: 'Jump_Loop',
  jumpLand: 'Jump_Land',
} as const

type ClipName = keyof typeof CLIPS

const LOCOMOTION = new Set<ClipName>(['idle', 'walk', 'sprint', 'crouchIdle', 'crouchMove'])

/**
 * Quaternius Universal Animation Library mannequin. One skinned mesh and the
 * locomotion clips, including crouch and jump. Each clip plays through at the
 * file rate. Gait changes wait a moment so a one-frame speed blip cannot
 * restart the cycle.
 */
export async function loadCharacterTemplate(): Promise<CharacterTemplate> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL)
  return {
    scene: gltf.scene,
    animations: gltf.animations,
    dispose() {
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) material.dispose()
      })
    },
  }
}

/**
 * One person. `clipCamera` is the first-person body: fragments near the lens
 * are discarded so the view is not inside the head. The exhibit shows the whole mesh.
 */
export class Character {
  readonly object = new THREE.Group()
  private readonly mixer: THREE.AnimationMixer
  private readonly actions: Record<ClipName, THREE.AnimationAction>
  private readonly clipPlane: THREE.Plane | null
  private readonly viewForward = new THREE.Vector3()
  private readonly viewPoint = new THREE.Vector3()
  private mode: ClipName = 'idle'
  private current: THREE.AnimationAction
  private grounded = true
  private landFinished = false
  private pending: ClipName | null = null
  private pendingFor = 0

  constructor(template: CharacterTemplate, clipCamera: boolean) {
    const model = cloneSkeleton(template.scene)
    const turn = new THREE.Group()
    turn.rotation.y = Math.PI
    turn.add(model)
    fitToGround(turn)
    this.object.add(turn)

    this.mixer = new THREE.AnimationMixer(model)
    this.actions = {
      idle: this.makeAction(template, 'idle', true),
      walk: this.makeAction(template, 'walk', true),
      sprint: this.makeAction(template, 'sprint', true),
      crouchIdle: this.makeAction(template, 'crouchIdle', true),
      crouchMove: this.makeAction(template, 'crouchMove', true),
      jumpStart: this.makeAction(template, 'jumpStart', false),
      jumpLoop: this.makeAction(template, 'jumpLoop', true),
      jumpLand: this.makeAction(template, 'jumpLand', false),
    }
    this.current = this.actions.idle
    this.current.play()
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.current) return
      if (this.mode === 'jumpStart') this.switchTo(this.grounded ? 'jumpLand' : 'jumpLoop')
      if (this.mode === 'jumpLand') this.landFinished = true
    })

    this.clipPlane = clipCamera ? new THREE.Plane(new THREE.Vector3(0, 0, -1), 0) : null
    applyShadowsAndClip(model, this.clipPlane)
  }

  /**
   * `speed` is horizontal m/s. The exhibit stays on its spawn, so it cannot
   * measure that from its own feet.
   */
  update(dt: number, pose: CharacterPose, speed: number, camera?: THREE.Camera): void {
    this.grounded = pose.grounded
    const next = this.choose(pose, speed)
    this.holdOrSwitch(next, dt)
    this.mixer.update(dt)

    this.object.position.set(pose.x, pose.y, pose.z)
    this.object.rotation.y = pose.yaw
    if (this.clipPlane && camera) {
      camera.getWorldDirection(this.viewForward)
      this.viewPoint.copy(camera.position).addScaledVector(this.viewForward, 0.55)
      this.clipPlane.setFromNormalAndCoplanarPoint(this.viewForward, this.viewPoint)
    }
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.object.removeFromParent()
    this.object.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) material.dispose()
    })
  }

  private holdOrSwitch(next: ClipName, dt: number): void {
    if (next === this.mode) {
      this.pending = null
      this.pendingFor = 0
      return
    }
    const abrupt = !LOCOMOTION.has(next) || !LOCOMOTION.has(this.mode)
    if (abrupt) {
      this.pending = null
      this.pendingFor = 0
      this.switchTo(next)
      return
    }
    if (this.pending !== next) {
      this.pending = next
      this.pendingFor = 0
      return
    }
    this.pendingFor += dt
    if (this.pendingFor < 0.15) return
    this.pending = null
    this.pendingFor = 0
    this.switchTo(next)
  }

  private choose(pose: CharacterPose, speed: number): ClipName {
    if (!pose.grounded) {
      if (this.mode === 'jumpStart' || this.mode === 'jumpLoop') return this.mode
      return 'jumpStart'
    }
    if (this.mode === 'jumpLand' && !this.landFinished) return 'jumpLand'
    if (this.mode === 'jumpStart' || this.mode === 'jumpLoop') return 'jumpLand'
    if (pose.crouched) return speed > 0.35 ? 'crouchMove' : 'crouchIdle'
    if (speed >= 5.4) return 'sprint'
    if (speed >= 0.35) return 'walk'
    return 'idle'
  }

  private switchTo(name: ClipName): void {
    const action = this.actions[name]
    const once = name === 'jumpStart' || name === 'jumpLand'
    action.reset()
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
    action.clampWhenFinished = once
    action.enabled = true
    action.play()
    if (this.current !== action) action.crossFadeFrom(this.current, 0.12, false)
    this.current = action
    this.mode = name
    if (name === 'jumpLand') this.landFinished = false
  }

  private makeAction(
    template: CharacterTemplate,
    name: ClipName,
    loop: boolean,
  ): THREE.AnimationAction {
    const clip = template.animations.find((item) => item.name === CLIPS[name])
    if (!clip) throw new Error(`Character model is missing ${CLIPS[name]}`)
    const action = this.mixer.clipAction(clip)
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    action.enabled = false
    return action
  }
}

function fitToGround(model: THREE.Object3D): void {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const height = Math.max(box.max.y - box.min.y, 0.01)
  const scale = TARGET_HEIGHT_M / height
  model.scale.setScalar(scale)
  model.position.set(
    -((box.min.x + box.max.x) / 2) * scale,
    -box.min.y * scale,
    -((box.min.z + box.max.z) / 2) * scale,
  )
}

function applyShadowsAndClip(model: THREE.Object3D, clipPlane: THREE.Plane | null): void {
  model.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cloned = source.map((material) => {
      const next = material.clone()
      if (clipPlane) {
        next.clippingPlanes = [clipPlane]
        next.clipShadows = true
      }
      return next
    })
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
  })
}
