/// <reference types="vite/client" />

import type { Game } from './game/Game'

declare global {
  interface Window {
    /** Dev-server only. See docs/agent-context.md. */
    __game?: Game
  }
}
