const SAMPLE_WINDOW_MS = 500

/**
 * Frames per second over a short window of raw timestamps.
 * This deliberately does not use the clamped simulation step: that cap would
 * hide hitches and would never report a value below 20.
 */
export class FpsMeter {
  private frames = 0
  private windowStartMs: number | null = null
  private fps: number | null = null

  /** Null until the first sample window has elapsed. */
  sample(nowMs: number): number | null {
    if (this.windowStartMs === null) {
      this.windowStartMs = nowMs
      this.frames = 1
      return this.fps
    }

    this.frames += 1
    const elapsed = nowMs - this.windowStartMs
    if (elapsed < SAMPLE_WINDOW_MS) return this.fps

    this.fps = Math.round((this.frames * 1000) / elapsed)
    this.frames = 0
    this.windowStartMs = nowMs
    return this.fps
  }
}
