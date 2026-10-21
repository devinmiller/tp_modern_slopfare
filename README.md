# Browser Game

A first-person game that runs in the browser. The long-term target is a force versus counter-force tactical shooter. This repository currently contains the scaffold and the first map, Compound: a walled yard with collision.

Insurgency: Sandstorm and Counter-Strike are references for feel and mode structure. This project does not use their assets, audio, maps, or UI.

## Run

[pnpm](https://pnpm.io/) 12 downloads Node 22 on `pnpm install` when Node is not already available (`devEngines` in `package.json`).

```sh
pnpm install
pnpm dev
```

Open the local URL Vite prints. Click the view, then use WASD. Shift runs, Space jumps, C toggles crouch. Esc releases the mouse.

```sh
pnpm typecheck
pnpm build
pnpm preview
```

## Where things stand

The handoff for ongoing work is [docs/agent-context.md](docs/agent-context.md): what is implemented, why the scaffold is shaped this way, and what is left.
