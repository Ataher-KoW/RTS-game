# Assets

This directory is for lightweight source assets and manifests that should be
tracked in Git.

`assets/cache/` is created by `npm run setup` and is ignored. Downloaded models,
textures, audio, and fetch logs should stay there unless the project later moves
to a deliberate Git LFS workflow.

Optional environment variables:

- `SKETCHFAB_TOKEN` enables Sketchfab API search attempts.
- `FREESOUND_TOKEN` enables Freesound CC0 preview download attempts.

When no directly loadable asset is cached, the game uses colored placeholder
geometry and procedural fallback SFX.
