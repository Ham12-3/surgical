# Decisions

Choices made while adapting the ScrubIn brief to this project, newest last.
"Open" means it needs the user before anything changes.

## 2026-09-10

**D1. Keep the stack, adopt the ideas.** The user chose to stay on plain
Three.js + Vite with the custom store and no backend, and fold in the parts of
the brief that fit. Not adopted: Next.js, React Three Fiber, drei,
postprocessing, rapier, Zustand, XState, Tailwind, Supabase, Howler,
Playwright, the Anthropic mentor and Vercel. Any of them can come back later as
an ordinary dependency request. Progress stays in localStorage, so accounts and
leaderboards wait until a backend is agreed.

**D2. The name stays "Surgical Trainer 3D".** The brief allowed renaming
ScrubIn freely; nothing needed renaming.

**D3. Instruments keep the tip at the origin.** The brief puts an instrument's
origin where the hand grips. The tool controller places the working tip on the
target, so the tip stays at the origin, and the grip becomes a `grip_point`
node when hands arrive.

**D4. No gltf-transform step yet.** Blender's own exporter applies meshopt
compression and three ships the decoder, so compression needs no new
dependency. The models carry no image textures, so KTX2 has nothing to do.
There is therefore no `blender/export/` staging folder and no
`optimize-assets.ts`. Revisit if baked textures arrive.

**D5. The manifest holds authored facts only.** Triangle counts and file sizes
are measured from each .glb and printed by `npm run assets`, not stored, so
they cannot drift from the file.

**D6. Asset validation is a Vitest file.** `npm run assets` runs
`tests/assetManifest.test.ts` instead of a separate `validate-manifest.ts`, so
no TypeScript runner or `@types/node` is needed. `tests/node-fs.d.ts` declares
the two `node:fs` calls it uses.

**D7. Manifest paths are relative** (`models/<id>.glb`). The Vite base is `./`,
so a build can be served from any subpath.

**D8. Instruments wear the shared palette materials, not baked textures.**
They are swapped in on load: one set of materials, the same steel on every
instrument, nothing extra to download. Baked tissue textures are a question for
the appendectomy phase.

**D9. Environment models get the hero budget (60k triangles).** The brief sets
hero, instrument and prop budgets but none for environment pieces.

**D10. Only scripts that build or change assets are kept** in
`blender/scripts/`, plus the Phase 0 connection check. Read-only probes
(listing exporter options, add-on status) are not.

**D11. No ESLint or Prettier yet.** The brief asks for both; they are new
dependencies, so they wait for a yes.

**D12. Where models may come from (settled by D43).** The brief allows downloaded anatomy
(Z-Anatomy, BodyParts3D: CC BY-SA, whose share-alike terms carry over to
anything adapted from them), Poly Haven (CC0), Sketchfab props with licences
that allow commercial use, and AI-generated props. This project's rule so far:
anatomy is built in code because the click zones are pinned to it, and no
downloaded or AI-generated models. The current rule stands until the user
decides. All of the Blender MCP's asset add-ons are switched off anyway.

**D13. Phase 1 builds the theatre from scripts only.** D12 had no answer when
Phase 1 started, so the simpler option holds: no downloads. Equipment is
modelled by bpy scripts, the app keeps its code-built RoomEnvironment lighting
instead of a Poly Haven HDRI, and the Blender review screenshots use Blender's
bundled `interior.exr` studio light instead of a downloaded theatre HDRI. The
anaesthesia machine, IV pole, electrosurgical unit, suction canister and scrub
sink are in the brief's asset list but not in Phase 1's, so they wait. Light
depth of field waits until there is a loupe mode for it to belong to.

**D14. High quality is for dedicated graphics.** On the target laptop at
1336x914, Medium measured about 17 ms a frame and High about 53 ms: bloom and
the chain around it about 16 ms, ambient occlusion 35 ms at full resolution
and 17 ms at the half resolution it now runs at (fewer samples saved nothing).
High's ambient occlusion also draws the scene again for normals, so High goes
over the 150 draw-call budget; Low and Medium stay under it. Texture resolution
is not a quality lever, because every texture is generated at 256 px.

**D15. Low differs from Medium only in the lamp shadow and the pixel-ratio
cap,** so on a 1x display the two measure the same. The cap is what helps
HiDPI screens and phones.

**D16. The vitals monitor shows fixed resting values and generic traces,
marked DEMO,** until a vitals model drives it (the brief puts that with the
appendectomy).

**D17. Blender review renders stay out of the repo.** The scripts rebuild
every model byte for byte, so the images can be regenerated, and PNGs for every
angle of every asset would bloat the history.

**D18. Open: the instrument steels render close to mirror.** The brushed
roughness map stores absolute roughness and three multiplies it by each
material's `roughness`, giving about 0.05 for `steel` and 0.08 for
`steelDark`. Only the trays changed (`steelSatin`, where the glare was worst).
Changing the other two alters every instrument's look, so it waits for the
user.

**D19. The theatre layout is chosen for the camera views,** not copied from a
reference: a 6.4 x 7 m room with a 3 m ceiling, the monitor at the head end,
the back table to the +x side of the operating table.

## 2026-09-11

**D20. Phase 2 started without answers to the Phase 1 questions,** so the
simpler options hold: the instrument steels stay as they are (D18 stays open),
drill scores go to localStorage like the rest of progress, the phase branches
stay unmerged, and the new action types and the needle's orientation wait for
the procedures that need them.

**D21. Headless builds and reviews while the Blender MCP is down.** The MCP
failed to connect when Phase 2 started, although Blender itself was running
and listening; only the user can reconnect it (/mcp or Settings, Connectors).
Models are built with build.py and reviewed with review.py through
blender-launcher.exe. review.py renders the three checklist angles with EEVEE,
lit by the bundled interior.exr behind a plain grey backdrop. Instruments and
props are scale-checked against a 10 cm ruler instead of the 1.8 m figure,
next to which a 15 cm instrument would be a few pixels tall.

**D22. A hinge is two pivot nodes.** A hinged instrument exports as two
halves, each hanging from an empty at the joint (`jaw_upper` carries the +x
jaw, `jaw_lower` the other), and the manifest's `hingeDegrees` says how far it
opens. The app turns the pivots apart about their local z
(src/scene/articulation.ts). Tray copies are merged into one mesh per material,
since they never open; the held instrument and the drill keep the hinge. The
needle holder no longer carries a needle: the needle becomes its own model,
attached at the `needle_grip` node when suturing arrives.

**D23. The drill asks about the open instruments.** It draws wrong options
from the same category first, never offers a look-alike drawn with the same
mesh, and keeps its record in localStorage. New instruments join the catalogue
together with their models, so two tools never share a stand-in that looks the
same.

**D24. Every open instrument has its own mesh.** The catalogue now holds the
brief's starting set: #10 and #15 scalpels, Metzenbaum, Mayo and suture
scissors, toothed and non-toothed Adson and DeBakey forceps, Babcock forceps,
Kelly and mosquito haemostats, a towel clip, Army-Navy, Richardson and
Weitlaner retractors, the needle holder, a Yankauer suction tip, the cautery
pencil, a skin stapler and gauze. Tool ids stayed as they were (the Yankauer
keeps `suction`), so nothing that names a tool broke. Each has its own mesh key
and Blender model; the code-built stand-ins behind them share builders with
different proportions. The syringes and the sponge stick are not in the
brief's list, so they keep their procedural meshes for now; the two syringes
still share one, and the drill never offers both at once. An entry a
clinician needs to check carries a `todo`.

**D25. Thumb forceps hinge about x.** Their limbs face each other through the
thickness, so they lie flat on the tray and show their broad face in the
drill; the manifest says `hingeAxis: "x"`. Like every hinged instrument they
are modelled shut, so a tray copy shows them closed where real ones rest
sprung a few millimetres apart, which does not show at tray distance.

**D26. The curved needle and the gauze are props.** The needle is about 1.5 cm
across, is never picked up on its own, and would fail the instrument size
check; it attaches at the needle holder's `needle_grip` when suturing arrives.
The gauze is a prop that draws a tool mesh, so props may now carry a
`meshKey`.

**D27. Kits by family.** The ring-handle parts moved out of the needle holder
into `kit_instruments.py`. An asset script names each kit file it needs, beyond
kit.py and kit_shapes.py, on a `# kit: <file>` line, and build.py and review.py
prepend them in that order. Each instrument family keeps its own kit
(`kit_scissors.py` and so on), so a change to one family's kit cannot break
another family's models.

**D28. Coordinates at exactly zero are nudged before export.** Blender's
meshopt export stores positions with the EXPONENTIAL filter, and a vertex
with a component exactly zero gets a coarse shared exponent, landing on a grid
of about half a millimetre. That turned the suture needle's point into a
sawtooth fin in the app, while Blender's own renders of the unexported mesh
looked right. The exporter offers no choice of filter, so `finish()` in
kit.py moves any coordinate within 1e-12 of zero to 1e-7 m, and every model
was rebuilt. Models are therefore checked in the app's asset viewer, which
shows the decoded file, not only in Blender.

**D29. Phase 3 started without answers to the Phase 2 questions,** so the
simpler options hold: the clinical TODOs stay flagged as they are, the
abdominal tray keeps its overflow warning until the appendectomy defines its
own tray, `blender/source/instruments.blend` is not regenerated, and the
earlier open questions (D11, D12, D18, merging) are unchanged.

**D30. The suturing pad is a drill with its own screen, and a bite is a
rigid arc.** Like the instrument drill it replaces the theatre while it runs.
A bite is worked out in the cross-section square to the wound
(`src/engine/suturing/geometry.ts`): the needle's tip follows a circle of the
needle's radius, so where it goes in and at what angle decide both how deep
it goes and where it comes out, as with a real curved needle. Regrasping the
needle part-way, and the wound's edges moving as the stitch is pulled up, are
not modelled. The knot is a timed input of three throws, and the thread is a
Verlet rope (`src/engine/rope.ts`), both in the engine so they are tested
without a browser. The targets are common teaching values held in
`src/data/drills/suturePad.json`, marked `reviewed: false` with `todo` notes
for a clinician, and the screen shows the "Unreviewed content" badge.

**D31. The pad's controls are mouse and keyboard.** Click to choose where the
needle goes in; the scroll wheel or the arrow keys set its angle; the needle is
driven by drawing along its dashed path; Space or a click throws the knot.
The brief puts touch second and asks for remappable keys, so both wait for the
settings and accessibility work in Phase 5. Each knot throw starts a fresh
sweep of the marker, so presses in quick succession cannot all land in one
pass of the window. The phases advance on rendered frames, and a browser
pauses those in a hidden tab, so the pad pauses with it, as a game would.

**D32. A procedure step names instruments, an action and a zone.** The
brief's example step has one `instrument`, a `mechanic`, a path `target` and
`successCriteria` (deviation in mm, depth layer, strokes). On this stack a step
lists the instruments that may do it (a scalpel can open the external oblique
as well as scissors), one of the catalogue's action types, and a zone with an
optional `tolerance` from its centre. Path and depth checks wait for the
mechanics that can measure them. `commonErrors` codes must be one of the five
mistakes the step machine reports (`src/engine/procedure/run.ts`), so feedback
is never written for a mistake that can never happen. Modes are the
`MODE_RULES` objects in `scoring.ts`. Phase 4 started without answers to the
Phase 3 questions, so the simpler options hold: ties use the `suture` action
until the engine has a `ligate` action, prep and draping are not steps, and
the appendectomy's content is `reviewed: false` with a `todo` on every step
whose technique or materials vary between surgeons.

**D33. The vitals are a schematic model.** A step may declare
`bleedMlPerSecond` for the blood welling while it is undone. The loss drives a
rising pulse, a pressure that holds and then falls with a narrowing pulse
pressure, and at larger losses a falling saturation
(`src/engine/procedure/vitals.ts`). The shape is the one taught for
haemorrhage; every figure is marked `TODO(clinical review)`.

**D34. The wound is cut by the skin's material, and layers slide open.** The
torso is one closed capsule, so the appendectomy's opening is an ellipse the
skin's fragment shader discards, with a matching depth material so the lamp
still lights the wound (`src/scene/models/skinOpening.ts`). Below it each
layer of the wall is a pair of flaps that slide apart as it is opened and back
as it is closed, the wound's sides are two bands fitted to the opening, and a
closed cavity sits under the peritoneum (`abdomenWound.ts`). The caecum,
appendix and mesoappendix are stylised shapes, and clamps and ties are small
markers rather than instrument models (`ileocaecum.ts`). Which of these are
shown follows the completed steps through a pure function
(`src/data/procedures/appendectomyStage.ts`). Bleeding is a thin dark film that
deepens a little, never a pool that fills.

**D35. Zones have layers, and only the current one can be picked.** A zone
may carry a `layer` (0 is skin). While a step is under way only zones on its
target's layer can be picked, plus structures to protect one layer deeper,
where a slip lands (`src/data/zones/layers.ts`); and a ray reaches no zone
below the skin unless it passes through the wound's opening. This is simpler
than modelling occlusion by the layers still closed, and it means the student
cannot click through intact tissue. The cost is that a wrong-place mistake can
only be made on the layer the step is working on. The step mechanics stay a
click with the held instrument on a zone, as in Phase 1; drawn incision paths
and dragged retraction would need the depth and path checks D32 leaves out.

**D36. How the appendectomy screen plays, and how it is tested.** A click
carries no action of its own, so the held instrument does what the step asks
if it can, and otherwise the first action it has; with every step's
instruments able to do its action (checked in `tests/procedures.test.ts`), a
wrong-action mistake cannot yet be made by clicking. A step's question comes
straight after the step is done. Learn highlights the target, snaps to it and
names instruments and zones; Practice names them but highlights nothing;
Assessment names nothing, says only whether a step was accepted, and records
quiz answers without revealing them. The time counts in every mode but is
shown only in the timed ones. The brief asks for a Playwright test; adding
Playwright is a new dependency, so it waits for the user's answer. In its
place `tests/appendectomyPlaythrough.test.ts` plays the whole procedure through
the engine in all three modes, and the browser run is checked by hand through
the dev console handle (`__trainer.procedure`) for each milestone.

**D37. A pick's offset is how close the ray passes to the zone's centre, and
every step's target is checked for overlaps.** The offset used to be the hit
point's distance from the centre, which on a sphere is its radius wherever it
is aimed, so Practice and Assessment refused every skin incision. Zones
overlap and priority decides, so a zone laid over a target silently takes its
clicks: the browser run found the appendicular artery and the appendix body
both covering the mesoappendix. The artery lost its zone (no step targets it;
it is still drawn), the body's zone moved onto the line from base to tip, and
`tests/appendectomyTargets.test.ts` now aims at every step's target in turn
and fails if anything else is picked. The in-app browser's clicks do not
reach the canvas as pointer events, so the browser runs dispatch pointer
events from the page instead, through the same handlers.

**D38. Progression is a local profile, and Phase 5 leaves out what needs a
server.** The brief's Phase 5 has sign-up, a Supabase profile, an AI mentor
behind `/api/mentor` and a Vercel preview. This stack has no backend (D1), a
mentor needs a server holding an API key, and a deploy publishes the app
under someone's account, so none of them is built without the user's answer.
Instead the profile (`src/engine/progression.ts`, stored by
`src/store/profile.ts`) belongs to this browser. Experience comes from
finishing runs (`XP_AWARDS` in `scoring.ts`); each level asks 100 more than the
one before; the brief's five rank titles start at levels 1, 3, 6, 10 and 15
and describe progress through the simulator, not competence. With one
procedure, "unlockable procedures" becomes an unlockable mode: Assessment
opens once the procedure has been finished in Learn or Practice. Badges
(`src/engine/badges.ts`) only reward what the simulator measures, so the
brief's "Zero Breach", about sterile technique, is left out until sterility
is modelled; "Perfect Closure" is a suturing pad score of 90 or more.

**D39. Phase 5's screens and settings.** The app now opens on a home screen
instead of the Phase 1 model dropdown: rank and experience, the recommended
next activity, the drill, the pad, the appendectomy by mode, the free theatre
(where the dropdown still shows), badges and recent runs. Settings apply and
save as soon as they change. The brief's Clinical content level, with
realistic blood, is not offered, because CLAUDE.md keeps blood subtle and
non-graphic: Reduced is the existing look, and Schematic colours tissues flat
in atlas convention and hides the blood. Colourblind-safe colours swap the
green and red for the Okabe-Ito blue and orange; every right and wrong already
carries a symbol, shape or words as well. Reduced motion follows the
operating system until the player chooses, snaps the camera presets and the
wound, and stops CSS transitions; the knot marker still moves, since timing it
is the task. The instrument slots, hint and pause can be rebound; Enter,
Space and Tab cannot, because the drills and dialogs use them. The first
launch shows the disclaimer as a dialog to acknowledge, and the pause menu
(Esc by default) repeats it. The top bar now sits above every screen: until
now a drill, the pad or the procedure covered it, and the disclaimer with it.
The procedure screen's rules of play moved into `src/ui/procedureSession.ts`,
which has no DOM, so pausing, hints and questions are tested in Node.

**D40. Sound is a handful of synthesised cues, each with a caption.** The
brief asks for sound cues, a cautery sizzle and subtitles for all audio. The
cues are tones made with the Web Audio API from a table
(`src/ui/soundCues.ts`), so there are no audio files and no dependency:
instrument picked up, step done, not accepted, a structure to protect, run
complete, badge earned, new level. With captions on, each also appears in
words at the foot of the screen. Nothing can only be heard: every cue repeats
what the panel already says. Assessment sounds every refusal the same, since
it names no mistake. There is no sizzle, because cautery is still a click
rather than a held mechanic, and no monitor beep, which would sound all
through a procedure; both can come with those mechanics. The suturing pad
sounds only the end of a run for now. Vibration is left out, since no input
here is a gamepad.

**D41. The anatomy explorer uses the appendectomy's abdomen.** The brief's
explorer is a free 3D viewer with a layer slider, labels and a quiz mode. The
open abdomen is the one model with layers, so the explorer shows it: the
slider opens the wall with the same wound the procedure draws (`layerStage`),
each layer's structures are listed and are named and highlighted under the
pointer, and the quiz (`src/engine/anatomyQuiz.ts`) names structures to find
with a click, asking only about those that share a layer with another. The
layer names sit with the zones (`layerNames`). Its layers and organs are the
procedure's stylised ones, so it carries the "Unreviewed content" badge and
says it is schematic. Quiz results do not count toward experience or badges
yet.

**D42. Deep steps use a loupe camera, and reach is tested from the student's
view.** A Phase 5 browser run found that from the "close" camera the
appendectomy left the student with when the caecum was delivered, the
mesoappendix, the target of four steps, could not be clicked at all, and the
caecum and appendix only over slivers: from that slant, rays to them cross the
skin outside the opening (D35). The Phase 4 checks aimed from straight above
each target, which missed it. A `loupe` preset now looks almost straight down
into the wound; the delivery step moves to it, and the anatomy explorer
switches to it once the wound is open (`woundCamera`).
`tests/woundReach.test.ts` aims across a grid of the whole view, from the
camera in use at each step and from the explorer's camera for each structure
it asks about, and fails any target covering less than 0.2% of the view. To
pass it, the drawn appendix tip moved 3 mm along and 6 mm across toward the
middle of the opening, and its zone and the body's zone moved with it; it had
sat under the end of the incision. Orbiting the camera away can still hide a
target, as it would in a real wound.

**D43. Sourcing settled: a realistic body from MPFB, organs from
BodyParts3D.** On 2026-09-13 the user asked for a realistic human body and
hyper-real procedures, and chose: the body from MPFB (the MakeHuman plugin
for Blender; its output is CC0), organs from BodyParts3D (CC BY-SA 2.1 JP:
attribution, and share-alike on the organ models derived from them), an
opt-in Clinical content level with realistic blood behind a confirmation
while Reduced stays the default, the laceration repair as the first
hyper-real procedure, and the 60 fps integrated-graphics target kept, with
the costlier effects on High. This closes D12: downloaded anatomy is allowed
from these two sources. AI-generated and Sketchfab bodies stay out, because
their anatomy cannot be verified. Every downloaded file gets a row in
`assets/licenses.md` with its attribution, and share-alike files are marked
as such. Skin textures stay procedural: no photographic human skin texture
with a clear licence is known.

**D44. Everything on the patient is pinned to the body's landmarks, and reads
the skin through a height field.** The body build writes the landmarks it
found (umbilicus, the anterior superior iliac spines, McBurney's point, the
right arm's joints and the mid-forearm skin) to `src/data/bodyLandmarks.json`,
and the organ build writes where the organs ended up to
`organLandmarks.json`. The abdominal and forearm zones, the wound frame, the
cameras' field centres and the laceration are all computed from those files
(`src/data/zones/orient.ts` does the sums without Three.js), so rebuilding
the body moves everything with it, and `tests/bodyLandmarks.test.ts` fails a
build that lands somewhere unexpected. The skin's shape comes from a height
field rasterised from the body mesh once at load (`bodySurface.ts`): the
drapes now lie on the table and ride over the body and the arm, the wound's
rim sits on the real skin, and the capsule formula survives only as the
fallback for a body that did not load. The organs have no code-built
fallback: without their model the wound shows its cavity. The body wears its
own copy of the skin material (`skinBody`) because its UV atlas needs the
pore map repeated about 90 times where the capsules needed 4.

**D45. The organs are turned to the incision and the ileum is packed off.**
The scan's appendix points medially while the gridiron opening runs
diagonally, so laid as scanned it crossed a 5 cm wide opening and could not
be reached through it. The organ build turns the set about the appendix base
to lay the appendix along the incision, sets the base 1.5 cm back along it
and 7.5 cm below the skin, and moves the terminal ileum 3.5 cm across the
incision away from the field and 8 mm down, as a surgeon packs it away with
a swab; delivering the caecum lifts the caecum and appendix and leaves the
ileum where it is. The build records what of each organ lies within the
opening, and the caecum and small-bowel zones are pinned to that. The
explorer's quiz no longer asks for a structure to protect, since the packed
ileum shows only at the opening's edge. All of it is stylised and flagged
for clinical review.
