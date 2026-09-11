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

**D12. Open: where models may come from.** The brief allows downloaded anatomy
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
