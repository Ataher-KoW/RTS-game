# AT Strategy

AT Strategy is a sci-fi RTS prototype built with Three.js, Vite, and Electron.

This repository is the source-controlled backup for the project. Source files,
configuration, scripts, and lightweight placeholder assets belong in Git.
Downloaded runtime assets are cached locally and ignored by default.

## Development

```sh
npm install
npm run dev
```

## Desktop Shell

```sh
npm run dev:electron
```

## Asset Cache Policy

Generated or downloaded files under `assets/cache/` are intentionally ignored.
The project should remain playable with placeholders when external assets are
missing.
