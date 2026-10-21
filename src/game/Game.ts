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
import { FrameClock } from './FrameClock'

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
    this.body.update(dt, pose, speed, this.camera)
    if (this.exhibit && this.exhibitPose) {
      this.exhibit.update(dt, {
        x: this.exhibitPose.x,
        y: this.exhibitPose.y + pose.y,
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
  ) {
    this.characterTemplate = characterTemplate
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
    this.physics.dispose()
    this.disposeWorld()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.fpsReadout.textContent = '— FPS'
    this.shownFps = null
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
