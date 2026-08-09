# FIELDWORK runtime assets

Provenance and release conditions are documented in
[`docs/FIELDWORK.md`](../../../docs/FIELDWORK.md).
Provider model identifiers, generation timestamps, byte lengths, and SHA-256
digests are recorded in [`manifest.json`](./manifest.json). Provider request
IDs were not retained by the local generation helpers, and the manifest says
so explicitly rather than inventing them.

- `ui/fieldwork-sigil.webp` was generated with the Gemini image API and
  reviewed/optimized locally.
- The public game contains no audio asset files. Its ambience, engine, UI, and
  gameplay cues are synthesized at runtime by `../audio.js` with the Web Audio
  API. ElevenLabs prototypes from the sound-design pass are retained only as
  ignored local research artifacts and are not distributed.

No API credential is present in these files or in the browser bundle.
