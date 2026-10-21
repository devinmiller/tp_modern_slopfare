import * as THREE from 'three'
import {
  AIR_ACCEL_MPS2,
  COYOTE_SEC,
  CROUCH_EYE_HEIGHT_M,
  CROUCH_SPEED_MPS,
  EYE_HEIGHT_M,
  GRAVITY_MPS2,
  GROUND_ACCEL_MPS2,
  GROUND_BRAKE_MPS2,
  JUMP_BUFFER_SEC,
  JUMP_SPEED_MPS,
  LOOK_SENSITIVITY,
  PITCH_LIMIT_RAD,
  RUN_SPEED_MPS,
  WALK_SPEED_MPS,
} from '../config'
import type { Input } from '../input/Input'
import type { MapPhysics } from '../physics/MapPhysics'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const GROUNDED_STICK_MPS = 2

export type PlayerPose = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  eyeY: number
  grounded: boolean
  crouched: boolean
}

export class PlayerController {
  readonly feet = new THREE.Vector3(0, 0, 6)
  private yaw = 0
  private pitch = 0
  private eye = EYE_HEIGHT_M
  private crouched = false
  private coyote = COYOTE_SEC
  private jumpBuffer = 0
  private readonly velocity = new THREE.Vector3()
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly physics: MapPhysics,
  ) {
    this.writeCamera()
  }

  /** Feet position in meters. Yaw 0 looks down -Z. */
  place(at: readonly [number, number, number], yaw: number): void {
    this.feet.set(at[0], at[1], at[2])
    this.yaw = yaw
    this.pitch = 0
    this.eye = EYE_HEIGHT_M
    this.crouched = false
    this.coyote = COYOTE_SEC
    this.jumpBuffer = 0
    this.velocity.set(0, 0, 0)
    this.physics.setCrouching(false)
    this.physics.teleport(at[0], at[1], at[2])
    this.writeCamera()
  }

  applyLook(input: Input): void {
    const look = input.consumeLook()
    this.yaw -= look.x * LOOK_SENSITIVITY
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - look.y * LOOK_SENSITIVITY,
      -PITCH_LIMIT_RAD,
      PITCH_LIMIT_RAD,
    )
    this.euler.set(this.pitch, this.yaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)
  }

  /** One fixed physics step. The caller steps the physics world afterwards. */
  simulate(dt: number, input: Input): void {
    this.updateWish(input)

    const speed = this.crouched
      ? CROUCH_SPEED_MPS
      : input.isRunHeld()
        ? RUN_SPEED_MPS
        : WALK_SPEED_MPS
    const hasWish = this.wish.lengthSq() > 1e-8
    if (hasWish) this.wish.normalize()
    const targetX = hasWish ? this.wish.x * speed : 0
    const targetZ = hasWish ? this.wish.z * speed : 0
    const opposing = this.velocity.x * targetX + this.velocity.z * targetZ < 0
    const rate = this.coyote <= 0
      ? AIR_ACCEL_MPS2
      : !hasWish || opposing
        ? GROUND_BRAKE_MPS2
        : GROUND_ACCEL_MPS2
    this.velocity.x = approach(this.velocity.x, targetX, rate * dt)
    this.velocity.z = approach(this.velocity.z, targetZ, rate * dt)

    if (this.jumpBuffer > 0 && this.coyote > 0 && this.velocity.y <= 0) {
      this.velocity.y = JUMP_SPEED_MPS
      this.jumpBuffer = 0
      this.coyote = 0
    } else if (this.coyote > 0 && this.velocity.y <= 0) {
      this.velocity.y = -GROUNDED_STICK_MPS
    } else {
      this.velocity.y -= GRAVITY_MPS2 * dt
    }
    if (this.jumpBuffer > 0) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)

    const rising = this.velocity.y > 0
    const moved = this.physics.move(
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
      !rising,
    )
    if (rising && moved.ceiling) this.velocity.y = 0
    const supported = moved.grounded || (moved.onFloor && this.velocity.y <= 0)
    this.coyote = supported ? COYOTE_SEC : Math.max(0, this.coyote - dt)
    if (supported && this.velocity.y < 0) this.velocity.y = 0
    this.feet.set(moved.x, moved.y, moved.z)
  }

  queueJump(): void {
    this.jumpBuffer = JUMP_BUFFER_SEC
  }

  toggleCrouch(): void {
    if (!this.crouched) {
      this.crouched = true
      this.physics.setCrouching(true)
      return
    }
    if (!this.physics.canStand()) return
    this.crouched = false
    this.physics.setCrouching(false)
  }

  syncView(dt: number): void {
    const target = this.crouched ? CROUCH_EYE_HEIGHT_M : EYE_HEIGHT_M
    const blend = dt > 0 ? 1 - Math.exp(-14 * dt) : 1
    this.eye += (target - this.eye) * blend
    this.writeCamera()
  }

  /** Steady horizontal speed from the controller, not from one rendered frame. */
  horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  pose(): PlayerPose {
    return {
      x: this.feet.x,
      y: this.feet.y,
      z: this.feet.z,
      yaw: this.yaw,
      pitch: this.pitch,
      eyeY: this.feet.y + this.eye,
      grounded: this.coyote > 0,
      crouched: this.crouched,
    }
  }

  private updateWish(input: Input): void {
    this.camera.getWorldDirection(this.forward)
    this.forward.y = 0
    this.wish.set(0, 0, 0)
    if (this.forward.lengthSq() <= 1e-8) return
    this.forward.normalize()
    this.right.crossVectors(this.forward, WORLD_UP).normalize()
    if (input.isDown('KeyW')) this.wish.add(this.forward)
    if (input.isDown('KeyS')) this.wish.sub(this.forward)
    if (input.isDown('KeyD')) this.wish.add(this.right)
    if (input.isDown('KeyA')) this.wish.sub(this.right)
  }

  private writeCamera(): void {
    this.camera.position.set(this.feet.x, this.feet.y + this.eye, this.feet.z)
    this.euler.set(this.pitch, this.yaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current
  if (Math.abs(delta) <= maxDelta) return target
  return current + Math.sign(delta) * maxDelta
}
