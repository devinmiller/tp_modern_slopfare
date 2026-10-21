# Agent context

Read this before changing the project. Update it in the same change when you alter architecture, finish a milestone, or defer a design choice. Status lives here, not in `AGENTS.md`.

Last updated: 2026-10-21

## Intent

A first-person game in the browser. The long-term target is a force versus counter-force tactical shooter in the style of Insurgency: Sandstorm and Counter-Strike: objective rounds, map control, and deliberate gunplay.

This is an original game. Those titles are references for feel and mode structure. Do not copy their assets, audio, maps, UI, names, or trademarks into this repo.

## Current milestone

The page boots into the Compound map. A player can look, walk, run, jump, and crouch, and collides with the map. The body is a human mannequin with authored idle, walk, sprint, crouch, and jump clips. A second copy stands on the counter-force spawn so the full model can be seen from outside. There is no combat, no teams, and no round rules.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Vite 8 | Dev server and bundler | Fast local iteration and a static `dist/` for later hosting |
| TypeScript 7, strict | Application language | The simulation will grow past what an untyped script can hold |
| Three.js 0.186 | Rendering and 3D math | Requested. WebGL stays behind this API |
| `@types/three` 0.186 | Declarations | The `three` package publishes JavaScript with JSDoc in `src/` and does not put `.d.ts` on its export map. DefinitelyTyped is what `tsc` resolves |
| pnpm 12.4.1 | Package manager | Already installed on the development machine. Node was not on `PATH`. `devEngines.runtime` tells pnpm to download Node 22 when it is missing |
| `@dimforge/rapier3d-compat` 0.21 | Physics | Collision, ground contact, and the character controller. The compat build inlines WASM so Vite does not need a separate WASM plugin |

No UI framework or networking library is installed. Add one only when a milestone needs it, and record the reason in this file.

## How to run

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints (configured for `127.0.0.1:5173`). Click the view, then WASD. Shift runs, Space jumps, C toggles crouch. Esc releases the mouse.

`pnpm typecheck` and `pnpm build` should pass before a milestone is called done. `pnpm preview` serves the production build.

In the dev server, the console exposes `window.__game`. `__game.capturePose()` returns feet position, look angles in radians, eye height, and whether the player is grounded or crouched. `__game.mapSolids()` and `__game.mapMarkers()` return the loaded map. That handle is omitted from production builds. It is a debug hook, not a gameplay API.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Viewport, placeholder crosshair, control hint, FPS readout |
| `src/main.ts` | Loads the map, mounts `Game`, registers the dev handle, disposes on Vite HMR |
| `src/config.ts` | Untuned player and camera numbers |
| `src/game/Game.ts` | Composition root. Owns the frame loop, resize, and subsystem lifetime |
| `src/game/FrameClock.ts` | Variable delta time, clamped. Simulation only |
| `src/hud/FpsMeter.ts` | FPS over raw frame timestamps, about twice a second |
| `src/input/Input.ts` | Polled keys and pointer-lock look deltas |
| `src/player/PlayerController.ts` | Look, stance, and the kinematic move intent |
| `src/character/Character.ts` | Loads the human glTF and plays its locomotion clips |
| `public/models/human/` | Quaternius mannequin plus the animation library |
| `src/physics/MapPhysics.ts` | Rapier world, map cuboids, character controller |
| `src/render/createRenderer.ts` | WebGLRenderer, sRGB, ACES tone mapping, PCF shadows, pixel-ratio cap |
| `src/maps/compound.ts` | First map: solids and markers |
| `src/world/types.ts` | Map, solid, and marker types |
| `src/world/loadMap.ts` | Builds the scene from a map. Owns dispose |
| `src/world/sky.ts` | Daytime HDR sky, image-based lighting, and the sun |
| `src/world/surfaces.ts` | CC0 textures for ground, plaster, and wood |
| `src/world/meterBox.ts` | Box UVs scaled so a texture tile matches its real-world size |
| `public/textures/` | ambientCG 1K maps (Ground037, Plaster001, Wood051) and the daytime sky HDR |
| `src/style.css` | Full-window canvas and placeholder HUD |

## What works

- A single `requestAnimationFrame` loop via `WebGLRenderer.setAnimationLoop`.
- Resize follows the viewport element. The drawing buffer uses the device pixel ratio, capped at 2, and CSS sizes the canvas. `setSize` does not write an inline style, so the canvas cannot fight the layout.
- Clicking the canvas requests pointer lock. While locked, mouse movement changes yaw and pitch. Esc (browser default) leaves pointer lock. The hint hides while locked.
- WASD moves the feet relative to the horizontal look direction. Diagonal movement is normalized. Shift raises the target speed, C toggles crouch, and Space jumps. Keys still move the player when the pointer is not locked, so the page can be exercised without a captured mouse. Look deltas are ignored unless the pointer is locked, because `movementX` / `movementY` are only meaningful then.
- The player collides with `LoadedMap.solids`. Walking into a wall or a crate stops at it. Gravity holds the feet on the ground, and leaving the ground slab drops the player. C toggles crouch. Standing back up waits until the standing capsule fits.
- The local body follows the feet and yaw. Fragments within 0.55 m of the camera are discarded so the view is not inside the head. Idle, walk, sprint, crouch, and jump are clips from the model. Walking travels at 4.5 m/s and running at 6.6 m/s. The walk and sprint clips play through at the file rate instead of restarting every frame. The copy on `spawn-counterforce` keeps that spot and that yaw, and plays the same clips. Its feet rise with the player's jump.
- Releasing the pointer, or blurring the window, drops stale look deltas or stuck keys.
- Right-click on the canvas does not open the browser menu. The right button is unused.
- HMR and `Game.dispose` release the animation loop, listeners, geometries, materials, the Rapier world, and the WebGL context.
- World scale is meters. Compound's ground top is `y = 0`. The player starts on `spawn-force` at `(0, 0, 10)`, yaw 0, looking down `-Z` into the yard. `spawn-counterforce` is at the north end, yaw π. `objective-cache` is the tan pad around the center crate. Teal and rust pads mark the two spawns. Pads are not colliders. After the first physics steps the feet sit about a skin-width above the ground.
- The sky is a daytime HDR. Image-based lighting fills the yard, and one directional light, aimed at the sun in that image, casts a shadow across it. There is no distance fog.
- An FPS readout sits in the top-right of the HUD. It counts frames against raw timestamps over about 500 ms. It does not use `FrameClock`, whose 50 ms cap would hide hitches and could not show a value under 20. The label stays hidden from assistive tech so it does not announce twice a second.

## Scaffold to replace

These exist so the loop, input, and camera have one owner. Do not build combat rules on top of them in place.

- `PlayerController` has acceleration, gravity, jump, crouch, and run. It does not have lean, prone, or a stance transition beyond the eye-height blend. Speeds in `src/config.ts` are untuned.
- Solids are the collision source, copied into Rapier cuboids when the map loads. Do not start treating meshes as the source of truth. Add cover in `src/maps/compound.ts`.
- The HUD is a CSS crosshair, one sentence of instructions, and the FPS readout. The readout is a performance check, not a game HUD widget.
- `VERTICAL_FOV_DEG` (70), `LOOK_SENSITIVITY` (0.0022 rad/px), and the movement speeds are placeholders in `src/config.ts`.
- `FrameClock` is a variable step capped at 50 ms so a stalled tab cannot fling the player. Rapier itself steps at a fixed 1/60 inside that budget, up to four steps. That fixed step is only the physics world. Fire rate, movement skill, and anything that will later be lag-compensated still need one simulation clock. Do not pretend the clamped variable step is deterministic.

## Decisions

### 2026-10-21 — Camera and input are ours

Three.js `PointerLockControls` is not used. It owns the camera and the key bindings. Sway, lean, recoil, and later prediction need yaw, pitch, and movement in our code.

`Input` records `KeyboardEvent.code` for the frame. Feature code polls `isDown` and `consumeLook`. New keys go in `Input`, not in a fresh window listener. `code` is layout-independent (`KeyW`, not the character `w`).

The camera quaternion is Euler `YXZ`: yaw around Y, then pitch around X. Movement uses the camera's world direction with `y` removed, so pitch does not change ground speed. The right vector is that heading crossed with world up.

### 2026-10-21 — Look-while-moving workaround reverted

Look froze while WASD was held during a test on a laptop touchpad. A follow-up read `pointerrawupdate` as well as `mousemove`, and called `preventDefault` on W/A/S/D. That change was reverted. Laptops often suppress touchpad motion while a key is down. A mouse does not. Look is `mousemove` on `window` again, and only while the pointer is locked. Do not add a second look stream for this symptom unless it still happens with a mouse.

### 2026-10-21 — Meters, feet, eye height

1 world unit is 1 meter. `PlayerController.feet` is the feet. The camera is `EYE_HEIGHT_M` (1.7) above the feet while standing, and `CROUCH_EYE_HEIGHT_M` (1.05) while crouched. Crouch changes eye height. It does not encode stance into the feet position.

### 2026-10-21 — `Game` is the composition root

`main` loads the map, builds the Rapier world from its solids, then `Game` receives both and constructs the renderer, input, and player. `Game` ticks them from one frame callback. Add new systems there. Do not start a second animation loop, and do not keep the running game in a module singleton. The dev-only `window.__game` assignment in `src/main.ts` is the exception, for the console.

### 2026-10-21 — Rapier for collision, kinematic body for the player

`@dimforge/rapier3d-compat` 0.21 owns the physics world. Each map solid becomes a static cuboid. The player is a kinematic capsule driven by Rapier's character controller: slide, ground snap, and a short autostep (0.25 m) so a lip does not stop a walk, without climbing the crates. A dynamic rigid body was not used. It fights aim, acceleration, and crouch.

Gravity, jump, run, and crouch are applied as the controller's desired movement. Ground acceleration and braking replace the old constant velocity. The numbers in `src/config.ts` are untuned. This is not a choice between Sandstorm's inertia and Counter-Strike's counter-strafe. That choice is still open.

Ctrl is not used. On this machine it is a window hotkey and closes the view. C toggles crouch. A second press stands, unless the standing capsule does not fit. The stand check uses the floor under the feet, so a capsule that has sunk a few centimeters is not treated as blocked by the ground. Space queues a jump for a short buffer. The floor check is a downward ray as well as the character controller, because the controller reports airborne while a wall is touching the capsule and that was eating jumps. A rising move is cancelled only by a downward-facing surface, not by a wall trimming the step. Shift is hold-to-run, and crouch overrides it.

The character controller does not see a collider that was just created or resized until the world steps. `MapPhysics` steps after building the world and after every teleport, including a crouch. Otherwise the next move passes through the floor, the feet sink, and the stand check fails in the open. `Game.dispose` calls `world.free()`.

There is still no server. Do not add a transport until a local round is worth replicating.

### 2026-10-21 — Human mannequin with authored locomotion

The body is the mannequin shipped with Quaternius's Universal Animation Library (CC0), `public/models/human/AnimationLibrary_Godot_Standard.gltf`. One skinned mesh carries idle, walk, sprint, crouch idle, crouch move, jump start, jump loop, and jump land. Travel speed stays 4.5 m/s walking and 6.6 m/s running. Clips play at the file rate: walk about 1.3 s, sprint about 0.67 s. Gait comes from the controller's horizontal velocity. Measuring speed from one rendered frame made it flap between stopped and sprint, and the clip restarted every frame, which looked like a blur no playback rate could change. The earlier raccoon file only had a generated walk and run, and crouch and jump were bone offsets. That file and the Draco decoder are gone.

The glTF faces +Z. The instance turns it by π so yaw 0 still looks down −Z. The model is scaled to about 1.72 m. The first-person clone discards fragments within 0.55 m of the lens. The exhibit on `spawn-counterforce` keeps the marker's xz and yaw. Its clip follows the player's speed, crouch, and airborne state, and its feet use the player's feet height during a jump. Neither mesh has a collider.

### 2026-10-21 — Daytime sky and one fitted shadow

Compound is lit by a CC0 HDR from Poly Haven: Kloofendal 48d Partly Cloudy (Pure Sky), Greg Zaal, with sky edits by Jarod Guest. The 2K file is `public/textures/sky/day.hdr`. It is the scene background and the environment map. Three.js turns that equirectangular image into the sharp sky and the prefiltered lighting. The sun in the image is about 48° up, toward +X and +Z, which is behind and to the right of `spawn-force`, so the faces ahead are lit. A directional light of intensity 3 sits on that sun. `environmentIntensity` is 0.22, because the HDR already contains the sun and a full-strength environment washes the shadow out. Walls and props cast and receive. The ground and the marker pads only receive. The shadow frustum covers the current yard (about 64 m across, centered near the origin); refit it in `src/world/sky.ts` if the map grows past that. Output is sRGB through ACES Filmic at exposure 0.9. Shadows are PCF. `PCFSoftShadowMap` was removed in Three.js r186. Pixel ratio stays capped at 2. The earlier flat sky color, matching fog, and hemisphere light are gone.

### 2026-10-21 — pnpm downloads Node

The machine had pnpm 12.4.1 and did not have `node` on `PATH`. `package.json` `devEngines.runtime` pins Node `^22.14.0` with `onFail: download`, so `pnpm install` fetches a runtime instead of requiring a global Node install. The install resolved Node 22.23.4. The lockfile is `pnpm-lock.yaml`.

### 2026-10-21 — `@types/three` instead of types from the `three` package

`three@0.186.1` has no `.d.ts` and its `exports` map has no `types` condition, so `tsc` treated the import as `any`. `@types/three@0.186.0` matches that release. Keep the two versions on the same minor. Do not point `tsc` at `three/src` just to read JSDoc; that compiles the whole library into the project and will drift from the bundled build Vite serves.

### 2026-10-21 — Maps are boxes and markers

A map is a TypeScript value: axis-aligned solids plus markers. `src/maps/compound.ts` is the first one. `loadMap` builds meshes from that data and keeps the same records on `LoadedMap.solids`. `MapPhysics` copies those records into cuboids. Gameplay reads the records, not the scene graph.

Solids use a center and a full size, in meters. The ground slab is centered at `y = -0.1` so its top is `y = 0`. Markers are spawns (with a side and a yaw) or an objective footprint. The loader draws spawn pads and the objective pad; those pads are not solids.

Surfaces are CC0 1K scans from ambientCG: Ground037 (2.1 m), Wood051 (0.8 m), and Plaster001 (tiled at 2 m because no physical size was published). Files live in `public/textures/`. Color is sRGB. Roughness and the OpenGL normal stay linear. Box UVs are scaled in `meterBox` so one tile matches that size. A missing texture falls back to a flat color.

Extend Compound by editing the solid list. Do not author the next cover as raw Three.js calls in the loader. A glTF art pass waits until this blockout is worth modeling.

## Open design choices

Ask before choosing one of these, then record the answer in Decisions.

1. **Movement feel.** Sandstorm is heavy: inertia, lean, slow aim. Counter-Strike is counter-strafe and accuracy recovery. The two conflict, and "in the style of both" does not say which one wins. Basic acceleration is in place. It is not that choice.
2. **Lethality.** Counter-Strike uses health and armor. Sandstorm is much more lethal and has suppression. Unspecified.
3. **Round and objective rules.** Not designed. Plant/defuse and sector capture are both plausible. Neither is chosen.
4. **Force and counter-force.** The two sides are named only. No roster and no asymmetry.
5. **Multiplayer transport.** None. WebRTC and WebSockets are both unchosen.

## Left to do

Later items depend on earlier ones. This is a working order, not a commitment that every line is in scope. Reorder it if an open choice above is settled.

1. Settle movement feel and lethality before tuning speeds or adding weapons. Lean and prone are not in yet.
2. Weapon scaffold: a hitscan trace from the camera, a debug impact marker, and a trigger cooldown. A viewmodel can wait.
3. Keep extending Compound in `src/maps/compound.ts`: openings, another route, and cover at 1.2 m and 2 m. The format is already there.
4. A local round shell: two sides, spawns, a timer, one win condition. Still no network.
5. Damage and death on that round shell.
6. A fixed simulation step before competitive timing: fire rate, movement skill, lag compensation. Physics already substeps at 1/60; the rest of the game does not.
7. Audio and authored materials. Locomotion clips are already on the mannequin. The yard already has one shadow map; refit `src/world/sky.ts` if the map grows past it.
8. Multiplayer, after items 4–6.

Also still open, and not blocking item 1:

- No automated tests. Add a runner when the first pure rule exists (damage, round win, movement integration). The scaffold does not need one yet.
- No menu, settings, or loadout UI.

## Verified on 2026-10-21

- `pnpm typecheck` and `pnpm build` passed. The build warns about the main chunk size; that warning is expected (see Conventions).
- The dev server rendered the range: ground, both barriers, both crates, the board, the backstop, the crosshair, and the hint. WebGL2 context was present.
- At a 1920×1080 CSS viewport and device pixel ratio 2, the drawing buffer was 3840×2160. After forcing an 800×600 viewport at pixel ratio 1, the buffer was 800×600. The scene was not stretched.
- Holding W for 0.5s moved the feet from `z = 6` to `z = 3.75` (4.5 m/s along −Z). D moved `+X` by 2.25 m. W and D together covered 2.25 m, so diagonal movement is normalized.
- An automated click fired `mousedown` on the canvas, but the event was untrusted, so the browser did not grant pointer lock and the hint stayed up.
- A later `pointerrawupdate` experiment for looking while WASD is held was reverted the same day. See Decisions.
- The Compound yard shows a cloudy daytime sky. From `spawn-force`, the walls ahead are sunlit and the east wall casts a shadow on the grass. No Vite error overlay. The FPS readout still updates.
- Rapier collision: after settling, the feet rest at about `y = 0.02` and stay there while idle. Holding W stops on the center crate at about `z = -3.11`. C crouches and a second press stands; the feet stay on the ground either way. Control does not crouch. Space in the open peaks near `y = 1.05` and lands grounded. Five jumps while standing against the crate each left the ground and finished still at `z = -3.11`. Shift covers more ground than a walk, and releasing it brakes instead of stopping dead.

## Checks

- `pnpm typecheck`
- `pnpm build`
- `pnpm dev`, then in the browser: Compound is visible under the daytime sky. The player pose starts at `(0, 0, 10)`. WASD moves, and forward movement stops on the center crate instead of passing through it. Shift is faster than a walk. Space jumps in the open and while pressed against the crate. C toggles crouch, and pressing it again stands. A click hides the hint after pointer lock. The FPS readout shows a number.
- Resize the window and confirm the view does not stretch.

## Conventions

- Gameplay code stays in TypeScript under `src/`. Three.js is the renderer and the math library.
- Poll input. Add keys in `Input`.
- Put untuned gameplay numbers in `src/config.ts` and say here that they are untuned.
- Dispose GPU resources when a world or renderer is torn down, and call `MapPhysics.dispose` so Rapier frees its WASM world. Vite HMR calls `Game.dispose`.
- Update this file when the sections above change.
- The production build warns that the main chunk is over 500 kB. That chunk is Three.js plus Rapier's inlined WASM. Leave it until there is a second route or a heavy system that can load later.
