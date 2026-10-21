const PAGE_SCROLL_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

export class Input {
  private readonly keys = new Set<string>()
  private readonly pressed = new Set<string>()
  private lookX = 0
  private lookY = 0

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return
    if (PAGE_SCROLL_CODES.has(event.code)) event.preventDefault()
    if (!MODIFIER_CODES.has(event.code) && (event.metaKey || event.ctrlKey || event.altKey)) {
      return
    }
    if (!this.keys.has(event.code) && !event.repeat) this.pressed.add(event.code)
    this.keys.add(event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code)
  }

  private readonly onBlur = () => {
    this.keys.clear()
    this.pressed.clear()
  }

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || this.isPointerLocked()) return
    const request = this.element.requestPointerLock()
    void Promise.resolve(request).catch(() => {
      // A denied lock leaves movement on the keyboard and look unchanged.
    })
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.isPointerLocked()) return
    this.lookX += event.movementX
    this.lookY += event.movementY
  }

  private readonly onPointerLockChange = () => {
    const locked = this.isPointerLocked()
    if (!locked) {
      this.lookX = 0
      this.lookY = 0
    }
    document.body.classList.toggle('pointer-locked', locked)
  }

  private readonly onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.element.addEventListener('mousedown', this.onMouseDown)
    this.element.addEventListener('contextmenu', this.onContextMenu)
  }

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  isRunHeld(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight')
  }

  /** True once for the Space press that has not been read yet. */
  consumeJump(): boolean {
    return this.consumePress('Space')
  }

  /** True once for the C press that has not been read yet. */
  consumeCrouch(): boolean {
    return this.consumePress('KeyC')
  }

  private consumePress(code: string): boolean {
    const pressed = this.pressed.has(code)
    this.pressed.delete(code)
    return pressed
  }

  isPointerLocked(): boolean {
    return document.pointerLockElement === this.element
  }

  /** Pixel deltas accumulated since the last call. */
  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY }
    this.lookX = 0
    this.lookY = 0
    return look
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.element.removeEventListener('mousedown', this.onMouseDown)
    this.element.removeEventListener('contextmenu', this.onContextMenu)
    document.body.classList.remove('pointer-locked')
    if (this.isPointerLocked()) document.exitPointerLock()
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      target.closest('input, textarea, [contenteditable="true"]') !== null
    )
  }
}
