# The ScrubIn brief

The brief the user pasted on 2026-09-10, kept here as the spec for later
phases. **It is adopted on this project's existing stack, not built as
written:** the user chose to keep plain Three.js + Vite with no backend and
fold in the ideas that fit. `DECISIONS.md` lists every adaptation and every
part not adopted (Next.js, React Three Fiber, Supabase and the rest of section
3). Where this brief and `CLAUDE.md` disagree, `CLAUDE.md` wins.

---

## 1. Your role and the goal

You are a senior full stack game developer and technical 3D artist.

You are building ScrubIn, a web based 3D game that teaches people how surgery
works, from scrubbing in to closing the wound. It should feel like a real
operating theatre, with realistic instruments, realistic anatomy, and step by
step procedures that players learn, practise, and get scored on.

You have access to the Blender MCP server, which lets you control a live
Blender session. You will use it to create, import, refine, and export
realistic 3D assets that the app loads.

Work in phases (see section 14). At the end of each phase, stop, summarise what
you built, list what I should test, and wait for my go-ahead before starting
the next phase.

## 2. How Blender MCP fits into this project

- Blender MCP is a build time asset studio, not a runtime dependency. Players
  never need Blender installed.
- The asset loop is: Blender (via MCP) creates or imports a model, you clean it
  up, you export a `.glb`, you run the optimisation script, the file lands in
  `public/models` with an entry in `assets/manifest.json`, and the app hot
  reloads and shows it.
- MCP capabilities you should use:
  - `get_scene_info` and `get_object_info` to inspect before changing anything
  - `execute_blender_code` to run bpy Python for modelling, materials, baking,
    and export
  - `get_viewport_screenshot` to visually check your work
  - Poly Haven integration for HDRIs, PBR textures, and CC0 models
  - Sketchfab search and download for licensed models
  - Hyper3D Rodin and Hunyuan3D generation, only if they are enabled. Check
    first, never assume.
- Always inspect the scene before modifying it.
- After every meaningful modelling step, take a viewport screenshot and
  critique your result against the description of the real object before
  moving on. If it looks wrong, fix it.
- Keep each Blender step small. Large single scripts fail more often.
- Save every bpy script you run into `blender/scripts/` with a clear name, so
  the whole asset library can be rebuilt later without MCP.
- Save working files into `blender/source/` as `.blend` files.

## 3. Tech stack

- Next.js (App Router) with TypeScript in strict mode
- React Three Fiber, @react-three/drei, @react-three/postprocessing
- @react-three/rapier for physics and collisions
- Zustand for global game state
- XState (or a typed state machine) for procedure step logic
- Tailwind CSS for UI
- Supabase for auth, user progress, scores, and leaderboards
- gltf-transform for asset optimisation (meshopt or Draco geometry, KTX2
  textures)
- Web Audio or Howler.js for sound
- Vitest for unit tests, Playwright for end to end tests
- Anthropic API for the optional in-game AI mentor (section 10)
- Deploy target: Vercel

## 4. Project structure

```
scrubin/
  CLAUDE.md
  DECISIONS.md
  .env.example
  app/
    (marketing)/
    dashboard/
    library/
    procedure/[id]/briefing/
    procedure/[id]/play/
    procedure/[id]/report/
    anatomy/
    settings/
    dev/asset-viewer/
    api/mentor/
  components/
    scene/      OperatingRoom, PatientRig, InstrumentTray, Lighting, CameraRig
    tools/      Scalpel, NeedleDriver, Forceps, Scissors, Cautery, Suction, Retractor
    ui/         HUD, StepPanel, VitalsMonitor, InstrumentPicker, ScoreCard, HintButton
  game/
    engine/     procedure state machine, scoring, event bus, vitals model
    mechanics/  incision, suturing, cautery, suction, retraction, grasping
    procedures/ JSON procedure files
  content/
    procedures/ markdown explanations with references
  public/
    models/     optimised .glb files only
    textures/
    hdri/
    audio/
  assets/
    manifest.json
    licenses.md
  blender/
    source/     .blend working files
    scripts/    every bpy script used
    export/     raw exports before optimisation
  scripts/
    optimize-assets.ts
    validate-manifest.ts
  supabase/
    migrations/
  tests/
    unit/
    e2e/
```

## 5. 3D asset pipeline rules

### Scale and orientation

- 1 Blender unit = 1 metre. Use real world sizes. A #3 scalpel handle is
  roughly 12 to 13 cm. An operating table is roughly 2 m long.
- Apply all transforms before export.
- Put origins at sensible points. Instruments: where the hand grips. Hinged
  instruments: a separate pivot empty for each moving part.
- Export glTF 2.0 binary (`.glb`), +Y up.

### Naming

- snake_case with prefixes: `env_` (environment), `inst_` (instruments),
  `anat_` (anatomy), `prop_` (props).
- Example: `inst_needle_driver_mayo_hegar`, `anat_appendix`, `env_or_table`.
- Any part the app must animate or hit test gets a named node: `jaw_upper`,
  `jaw_lower`, `blade_tip`, `needle_tip`, `grip_point`.

### Materials

- PBR metallic roughness only.
- Bake procedural Blender node setups to image textures, because glTF cannot
  export most node trees.
- Texture sizes: 2K max for hero assets (patient, instruments in hand), 1K for
  props, 512 for background items. Power of two only.
- Tissue: bake colour, normal, roughness, and a thickness map. In the app, use
  MeshPhysicalMaterial (sheen, clearcoat for a wet look, thickness based
  subsurface approximation).
- Stainless steel: high metallic, low roughness, subtle brushed roughness
  variation.
- Gloves and drapes: correct fabric and latex roughness, small normal detail.

### Budgets

- Hero asset: under 60k triangles
- Instrument: under 15k triangles
- Prop: under 5k triangles
- Whole visible scene: under 400k triangles
- Provide a lower detail LOD for hero assets when needed

### Optimisation script (`scripts/optimize-assets.ts`)

- Reads `blender/export/`
- Runs gltf-transform: dedup, prune, weld, texture resize, KTX2 compression,
  meshopt compression
- Writes to `public/models/`
- Updates `assets/manifest.json`
- Fails loudly with a clear message if an asset breaks a budget or is missing
  required named nodes

### Manifest entry example

```json
{
  "id": "inst_needle_driver_mayo_hegar",
  "file": "/models/inst_needle_driver_mayo_hegar.glb",
  "category": "instrument",
  "triangles": 11240,
  "fileSizeKb": 420,
  "textures": { "baseColor": 1024, "normal": 1024, "orm": 1024 },
  "requiredNodes": ["jaw_upper", "jaw_lower", "grip_point"],
  "source": "procedural bpy script: blender/scripts/inst_needle_driver.py",
  "license": "original",
  "version": 1
}
```

### Asset sourcing priority

1. Anatomy: start from open anatomical datasets such as Z-Anatomy or
   BodyParts3D. Check the licence (often CC BY-SA, which needs attribution and
   share alike). Import, retopologise if needed, and retexture for realism.
2. Environment textures and HDRIs: Poly Haven (CC0).
3. Instruments: model them procedurally with bpy. Most surgical instruments are
   clean hard surface shapes. Use real reference descriptions and proportions.
4. Props: Sketchfab models only if the licence allows commercial use.
5. AI generation (Hyper3D Rodin, Hunyuan3D): props only. Never use AI generated
   meshes for anatomy that must be accurate. Always clean topology after
   generation.

Record every asset in `assets/licenses.md` with source URL, author, and
licence. Never use an asset with an unclear licence.

### Realism checklist (an asset is only accepted when all pass)

- Screenshot from 3 angles in Blender under an operating theatre style HDRI
- Scale check against a 1.8 m human reference mesh
- Loaded in the app at `/dev/asset-viewer` and screenshotted under game lighting
- Within budget and has all required named nodes

## 6. Asset list

### Environment

- Operating theatre shell: washable wall panels, floor, ceiling with laminar
  airflow panel, doors, scrub sink area
- Operating table with arm boards
- Dual head surgical light (adjustable arms)
- Anaesthesia machine
- Patient vitals monitor (the screen must be a separate material the app can
  draw live data onto)
- IV pole with bag, Mayo stand, back table, electrosurgical unit, suction
  canister
- Laparoscopic tower (later phase)

### Instruments (with correct moving parts)

- Scalpel handle #3 with #10 and #15 blades
- Metzenbaum scissors and Mayo scissors
- Adson forceps (toothed and non-toothed), DeBakey forceps
- Kelly hemostat and mosquito hemostat
- Mayo-Hegar needle driver
- Army-Navy retractor, Weitlaner self-retaining retractor, Richardson retractor
- Yankauer suction tip
- Electrocautery pen
- Curved suture needle (the thread is a runtime rope in the app, not a static
  mesh)
- Gauze, towel clips, skin stapler
- Laparoscopic trocars, laparoscope, graspers (later phase)

### Patient and anatomy

All layers are separate meshes in the same coordinate space so they line up
perfectly.

- Draped patient body with an exposed operative window
- Suturing practice pad (skin, fat, fascia layers) for skill drills
- Abdominal wall layers: skin, subcutaneous fat, fascia or aponeurosis, muscle,
  peritoneum
- Abdominal contents: small bowel, caecum, appendix with mesoappendix and its
  artery, ascending colon, omentum
- Gloved hands with a simple rig for grip poses (optional, floating instruments
  are fine first)

### Wound states

Intact, marked incision line, incised at each layer, retracted, closed with
sutures. Use shaders, decals, and morph targets where possible instead of many
separate meshes.

## 7. Game design

### Game modes

1. Learn: guided walkthrough, explanation text, highlighted targets, no fail
   state.
2. Practice: fewer hints, real scoring, player can retry a step.
3. Assessment: no hints, timer, full scoring, results saved to profile.
4. Quick drills: short skill games such as instrument identification, knot
   tying, interrupted sutures, and a sterile field challenge.

### Starting procedures

- Operating theatre orientation and instrument identification
- Surgical hand scrub, gowning, and gloving (sterile technique)
- Basic skin suturing: simple interrupted sutures on a practice pad
- Open appendectomy (simplified and educational)

### Later procedures

- Laceration repair with local anaesthetic
- Laparoscopic cholecystectomy
- Carpal tunnel release

### Procedure data format

Every procedure is a JSON file. Example of one step:

```json
{
  "id": "open_appendectomy",
  "title": "Open Appendectomy",
  "difficulty": 3,
  "estimatedMinutes": 15,
  "reviewed": false,
  "steps": [
    {
      "id": "skin_incision",
      "title": "Make the skin incision",
      "objective": "Cut through the skin along the marked line in one smooth stroke.",
      "explanation": "Short, clear explanation of why this step matters.",
      "instrument": "inst_scalpel_no3_blade10",
      "mechanic": "incision",
      "target": { "type": "path", "node": "incision_guide_spline" },
      "successCriteria": {
        "maxPathDeviationMm": 3,
        "targetDepthLayer": "subcutaneous_fat",
        "maxStrokes": 2
      },
      "commonErrors": [
        { "code": "too_deep", "feedback": "You went past the fat layer. Control your depth." },
        { "code": "off_path", "feedback": "Stay on the marked line." }
      ],
      "hints": ["Hold steady pressure and follow the line from top to bottom."],
      "quiz": {
        "question": "Which blade is used here?",
        "options": ["#10", "#11", "#15"],
        "answer": "#10"
      }
    }
  ]
}
```

### Scoring

- Accuracy: distance from the ideal incision path, suture spacing, bite depth
  consistency
- Tissue handling: too much force, damage to structures that must be protected
- Sterility: breaches such as touching non-sterile surfaces or dropping
  instruments
- Efficiency: time taken, unnecessary instrument swaps
- Knowledge: quiz answers
- Patient status: a simple vitals model (heart rate, blood pressure, SpO2, blood
  loss) that reacts to mistakes. Heavy bleeding needs suction and cautery to
  recover.
- Final report card with a per step breakdown and "what to review" links.

### Progression

- XP and levels
- Unlockable procedures
- Badges such as "Zero Breach" and "Perfect Closure"
- Rank titles: Medical Student, Foundation Doctor, Core Trainee, Registrar,
  Consultant

### Data model (Supabase)

- `profiles`: id, display name, rank, xp, settings
- `procedure_attempts`: id, user id, procedure id, mode, score, duration,
  started at, finished at
- `step_results`: attempt id, step id, sub scores, errors
- `badges` and `user_badges`
- Row level security on every table so users only see their own data
  (leaderboard uses a safe public view)

## 8. Interaction mechanics

Do not attempt full real time soft body tissue simulation. It will not run well
in a browser. Use the combination of decals, shaders, morph targets, simple
rope physics, and state swaps described below.

- Controls: mouse and keyboard first, touch second. Remappable keys.
- Camera: surgeon's view by default (looking down at the operative field).
  Limited orbit, zoom, and a "loupe" close up mode. Hotkeys to switch views.
- Instrument picker: radial menu or click on the tray. The active instrument
  follows the cursor, projected onto the tissue surface with raycasting.
- Incision: player holds and draws along the marked line. Compare the stroke
  against the guide spline with a tolerance. Depth is controlled by a modifier
  (hold time or scroll). Show the cut with a dynamic decal and a shader that
  reveals the layer below. When the step completes, blend into the opened wound
  mesh using morph targets.
- Retraction: drag the retractor to the wound edge. A morph target opens the
  wound further.
- Cautery: bleeding points spawn as small emitters. Hold the cautery pen on
  each within a time window. Add smoke particles and a sizzle sound.
- Suction: hover over blood pools. Blood is a decal or shader based pool that
  shrinks as it is suctioned.
- Suturing: a multi phase mini game. Pick the needle angle, enter perpendicular
  to the skin at the right distance from the edge, follow the needle's curve
  with a wrist arc motion, exit at the matching point on the other side, then
  tie the knot with a timed input sequence. Thread uses verlet rope simulation.
- Grasping and dissection: pick up tissue with forceps. Fake soft deformation
  with vertex shader displacement around the grab point.
- Feedback: sound cues, gamepad vibration where supported, screen edge colour,
  and mentor messages.

## 9. Lighting and realism in the app

- HDRI environment lighting from a theatre style HDRI
- Surgical light as a strong spotlight with soft shadows focused on the
  operative field
- ACES filmic tone mapping, subtle bloom on the surgical light, SSAO, light
  depth of field in loupe mode
- Wet tissue look with clearcoat and roughness variation
- Quality presets (Low, Medium, High) that toggle shadows, SSAO, bloom, texture
  resolution, and pixel ratio

## 10. AI mentor (optional, later phase)

- An "Attending Surgeon" side panel that explains why a step matters and
  answers questions about the current step.
- Calls go through `/api/mentor` on the server. Never expose the API key to the
  client.
- The system prompt limits the mentor to the current procedure JSON and its
  content file. It must say when it does not know. It must not give players
  real medical advice about their own health.
- Rate limit per user.

## 11. Screens

- Landing page
- Sign in and sign up
- Dashboard: progress, rank, recommended next procedure
- Procedure library: cards with difficulty, time, and available modes
- Pre-op briefing: patient case, 3D anatomy preview with layer toggles,
  instruments needed
- In game: 3D view with HUD (step panel, vitals monitor, instrument tray,
  timer, hint button, pause menu)
- Post-op report card
- Anatomy explorer: free 3D viewer with layer slider, labels, and quiz mode
- Settings: graphics quality, content level, controls, accessibility
- `/dev/asset-viewer` (dev only): load any manifest asset, toggle wireframe,
  show triangle count and named nodes

Visual style: clean clinical UI, dark surroundings, bright focused surgical
field.

## 12. Medical accuracy, safety, and content settings

- This is an educational game, not a medical device and not certified clinical
  training. Show a clear disclaimer on first launch and in the footer.
- Do not invent medical facts. For each procedure, write
  `content/procedures/<id>.md` with references to reputable open sources, such
  as StatPearls on NCBI Bookshelf and open medical textbooks.
- Every procedure has `"reviewed": false` until a qualified clinician checks
  it. Show an "Unreviewed content" badge in the UI while it is false.
- If you are unsure about a medical detail, leave a `TODO(clinical review)`
  instead of guessing.
- Content level setting:
  - Clinical: realistic blood and tissue (age gated)
  - Reduced: desaturated, less blood (default)
  - Schematic: colour coded anatomy, no blood
- Accessibility: colourblind safe highlight colours, subtitles for all audio,
  remappable keys, reduced motion option.

## 13. Performance and code quality targets

- 60 fps on a mid range laptop with integrated graphics on Medium
- 30 fps on recent phones on Low
- Under 8 MB initial load before entering a procedure. Lazy load procedure
  assets with a progress bar.
- Under 150 draw calls in the theatre scene. Use instancing for repeated items.
- TypeScript strict, no `any`. ESLint and Prettier.
- Unit tests for scoring, the state machine, incision path comparison, suture
  metrics, and the vitals model.
- One Playwright test per procedure that completes Learn mode with scripted
  inputs.

## 14. Build phases

### Phase 0: Setup and verification

- Create `CLAUDE.md` containing the key rules from this prompt.
- Verify the Blender MCP connection: call `get_scene_info`, create a 1 m cube,
  take a screenshot, delete the cube. Report which optional integrations (Poly
  Haven, Sketchfab, Hyper3D, Hunyuan3D) are enabled.
- Scaffold the Next.js app, a React Three Fiber canvas with a test cube,
  Tailwind, and the Supabase client.
- Build `scripts/optimize-assets.ts` and `scripts/validate-manifest.ts`.
- Done when: `npm run dev` shows the 3D canvas, and `npm run assets` processes
  a test `.glb` exported from Blender into `public/models` with a manifest
  entry.

### Phase 1: Operating theatre and asset viewer

- Build the theatre environment in Blender using Poly Haven HDRIs and textures:
  table, surgical light, vitals monitor, Mayo stand, back table.
- Build `/dev/asset-viewer`.
- Set up realistic lighting and post processing in the app.
- Done when: the theatre looks like a real operating room in screenshots and
  stays within budget.

### Phase 2: Instruments and identification drill

- Model the full starting instrument set with working hinges and named nodes.
- Build the instrument identification drill (see instrument, pick the name,
  learn its use) with score saving in Supabase.
- Done when: every instrument passes the realism checklist and the drill is
  playable end to end.

### Phase 3: Suturing skill

- Build the layered practice pad, needle, rope thread, suturing mechanic, and
  suture scoring.
- Done when: a player can place 5 interrupted sutures and gets spacing and
  depth feedback.

### Phase 4: Open appendectomy

- Build the draped patient, abdominal layers, and appendix anatomy.
- Write the procedure JSON and content file, wire the state machine, all
  mechanics, the vitals model, and the report card.
- Done when: the full procedure is playable in Learn, Practice, and Assessment
  modes, and its Playwright test passes.

### Phase 5: Progression, mentor, and polish

- Dashboard, ranks, badges, anatomy explorer, AI mentor, settings,
  accessibility, and audio.
- Deploy a Vercel preview.
- Done when: a new user can sign up, finish all starting procedures, and see
  their progress saved.

## 15. Working rules for you

- At the start of each phase, write a short plan (files to create, risks, open
  questions), then build.
- Commit to git after each working milestone with clear messages.
- Keep Blender steps small. Screenshot and self review after each one.
- If an MCP call fails, retry once, then try a smaller step, then tell me
  exactly what failed.
- Never commit secrets. Use `.env.local` and keep `.env.example` updated.
- When a decision is unclear, choose the simpler option, write it in
  `DECISIONS.md`, and keep going.
- Never say something works without running it.
- Keep the code modular so new procedures can be added by writing a JSON file,
  a content file, and any new assets, with little or no engine code.
