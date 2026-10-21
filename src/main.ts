import './style.css'
import { loadCharacterTemplate } from './character/Character'
import { Game } from './game/Game'
import { compound } from './maps/compound'
import { MapPhysics } from './physics/MapPhysics'
import { loadMap } from './world/loadMap'

function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

const host = requiredElement('#viewport')
const fpsReadout = requiredElement('#fps')

let game: Game | undefined

async function boot(): Promise<void> {
  const [world, character] = await Promise.all([loadMap(compound), loadCharacterTemplate()])
  const physics = await MapPhysics.create(world.solids)
  game = new Game(host, fpsReadout, world, physics, character)
  game.start()
  if (import.meta.env.DEV) window.__game = game
}

void boot().catch((error: unknown) => {
  const hint = document.querySelector('#hint')
  const message = error instanceof Error ? error.message : 'Failed to load the map'
  if (hint) hint.textContent = message
  throw error
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose()
    if (window.__game === game) delete window.__game
  })
}
