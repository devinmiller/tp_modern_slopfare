import { MAX_FRAME_DELTA_SEC } from '../config'

export class FrameClock {
  private previousMs: number | null = null

  /** Seconds since the previous frame. The first call returns 0. */
  tick(nowMs: number): number {
    const previous = this.previousMs
    this.previousMs = nowMs
    if (previous === null) return 0
    const delta = (nowMs - previous) / 1000
    return Math.min(Math.max(delta, 0), MAX_FRAME_DELTA_SEC)
  }
}
