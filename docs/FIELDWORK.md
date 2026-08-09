# FIELDWORK: Breach Run

FIELDWORK is Matter Field's integrated dogfood surface. **Breach Run** puts the
four example families into one fixed-step 3D mission instead of presenting
them only as isolated technical labs.

The game has two deliberately different GPU paths:

- WebGPU consumes the precompiled `matter-field/typegpu/three` integration.
  Those TypeGPU functions are separately maintained ports, checked against the
  canonical adapter fields; they are not generated from one shared AST.
- WebGL2 consumes the native `makeTslAdapter` compatibility materialization,
  which does evaluate the adapter-authored expression tree directly.

In both paths, the CPU owns gameplay at 60 Hz. Dunes provide contact height and
dual-number slope, swell provides four-probe buoyancy, wind applies force, and
the serpent spine/radius provide proximity and collision. GPU tracers and
surfaces are visual consumers. Gameplay performs zero per-frame GPU readbacks.

That is an architectural statement, not a claim that continuous CPU fields,
GPU arithmetic, tessellated triangles, and rasterized pixels are identical.
Those error surfaces remain measured and reported separately.

## Asset capability record

Credential probe on 2026-08-09:

```text
TRIPO_API_KEY=
GEMINI_API_KEY=SET
ELEVENLABS_API_KEY=SET
```

The absent Tripo credential is why the skiff is a deliberately modeled
procedural Three.js asset rather than an unverified generated GLB. No Tripo task
was attempted and no task ID exists.

### Fieldwork insignia

- Provider: Gemini image API through the configured project credential.
- Model: `gemini-3-pro-image-preview`.
- Runtime file: `site/fieldwork/assets/ui/fieldwork-sigil.webp` (1K source,
  optimized to WebP for the site).
- Source PNG: local ignored artifact under `artifacts/fieldwork-source/`.
- Purpose: briefing identity, social preview, and the visual anchor for the
  Fieldwork sub-brand.
- Prompt:

  > Create a crisp vector-like field survey insignia for a science-fiction
  > expedition game. Concentric topographic contour rings intersected by one
  > precise datum line and one orbiting measurement point, asymmetrical
  > editorial geometry, bone white, acid chartreuse, oxidized teal, and burnt
  > coral on a flat very dark green background. High contrast, screen-print
  > texture, centered square composition, no words, no letters, no numbers, no
  > mockup, no border.

Google's current Gemini API terms state that Google does not claim ownership
over generated content. The project owner remains responsible for review and
use of the output.

## Audio matrix

The public release synthesizes its entire sound layer at runtime with the Web
Audio API. It contains no downloadable sound-effect files and performs no
network audio fetches.

| Runtime voice | Synthesis | Role |
|---|---|---|
| field ambience | deterministic noise, band-pass filter, low sine hum | wind and field-station bed |
| skimmer engine | triangle/saw oscillators with speed-driven pitch and filtering | vehicle motion |
| confirm/toggle | short shaped oscillator pairs and a filtered click | start, retry, pause, fault, mute |
| failure | descending triangle/sine envelope | mission failure |
| checkpoint | staggered resonant tones | core recovery |
| scan | rising band-pass noise and sine sweep | waypoint and field pulse |
| impact | low-pass noise, sub drop, high transient | breach collision |
| completion | three staggered resolving tones | pad delivery |

Audio begins only after a user gesture, pauses without stacking loops, follows
speed/wind/danger telemetry, and exposes a mute control. The deterministic noise
generator and all synthesis code live in `site/fieldwork/audio.js`.

### Prototype audio provenance

Nine sound-design prototypes were generated with ElevenLabs
`eleven_text_to_sound_v2`. On August 9, 2026, the repository owner confirmed
that generation occurred under a paid, non-Beta plan. They are intentionally
not distributed here: ElevenLabs'
[prohibited-use policy](https://elevenlabs.io/use-policy) restricts distributing
Sound Effects output as standalone files or sample collections. The prototypes
remain local research artifacts; the shipped game uses only project-authored
procedural Web Audio.

## Acceptance checklist

- [x] Core can be recovered, delivered, failed, and retried without reload.
- [x] Keyboard, click/waypoint, right-drag orbit, wheel zoom, one-finger tap,
      two-finger orbit, and pinch zoom all work without gesture cross-fire.
- [x] WebGPU reports the TypeGPU/Three materialization; forced WebGL2 reports
      the native TSL materialization.
- [x] `render_game_to_text()` exposes objective, craft, authority, field,
      renderer, and camera state.
- [x] `advanceTime(ms)` advances the fixed-step simulation deterministically.
- [x] Pause/restart does not stack ambience or engine loops.
- [x] Desktop and synthetic-mobile screenshots show readable HUD, objective, craft,
      terrain/water separation, wind tracers, and the breach body.
- [x] No console errors, device-loss path is user-visible, and all GPU values
      used for public evidence fail closed on non-finite data.
- [x] Public audio is project-authored procedural Web Audio; no standalone
      ElevenLabs sound-effect files are distributed.

The August 9 application QA used a physical RTX 3070 for the WebGPU /
TypeGPU path and a forced WebGL2 browser path for fallback behavior. The local
machine was active, so these runs establish functional integration only—not
performance. Mobile controls were exercised with a 390 × 844 touch-emulated
browser viewport; a physical-phone feel check remains useful but is not being
represented as completed hardware coverage.
