import RAPIER from '@dimforge/rapier3d-compat'
import {
  CAPSULE_RADIUS_M,
  CROUCH_HEIGHT_M,
  GRAVITY_MPS2,
  PHYSICS_STEP_SEC,
  SKIN_WIDTH_M,
  STAND_HEIGHT_M,
} from '../config'
import type { MapSolid } from '../world/types'

let wasmReady: Promise<void> | undefined

function loadWasm(): Promise<void> {
  wasmReady ??= RAPIER.init()
  return wasmReady
}

function capsuleHalf(totalHeight: number): number {
  return Math.max(totalHeight / 2 - CAPSULE_RADIUS_M, 0.05)
}

export type PhysicsMove = {
  x: number
  y: number
  z: number
  /** Rapier's own floor contact from the character controller. */
  grounded: boolean
  /** A short downward ray from the feet hit a floor. Independent of wall contacts. */
  onFloor: boolean
  /** The move was stopped by a surface facing downward. */
  ceiling: boolean
}

/**
 * Rapier world for one loaded map. Solids become static cuboids.
 * The player is a kinematic capsule moved by Rapier's character controller.
 */
export class MapPhysics {
  private halfHeight: number
  private readonly standShape: RAPIER.Capsule
  private readonly identity = { x: 0, y: 0, z: 0, w: 1 }
  private readonly floorRay: RAPIER.Ray
  private readonly floorOrigin = { x: 0, y: 0, z: 0 }

  private constructor(
    private readonly world: RAPIER.World,
    private readonly body: RAPIER.RigidBody,
    private readonly collider: RAPIER.Collider,
    private readonly controller: RAPIER.KinematicCharacterController,
  ) {
    this.halfHeight = capsuleHalf(STAND_HEIGHT_M)
    this.standShape = new RAPIER.Capsule(this.halfHeight, CAPSULE_RADIUS_M)
    this.floorRay = new RAPIER.Ray(this.floorOrigin, { x: 0, y: -1, z: 0 })
  }

  static async create(solids: readonly MapSolid[]): Promise<MapPhysics> {
    await loadWasm()
    const collision =
      RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
    const world = new RAPIER.World({ x: 0, y: -GRAVITY_MPS2, z: 0 })
    world.timestep = PHYSICS_STEP_SEC

    for (const solid of solids) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(solid.size[0] / 2, solid.size[1] / 2, solid.size[2] / 2)
          .setTranslation(solid.at[0], solid.at[1], solid.at[2])
          .setActiveCollisionTypes(collision),
      )
    }

    const halfHeight = capsuleHalf(STAND_HEIGHT_M)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        0,
        halfHeight + CAPSULE_RADIUS_M,
        0,
      ),
    )
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, CAPSULE_RADIUS_M).setActiveCollisionTypes(
        collision,
      ),
      body,
    )
    const controller = world.createCharacterController(SKIN_WIDTH_M)
    controller.setSlideEnabled(true)
    controller.enableAutostep(0.25, 0.2, false)
    controller.enableSnapToGround(0.3)
    controller.setMaxSlopeClimbAngle(Math.PI / 4)
    controller.setMinSlopeSlideAngle(Math.PI / 4)

    const physics = new MapPhysics(world, body, collider, controller)
    // The character controller does not see colliders until the broad phase
    // has been built. Without this, the first move falls into the floor.
    physics.commit()
    return physics
  }

  feet(): { x: number; y: number; z: number } {
    const center = this.body.translation()
    return {
      x: center.x,
      y: center.y - this.halfHeight - CAPSULE_RADIUS_M,
      z: center.z,
    }
  }

  teleport(x: number, y: number, z: number): void {
    const center = { x, y: y + this.halfHeight + CAPSULE_RADIUS_M, z }
    this.body.setTranslation(center, true)
    this.body.setNextKinematicTranslation(center)
    // Crouch changes the capsule and moves it. Until the world steps, the
    // character controller still sees the old shape and the next move sinks
    // into the floor. That sink made the stand check hit the ground.
    this.commit()
  }

  /** Standing capsule at the current feet, clear of the map. */
  canStand(): boolean {
    if (this.halfHeight >= capsuleHalf(STAND_HEIGHT_M) - 1e-4) return true
    const feet = this.feet()
    const surface = this.floorTop(feet.x, feet.y, feet.z)
    const base = surface === null ? feet.y : Math.max(feet.y, surface)
    const hit = this.world.intersectionWithShape(
      {
        x: feet.x,
        y: base + STAND_HEIGHT_M / 2 + SKIN_WIDTH_M,
        z: feet.z,
      },
      this.identity,
      this.standShape,
      undefined,
      undefined,
      this.collider,
    )
    return hit === null
  }

  setCrouching(crouched: boolean): void {
    const next = capsuleHalf(crouched ? CROUCH_HEIGHT_M : STAND_HEIGHT_M)
    if (Math.abs(next - this.halfHeight) < 1e-4) return
    const feet = this.feet()
    this.halfHeight = next
    this.collider.setHalfHeight(next)
    this.teleport(feet.x, feet.y, feet.z)
  }

  /**
   * Slide the capsule by a desired displacement. `snap` keeps the feet on the
   * floor; leave it off while moving upward so a jump is not pulled back down.
   * Call `commit` afterwards so the kinematic body catches up.
   */
  move(dx: number, dy: number, dz: number, snap: boolean): PhysicsMove {
    if (snap) this.controller.enableSnapToGround(0.3)
    else this.controller.disableSnapToGround()
    if (dy > 0) this.controller.disableAutostep()
    else this.controller.enableAutostep(0.25, 0.2, false)

    this.controller.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz })
    const corrected = this.controller.computedMovement()
    const current = this.body.translation()
    const next = {
      x: current.x + corrected.x,
      y: current.y + corrected.y,
      z: current.z + corrected.z,
    }
    this.body.setNextKinematicTranslation(next)

    let ceiling = false
    const hits = this.controller.numComputedCollisions()
    for (let i = 0; i < hits; i += 1) {
      const hit = this.controller.computedCollision(i)
      if (hit && hit.normal1.y < -0.5) ceiling = true
    }

    const feetY = next.y - this.halfHeight - CAPSULE_RADIUS_M
    return {
      x: next.x,
      y: feetY,
      z: next.z,
      grounded: this.controller.computedGrounded(),
      onFloor: this.probeFloor(next.x, feetY, next.z),
      ceiling,
    }
  }

  /**
   * True when a floor is just under the feet. The character controller's
   * grounded flag drops out while a wall is touching the capsule, so jump
   * uses this as well.
   */
  private probeFloor(x: number, feetY: number, z: number): boolean {
    return this.floorTop(x, feetY, z) !== null
  }

  /** Y of the floor just under the feet, or null when nothing is there. */
  private floorTop(x: number, feetY: number, z: number): number | null {
    this.floorOrigin.x = x
    this.floorOrigin.y = feetY + 0.12
    this.floorOrigin.z = z
    const hit = this.world.castRayAndGetNormal(
      this.floorRay,
      0.22,
      true,
      undefined,
      undefined,
      this.collider,
    )
    if (hit === null || hit.timeOfImpact > 0.2 || hit.normal.y <= 0.5) return null
    return this.floorOrigin.y - hit.timeOfImpact
  }

  commit(): void {
    this.world.step()
  }

  dispose(): void {
    this.world.free()
  }
}
