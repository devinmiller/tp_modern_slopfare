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

const UNIT_Y = new THREE.Vector3(0, 1, 0)
const LOCOMOTION = new Set<ClipName>(['idle', 'walk', 'sprint', 'crouchIdle', 'crouchMove'])
/**
 * Middle of the grip on the fitted pistol. Model +X is the bottom of the grip
 * and model −Z is the muzzle.
 */
const GRIP_LOCAL = new THREE.Vector3(0.048, 0.011, 0.056)

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
  private heldGun: THREE.Object3D | null = null
  private readonly restForearm = new THREE.Quaternion()
  private readonly restHand = new THREE.Quaternion()
  private readonly fingerRest = new Map<string, THREE.Quaternion>()
  private readonly fingerCurl = new THREE.Quaternion()
  private readonly curlAxis = new THREE.Vector3(1, 0, 0)
  private readonly handWorld = new THREE.Vector3()
  private readonly aimForward = new THREE.Vector3()
  private readonly aimLocal = new THREE.Vector3()
  private readonly gripDown = new THREE.Vector3()
  private readonly barrelBack = new THREE.Vector3()
  private readonly gunRight = new THREE.Vector3()
  private readonly gripPoint = new THREE.Vector3()
  private readonly parentQuat = new THREE.Quaternion()
  private readonly armAim = new THREE.Quaternion()
  private readonly gunBasis = new THREE.Matrix4()

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
    const forearm = model.getObjectByName('DEF-forearmR')
    const hand = model.getObjectByName('DEF-handR')
    if (forearm) this.restForearm.copy(forearm.quaternion)
    if (hand) this.restHand.copy(hand.quaternion)
    model.traverse((object) => {
      const rightFinger = object.name.startsWith('DEF-f_') || object.name.startsWith('DEF-thumb')
      if (!rightFinger || !object.name.endsWith('R')) return
      this.fingerRest.set(object.name, object.quaternion.clone())
    })
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
    if (this.heldGun) {
      if (camera) camera.getWorldDirection(this.aimForward)
      else this.aimForward.set(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw))
      this.aimRightArm(this.aimForward)
      this.placeHeldGun(this.aimForward)
    }
    if (this.clipPlane && camera) {
      camera.getWorldDirection(this.viewForward)
      this.viewPoint.copy(camera.position).addScaledVector(this.viewForward, 0.55)
      this.clipPlane.setFromNormalAndCoplanarPoint(this.viewForward, this.viewPoint)
    }
  }

  /**
   * Keep `gun` on this character. Each frame seats the grip in the right hand
   * and points the muzzle along the aim direction.
   */
  attachRightHand(gun: THREE.Object3D): boolean {
    // GLTFLoader strips dots, so DEF-hand.R is DEF-handR.
    if (!this.object.getObjectByName('DEF-handR')) return false
    this.heldGun = gun
    this.object.add(gun)
    return true
  }

  /** Point the right arm along `forwardWorld`, with the forearm and hand in their rest pose. */
  private aimRightArm(forwardWorld: THREE.Vector3): void {
    const upper = this.object.getObjectByName('DEF-upper_armR')
    const forearm = this.object.getObjectByName('DEF-forearmR')
    const hand = this.object.getObjectByName('DEF-handR')
    if (!upper?.parent) return
    upper.parent.updateWorldMatrix(true, false)
    upper.parent.getWorldQuaternion(this.parentQuat)
    this.aimLocal.copy(forwardWorld).applyQuaternion(this.parentQuat.invert())
    if (this.aimLocal.lengthSq() < 1e-8) return
    this.aimLocal.normalize()
    this.armAim.setFromUnitVectors(UNIT_Y, this.aimLocal)
    upper.quaternion.copy(this.armAim)
    if (forearm) forearm.quaternion.copy(this.restForearm)
    if (hand) hand.quaternion.copy(this.restHand)
    this.curlFingers()
  }

  /** Bend the right fingers down around a vertical grip. */
  private curlFingers(): void {
    for (const [name, rest] of this.fingerRest) {
      const bone = this.object.getObjectByName(name)
      if (!bone) continue
      const knuckle = name.endsWith('01R') ? -0.7 : name.endsWith('02R') ? -0.95 : -0.55
      this.fingerCurl.setFromAxisAngle(this.curlAxis, knuckle)
      bone.quaternion.copy(rest).multiply(this.fingerCurl)
    }
  }

  private placeHeldGun(forwardWorld: THREE.Vector3): void {
    const gun = this.heldGun
    const hand = this.object.getObjectByName('DEF-handR')
    if (!gun || !hand) return
    this.object.updateWorldMatrix(true, true)
    hand.getWorldPosition(this.handWorld)
    this.object.worldToLocal(this.handWorld)
    this.object.getWorldQuaternion(this.parentQuat)
    this.aimLocal.copy(forwardWorld).applyQuaternion(this.parentQuat.invert())
    if (this.aimLocal.lengthSq() < 1e-8) return
    this.aimLocal.normalize()

    // +X on the pistol is the bottom of the grip. Tip it toward world down, which
    // is local down because the character only yaws.
    this.gripDown.set(0, -1, 0)
    this.gripDown.addScaledVector(this.aimLocal, -this.gripDown.dot(this.aimLocal))
    if (this.gripDown.lengthSq() < 1e-6) this.gripDown.set(1, 0, 0)
    this.gripDown.normalize()
    this.barrelBack.copy(this.aimLocal).negate()
    this.gunRight.crossVectors(this.barrelBack, this.gripDown).normalize()
    this.gunBasis.makeBasis(this.gripDown, this.gunRight, this.barrelBack)
    gun.quaternion.setFromRotationMatrix(this.gunBasis)

    this.gripPoint.copy(GRIP_LOCAL).applyQuaternion(gun.quaternion)
    // The finger bones start about 11 cm ahead of the wrist. Seat the grip there.
    this.handWorld.addScaledVector(this.aimLocal, 0.1)
    gun.position.copy(this.handWorld).sub(this.gripPoint)
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
