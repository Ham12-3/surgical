# CLAUDE.md — Surgical Trainer 3D

A data-driven 3D surgical training simulator for medical students. Procedures are
defined in JSON; the engine reads the JSON and drives the game. Since 2026-09-10
the roadmap follows the "ScrubIn" brief, adapted to this stack; `DECISIONS.md`
records every place it was adapted.

## Non-negotiables

1. **This is an educational simulator, never clinical guidance.** It is not a
   medical device or certified training, and must never be presented as a
   substitute for supervised training. The disclaimer on the home screen and in
   the pause menu stays. Do not remove it, soften it, or hide it behind a toggle.
2. **Never invent clinical detail.** If a step, suture size, instrument choice,
   or sequence is uncertain, write it as a `"todo"` field on that step in the
   JSON (in code and Blender scripts, a `TODO(clinical review)` comment) and
   tell the user. A flagged gap is fine; a confident guess is not. Cite the work
   and topic in `references`, never fabricated page numbers or edition-specific
   citations. Every procedure carries `"reviewed": false` until a qualified
   clinician has checked it, and the UI shows an "Unreviewed content" badge
   while it does.
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
- Blender 5.2 (Microsoft Store build), driven through the Blender MCP, builds
  models at build time; players never need it. The app loads them with three's
  own `GLTFLoader` and `MeshoptDecoder`, so this adds no npm dependency.
- **Version pin note:** `three` is held at `0.185.1` rather than the newest
  release because `@types/three` trails by a release. Bump both together.

## Layout

```
src/engine/       pure TS: types, JSON validation, step machine, scoring, persistence
src/scene/        all Three.js: viewer, cameras, models, tools, effects, raycasting
src/ui/           plain TS + CSS screens and HUD
src/store/        observable store, settings + localStorage wiring
src/data/         tools.json, procedures/*.json, zones/*.ts, asset manifest parsing
src/dev/          dev-only pages, left out of the build: the asset viewer
tests/            mirrors src/engine, plus the asset and settings checks
assets/           manifest.json (every model the app loads) and licenses.md
blender/scripts/  kit.py, kit_shapes.py, kit_*.py + assets/<id>.py: the bpy that builds each model
blender/source/   .blend working files
public/models/    exported .glb files, served as models/<id>.glb
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
- Frame budget: aim for 60 fps, and never below 50, on a mid-range laptop with
  integrated graphics; keep the theatre under 150 draw calls. Prefer shared
  materials and merged geometry over many small meshes.
- Visual tone: clinical and restrained. Blood and fluid effects stay subtle and
  non-graphic. No gore. This is a teaching tool students use in public.

## Rendering and realism

Visual fidelity comes from technique, not downloaded assets. Anatomy is built in
code so the click zones stay pinned to it; instruments are modelled in Blender
by checked-in scripts (see *Asset pipeline*).

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
  builders are split into `toolBuildersOpen.ts` (steel), `toolBuildersMoulded.ts`
  (moulded, turned and cloth) and `toolBuildersLap.ts`; the registry in
  `toolMeshes.ts` is typed as a full `Record<ToolMeshKey, ...>`, so a missing
  builder is a compile error. A model in `assets/manifest.json` with a
  `meshKey` replaces that builder at load time (`src/scene/modelLibrary.ts`);
  the builder stays as the fallback. Each open instrument has its own mesh
  key, so no two look alike in the drill (DECISIONS.md, D24).
  Procedural instruments are merged into one mesh per material as they are
  built, as the models already arrive: that took a full tray in the wide view
  from 165 draw calls to 100.
- **The room draws last.** Every theatre-shell mesh has `renderOrder` 1, so
  the depth test skips wall and floor pixels hidden behind the table, patient
  and drapes. That was 3-4 ms a frame.
- **Quality levels** (`src/scene/quality.ts`, a picker in the top bar, saved in
  localStorage): Medium is the default and the tuned look, about 17 ms a
  frame at 1336x914 on the target laptop. Low drops the lamp shadow and caps
  the pixel ratio at 1. High adds half-resolution ambient occlusion and bloom
  (`src/scene/postProcessing.ts`) at about 53 ms, and doubles the draw calls,
  so it is for dedicated graphics. Compare with `__trainer.setQuality()` and
  `__trainer.profile()`, which counts post-processing and whole-frame draw
  calls. The first profile after a page load always reads slow; discard it.
- **Steel roughness:** the brushed roughness map stores absolute roughness
  (about 0.22) and three multiplies it by the material's `roughness`, so
  `steel` and `steelDark` render close to mirror. `steelSatin`, for trays,
  uses 2.2 to land near 0.48. Whether to change the instrument steels is open
  (DECISIONS.md, D18).
- **Light sources** (`lightLens`) are drawn brighter than white, so they cross
  High's bloom threshold and ordinary reflections mostly do not.

## Asset pipeline (Blender MCP)

Blender is a build-time asset studio. The loop for one model:

1. Write or edit its script, `blender/scripts/assets/<id>.py`. Shared helpers
   (`loft`, `plate`, palette materials, export) live in `blender/scripts/kit.py`,
   ring-handle parts in `kit_instruments.py`, and each instrument family keeps
   its own `kit_<family>.py`. A script names every kit it needs beyond kit.py
   and kit_shapes.py on a `# kit: <file>` line at its top (DECISIONS.md, D27).
2. Send `kit.py` + `kit_shapes.py` + the kits the script names + the asset
   script + `build_and_export("<id>", r"<repo>\public\models")` through
   `execute_blender_code`. That writes a meshopt-compressed
   `public/models/<id>.glb`. `kit_shapes.py` works in app coordinates
   (`app(x, y, z)`), so sizes match the TypeScript constants directly.
3. Add or bump its entry in `assets/manifest.json` and its row in
   `assets/licenses.md`.
4. `npm run assets` checks every entry: file present, within its triangle
   budget, required nodes present, only palette materials, normals and UVs, no
   node turned or scaled at rest, both hinge pivots carrying a part, no
   extension the loader cannot decode, licence listed, and for instruments
   tip-at-origin in metres. It prints each model's triangles and file size.

Rules:

- The repo script is the source of truth: edit it, then send it. Never change a
  model only in Blender. Save the session to `blender/source/` after modelling.
- Inspect before changing anything (`get_scene_info`, `get_object_info`). Keep
  each step small. After every meaningful step, take `get_viewport_screenshot`
  and critique it against the real object; fix it before moving on.
- If an MCP call fails, retry once, then try a smaller step, then report
  exactly what failed.
- The MCP runs in safe mode: only `bpy`, `bmesh`, `mathutils` and pure-python
  stdlib imports, no `open` or `exec`, and no calling function values. That is
  why the kit is flat files sent ahead of each script rather than imported,
  and why `loft()` takes sizes as lists (shape them with `path_t()`).
- Headless rebuild, without the MCP:
  `blender --background --factory-startup --python blender/scripts/build.py -- <id>`.
  On this machine's Store build, `blender` is `blender-launcher.exe` in
  `%LOCALAPPDATA%\Microsoft\WindowsApps`. It prints nothing, so check the
  .glb's timestamp. Verified 2026-09-10: its output matched the MCP export byte
  for byte.
- Headless review, without the MCP:
  `blender --background --factory-startup --python blender/scripts/review.py -- <id> <out_dir> [<degrees> [x]]`
  renders the three checklist angles with EEVEE under `interior.exr`, beside a
  10 cm ruler for instruments and props or the 1.8 m figure for anything else,
  plus a close-up of an instrument's tip. Given a hinge angle (and `x` for
  thumb forceps) it renders the whole and the tip again with the hinge open.
  The outcome goes to `<out_dir>/<id>_review.txt`.
- Hinges: build each half of a hinged instrument as its own object and hang it
  from `hinge("jaw_upper" | "jaw_lower", pivot, [half])` in kit_shapes.py;
  `jaw_upper` carries the half whose jaw is on +x. Model it shut and give the
  manifest entry a `hingeDegrees`. Thumb forceps face their limbs through the
  thickness and hinge about x instead (`hingeAxis: "x"`, `jaw_upper` carrying
  the app +z limb). The app opens a hinge with `Hinge`
  (`src/scene/articulation.ts`); the asset viewer has a slider for it.
- Naming: snake_case ids with a category prefix (`inst_`, `anat_`, `env_`,
  `prop_`), and the file is `models/<id>.glb`. Any part the app animates or
  hit-tests is a named node (`jaw_upper`, `jaw_lower`, `blade_tip`,
  `needle_tip`, `grip_point`) listed in the entry's `requiredNodes`.
- Scale: metres, real-world sizes, transforms applied, exported +Y up.
  Instruments keep their working tip at the origin, because the tool controller
  drops the tip onto the target; where the hand grips is a `grip_point` node.
- Materials: name each Blender material after a palette key
  (`MODEL_MATERIAL_KEYS` in `src/data/assetManifest.ts`); the app swaps in the
  shared material on load. Run UVs with u along each part so the brushed-steel
  map streaks the right way. No image textures yet.
- Triangle budgets (`TRIANGLE_BUDGETS`): instrument 15k, anatomy and environment
  60k, prop 5k. The whole visible scene stays under 400k.
- An asset is accepted only when it has been screenshotted from 3 angles in
  Blender, scale-checked against a 1.8 m human reference, seen in the app under
  game lighting, and passes `npm run assets`. In Blender, `review_shots()`
  renders the three angles to PNGs in one call under the bundled
  `interior.exr` light, with `reference_human()` standing beside the model; the
  images go to the session's scratch folder, not the repo. In the app,
  `/asset-viewer.html?asset=<id>` (dev only) shows a model with its budget,
  named nodes and a 1.8 m figure, and `?models=off` on the main page loads the
  code-built stand-ins instead, for profiling one against the other.
- Every Blender call must include an asset script, even one that only
  renders: safe mode rejects the kit's call to `build()` when nothing
  defines it.
- Sourcing: anatomy stays code-built and no downloaded or AI-generated models
  are used until the open decision in `DECISIONS.md` (D12) is settled. Any
  download needs the user's OK first. Every asset gets a row in
  `assets/licenses.md`; an unclear licence means the asset is not used.

## Scoring

All constants live in one place (`src/engine/scoring.ts`). Practice and exam are
two config objects, not two code paths. Exam mode disables hints and tool labels
and has a pass mark of 80. A distinct mistake type deducts once per step —
retrying the same wrong tool while thinking costs the student once, though every
attempt is still recorded in the mistake log for the review screen. The brief
adds a Learn mode (guided, highlighted targets, no fail state) and short Drills;
its Assessment mode is exam mode. The first drill, instrument identification,
is `src/engine/drill.ts` (pure, seeded, tested) behind `src/ui/drillScreen.ts`,
with its record in localStorage (`src/store/drillProgress.ts`).

## Working style

- At the start of a phase, write a short plan: files, risks, open questions.
- Build in phases. End each by running the app and the tests and fixing what
  breaks, then report what was built, what to test and what is open, and wait
  for the go-ahead before starting the next phase.
- Commit after each working milestone, on a branch per phase.
- When a decision is unclear, take the simpler option, record it in
  `DECISIONS.md`, and keep going. Stack changes and new dependencies still need
  asking first (non-negotiable 5).
- Never say something works without running it. Never commit secrets.

Roadmap (the brief's phases on this stack): 0 asset pipeline and Blender check;
1 operating theatre and a dev asset viewer; 2 the full starting instrument set
with working hinges, plus an identification drill; 3 suturing practice pad;
4 open appendectomy; 5 progression, settings, accessibility and audio.
