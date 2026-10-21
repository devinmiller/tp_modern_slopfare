import * as THREE from 'three'
import { Character, type CharacterPose, type CharacterTemplate } from '../character/Character'
import {
  CAMERA_FAR_M,
  CAMERA_NEAR_M,
  PHYSICS_STEP_SEC,
  VERTICAL_FOV_DEG,
} from '../config'
import { FpsMeter } from '../hud/FpsMeter'
import { Input } from '../input/Input'
import type { MapPhysics } from '../physics/MapPhysics'
import { PlayerController, type PlayerPose } from '../player/PlayerController'
import { createRenderer } from '../render/createRenderer'
import type { LoadedMap } from '../world/loadMap'
import type { MapMarker, MapSolid } from '../world/types'
import { disposeGlock } from '../weapon/Glock'
import { FrameClock } from './FrameClock'

const GLOCK_RESPAWN_SEC = 5

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly disposeWorld: () => void
  private readonly camera: THREE.PerspectiveCamera
  private readonly input: Input
  private readonly player: PlayerController
  private readonly clock = new FrameClock()
  private simAccumulator = 0
  private readonly fpsMeter = new FpsMeter()
  private readonly body: Character
  private readonly exhibit: Character | null
  private readonly exhibitPose: CharacterPose | null
  private readonly characterTemplate: CharacterTemplate
  private readonly glockTemplate: THREE.Group
  private worldGlock: THREE.Object3D | null = null
  private glow: THREE.Mesh | null = null
  private holding = false
  private respawnIn: number | null = null
  private readonly glockAt = new THREE.Vector3()
  private crate: { x: number; z: number; top: number } | null = null
  private readonly resizeObserver: ResizeObserver
  private shownFps: number | null = null
  private running = false
  private disposed = false

  private readonly onFrame = (nowMs: number) => {
    const dt = this.clock.tick(nowMs)
    this.player.applyLook(this.input)
    if (this.input.consumeCrouch()) this.player.toggleCrouch()
    if (this.input.consumeJump()) this.player.queueJump()
    this.simAccumulator += dt
    let steps = 0
    while (this.simAccumulator >= PHYSICS_STEP_SEC && steps < 4) {
      this.simAccumulator -= PHYSICS_STEP_SEC
      this.player.simulate(PHYSICS_STEP_SEC, this.input)
      this.physics.commit()
      steps += 1
    }
    if (steps === 4) this.simAccumulator = 0
    this.player.syncView(dt)
    const pose = this.player.pose()
    const speed = this.player.horizontalSpeed()
    this.tryPickup(pose)
    this.tickGlock(dt, nowMs)
    this.body.update(dt, pose, speed, this.camera)
    if (this.exhibit && this.exhibitPose) {
      this.exhibit.update(dt, {
        x: this.exhibitPose.x,
        y: this.exhibitPose.y,
        z: this.exhibitPose.z,
        yaw: this.exhibitPose.yaw,
        crouched: pose.crouched,
        grounded: pose.grounded,
      }, speed)
    }
    this.renderer.render(this.scene, this.camera)
    const fps = this.fpsMeter.sample(nowMs)
    if (fps === null || fps === this.shownFps) return
    this.shownFps = fps
    this.fpsReadout.textContent = `${fps} FPS`
  }

  constructor(
    private readonly host: HTMLElement,
    private readonly fpsReadout: HTMLElement,
    private readonly world: LoadedMap,
    private readonly physics: MapPhysics,
    characterTemplate: CharacterTemplate,
    glockTemplate: THREE.Group,
  ) {
    this.characterTemplate = characterTemplate
    this.glockTemplate = glockTemplate
    this.renderer = createRenderer(host)
    this.scene = world.scene
    this.disposeWorld = world.dispose
    this.camera = new THREE.PerspectiveCamera(
      VERTICAL_FOV_DEG,
      1,
      CAMERA_NEAR_M,
      CAMERA_FAR_M,
    )
    this.input = new Input(this.renderer.domElement)
    this.player = new PlayerController(this.camera, physics)
    const spawn = world.markers.find(
      (marker) => marker.kind === 'spawn' && marker.id === 'spawn-force',
    )
    if (spawn?.kind === 'spawn') this.player.place(spawn.at, spawn.yaw)
    this.body = new Character(characterTemplate, true)
    this.scene.add(this.body.object)
    const other = world.markers.find(
      (marker) => marker.kind === 'spawn' && marker.id === 'spawn-counterforce',
    )
    if (other?.kind === 'spawn') {
      this.exhibit = new Character(characterTemplate, false)
      this.exhibitPose = {
        x: other.at[0],
        y: other.at[1],
        z: other.at[2],
        yaw: other.yaw,
        crouched: false,
        grounded: true,
      }
      this.scene.add(this.exhibit.object)
    } else {
      this.exhibit = null
      this.exhibitPose = null
    }
    this.placeGlock(world)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.resize()
  }

  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.resize()
    this.renderer.setAnimationLoop(this.onFrame)
  }

  capturePose(): PlayerPose {
    return this.player.pose()
  }

  mapSolids(): readonly MapSolid[] {
    return this.world.solids
  }

  mapMarkers(): readonly MapMarker[] {
    return this.world.markers
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.running = false
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.body.dispose()
    this.exhibit?.dispose()
    this.characterTemplate.dispose()
    if (this.glow) {
      this.glow.geometry.dispose()
      const material = this.glow.material
      if (!Array.isArray(material)) material.dispose()
      this.glow = null
    }
    disposeGlock(this.glockTemplate)
    this.physics.dispose()
    this.disposeWorld()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.fpsReadout.textContent = '— FPS'
    this.shownFps = null
  }

  /** The cache crate in the middle of the yard. The pistol rests on its top. */
  private placeGlock(world: LoadedMap): void {
    const crate = world.solids.find(
      (solid) => solid.material === 'wood' && solid.at[0] === 0 && solid.at[2] === -4,
    )
    if (!crate) return
    this.crate = {
      x: crate.at[0],
      z: crate.at[2],
      top: crate.at[1] + crate.size[1] / 2,
    }
    this.spawnWorldGlock()
  }

  private spawnWorldGlock(): void {
    if (this.worldGlock || !this.crate) return
    const gun = this.glockTemplate.clone(true)
    // Upright, broadside toward the south spawn. Model +X is the grip bottom
    // and model −Z is the muzzle, so this shows the side instead of the 2 cm edge.
    gun.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
      ),
    )
    gun.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(gun)
    gun.position.y -= box.min.y
    gun.position.x -= (box.min.x + box.max.x) / 2
    gun.position.z -= (box.min.z + box.max.z) / 2

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.78, 48),
      new THREE.MeshBasicMaterial({
        color: 0xc8ffe8,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    ring.renderOrder = 2
    this.glow = ring

    const pickup = new THREE.Group()
    pickup.add(gun)
    pickup.add(ring)
    pickup.position.set(this.crate.x, this.crate.top + 0.01, this.crate.z)
    this.glockAt.set(this.crate.x, this.crate.top, this.crate.z)
    this.worldGlock = pickup
    this.scene.add(pickup)
  }

  private tryPickup(pose: PlayerPose): void {
    if (this.holding || !this.worldGlock) return
    const reach = Math.hypot(pose.x - this.glockAt.x, pose.z - this.glockAt.z)
    if (reach > 1.2) return
    if (!this.body.attachRightHand(this.glockTemplate.clone(true))) return
    this.exhibit?.attachRightHand(this.glockTemplate.clone(true))
    this.scene.remove(this.worldGlock)
    this.worldGlock = null
    if (this.glow) {
      this.glow.geometry.dispose()
      const material = this.glow.material
      if (!Array.isArray(material)) material.dispose()
      this.glow = null
    }
    this.holding = true
    this.respawnIn = GLOCK_RESPAWN_SEC
  }

  private tickGlock(dt: number, nowMs: number): void {
    if (this.glow) {
      const material = this.glow.material
      if (!Array.isArray(material)) {
        material.opacity = 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(nowMs / 280))
      }
    }
    if (this.respawnIn === null) return
    this.respawnIn -= dt
    if (this.respawnIn > 0) return
    this.respawnIn = null
    this.spawnWorldGlock()
  }

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1)
    const height = Math.max(this.host.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
  }
}
