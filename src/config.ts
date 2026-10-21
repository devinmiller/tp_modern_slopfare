/**
 * Placeholder tuning for the scaffold player.
 * These values are not matched to a reference game. See docs/agent-context.md.
 */

/** Meters. 1 world unit = 1 meter. */
export const EYE_HEIGHT_M = 1.7

/** Eye height while crouched. Untuned. */
export const CROUCH_EYE_HEIGHT_M = 1.05

/** Placeholder. Not matched to a reference game. */
export const WALK_SPEED_MPS = 4.5

/** Hold Shift. Untuned. */
export const RUN_SPEED_MPS = 6.6

/** While crouched. Untuned. */
export const CROUCH_SPEED_MPS = 2.2

/** How fast horizontal speed catches a direction on the ground. Untuned. */
export const GROUND_ACCEL_MPS2 = 28

/** How fast horizontal speed dies, or reverses, on the ground. Untuned. */
export const GROUND_BRAKE_MPS2 = 42

/** Horizontal control while airborne. Untuned. */
export const AIR_ACCEL_MPS2 = 10

/** Heavier than Earth so a jump does not float. Untuned. */
export const GRAVITY_MPS2 = 16

/** Upward speed at the moment of a jump. Untuned. */
export const JUMP_SPEED_MPS = 5.6

/**
 * How long a Space press stays queued. Covers a frame where the floor
 * check blips off, which happens most often beside a wall. Untuned.
 */
export const JUMP_BUFFER_SEC = 0.15

/**
 * How long after leaving the floor a jump is still allowed. Untuned.
 * Short on purpose: it is for a missed ground check, not a long coyote hop.
 */
export const COYOTE_SEC = 0.1

/** Standing capsule, feet to the top of the head. */
export const STAND_HEIGHT_M = 1.8

/** Crouched capsule, feet to the top of the head. */
export const CROUCH_HEIGHT_M = 1.15

/** Capsule radius. Kept narrower than Compound's gate. */
export const CAPSULE_RADIUS_M = 0.32

/** Gap the character controller keeps off walls and the floor. */
export const SKIN_WIDTH_M = 0.02

/** Fixed Rapier step. The render frame is still variable. */
export const PHYSICS_STEP_SEC = 1 / 60

/** Radians of yaw or pitch per pixel of pointer movement. Untuned. */
export const LOOK_SENSITIVITY = 0.0022

/**
 * Vertical field of view in degrees.
 * Three.js treats PerspectiveCamera fov as vertical.
 */
export const VERTICAL_FOV_DEG = 70

/** Keeps the look direction from flipping over the vertical. */
export const PITCH_LIMIT_RAD = Math.PI / 2 - 0.01

export const CAMERA_NEAR_M = 0.08
export const CAMERA_FAR_M = 200

/** Caps a hitch so one long frame cannot launch the player. */
export const MAX_FRAME_DELTA_SEC = 0.05
