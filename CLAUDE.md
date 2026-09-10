# CLAUDE.md — Surgical Trainer 3D

A data-driven 3D surgical training simulator for medical students. Procedures are
defined in JSON; the engine reads the JSON and drives the game.

## Non-negotiables

1. **This is an educational simulator, never clinical guidance.** It must never be
   presented as a substitute for supervised training. The disclaimer on the home
   screen and in the pause menu stays. Do not remove it, soften it, or hide it
   behind a toggle.
2. **Never invent clinical detail.** If a step, suture size, instrument choice,
   or sequence is uncertain, write it as a `"todo"` field on that step in the
   JSON and tell the user. A flagged gap is fine; a confident guess is not.
   Cite the work and topic in `references`, never fabricated page numbers or
   edition-specific citations.
3. **`src/engine/` imports nothing from Three.js and nothing from the DOM.**
   This is what makes the procedure logic unit-testable. If you find yourself
   wanting a `Vector3` in the engine, pass a plain `{x, y, z}` instead.
4. **Never fake a passing test or skip a failing one.** Fix the code or report
   the failure.
5. **Ask before changing the stack or adding a dependency.**

## Stack

- Three.js `0.185.1` + `@types/three` `0.185.4`, TypeScript strict, Vite, Vitest.
- Plain Three.js — no React Three Fiber. The UI is a DOM HUD, not a component tree.
- Custom ~60-line observable store in `src/store/store.ts`. No Zustand, no Redux.
- No backend. Progress goes to `localStorage`.
- **Version pin note:** `three` is held at `0.185.1` rather than the newest
  release because `@types/three` trails by a release. Bump both together.

## Layout

```
src/engine/   pure TS: types, JSON validation, step machine, scoring, persistence
src/scene/    all Three.js: viewer, cameras, models, tools, effects, raycasting
src/ui/       plain TS + CSS screens and HUD
src/store/    observable store + localStorage wiring
src/data/     tools.json, procedures/*.json, zones/*.ts, SCHEMA.md
tests/        mirrors src/engine
```

## The engine ↔ scene contract

The scene sends the engine a flat `ToolAction` and gets back a `StepResult`.
No Three.js type ever crosses that boundary.

```ts
scene  --ToolAction {toolId, zoneId, action, optionId?, precision?}-->  engine
engine --StepResult {ok, feedback, explainWhy, penalty, ...}-------->  ui + scene
```

## Anatomical zones

Zone ids live in `src/data/zones/<model>.ts` as `as const` string arrays.

- `src/scene/models/zones.ts` builds an invisible hit-test mesh per id.
- A Vitest test asserts every `targetZone` in every procedure JSON exists in the
  manifest for that procedure's model.

So a typo'd zone fails a test rather than silently never matching at runtime.
Adding a zone means: add the id to the manifest, then add its mesh.

## Conventions

- Files stay under ~300 lines. Split before you exceed it.
- Comment anything non-obvious — especially geometry maths and clinical rationale.
  Do not comment the obvious.
- `import type { ... }` for type-only imports (`verbatimModuleSyntax` is on).
- Scene units are metres. Table top sits at y = 0.9, patient lies along +z.
- **Every geometry, material, and texture created in `src/scene/` must be
  registered for disposal.** Use the `Disposer` from `src/scene/disposal.ts`.
  Leaking GPU memory across a procedure restart is a real bug here.
- Frame budget: hold above 50 fps on a mid-range laptop. Prefer shared materials
  and merged geometry over many small meshes.
- Visual tone: clinical and restrained. Blood and fluid effects stay subtle and
  non-graphic. No gore. This is a teaching tool students use in public.

## Rendering and realism

Visual fidelity comes from technique, not downloaded assets. **No external 3D
models** — the user chose a procedural realism pass over GLTF imports, partly
because imported anatomy would break the zone pinning below.

- **Image-based lighting is load-bearing.** `src/scene/environment.ts` bakes
  three's `RoomEnvironment` through `PMREMGenerator` into `scene.environment`.
  Metals get almost all their look from it; without it steel renders as flat
  grey plastic. Do not remove it to "save performance" without replacing it.
- **Materials are physical** (`src/scene/palette.ts`). Steel is fully
  metallic with a brushed roughness map. Exposed tissue gets a thin clearcoat
  so it reads as moist tissue. Keep tissue colours muted and textbook-like.
- **Textures are generated in code** (`src/scene/textures.ts`) as small
  tiling `DataTexture`s: skin pores, cloth weave, brushed steel. No image files.
- **Lights are in physical units.** With inverse-square decay, illuminance is
  intensity / distance squared, so intensities that look small (1-5) are
  correct. The lamp is one wide-penumbra spot, the only shadow caster.
- **Measured frame costs** (1336x914, forearm view, ~33 ms baseline before the
  fixes): RectAreaLight ~10 ms (removed), clearcoat ~5 ms, environment map
  ~5 ms, sheen ~2.5 ms, shadows under 1 ms, normal maps ~0. The scene is
  fragment-bound: keep sheen and clearcoat off large-area materials (drapes,
  skin, table), and run `__trainer.profile()` in the dev console before and
  after any change to materials or lights.
- **Geometry helpers** (`src/scene/geometry.ts`): `taperedTube` for jaws,
  vessels, bowel and wound edges; `lathe` for turned parts; `plate` for
  bevelled flat stock. Reach for these before boxes.
- **Drapes are cloth** (`src/scene/cloth.ts`): subdivided planes that sag at
  unsupported edges and fold, computed once in world space so panels cut from
  one sheet line up at their seams.
- **Instruments** are built tip-at-origin, body up +y, working plane XY. The
  builders are split into `toolBuildersOpen.ts` and `toolBuildersLap.ts`; the
  registry in `toolMeshes.ts` is typed as a full `Record<ToolMeshKey, ...>`, so
  a missing builder is a compile error.

## Scoring

All constants live in one place (`src/engine/scoring.ts`). Practice and exam are
two config objects, not two code paths. Exam mode disables hints and tool labels
and has a pass mark of 80. A distinct mistake type deducts once per step —
retrying the same wrong tool while thinking costs the student once, though every
attempt is still recorded in the mistake log for the review screen.

## Working style

Build in phases, check in after each: run the app, run the tests, fix what
breaks, then report what was built, what is left, and any open questions.
