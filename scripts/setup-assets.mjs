import { access, appendFile, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, 'assets', 'cache');
const publicCacheDir = path.join(root, 'public', 'asset-cache');
const logPath = path.join(cacheDir, 'fetch-log.txt');
const manifestPath = path.join(cacheDir, 'manifest.json');
const publicManifestPath = path.join(publicCacheDir, 'manifest.json');
const factionsDir = path.join(root, 'src', 'data', 'factions');

const SKETCHFAB_TOKEN = process.env.SKETCHFAB_TOKEN;
const FREESOUND_TOKEN = process.env.FREESOUND_TOKEN;

await mkdir(cacheDir, { recursive: true });
await mkdir(publicCacheDir, { recursive: true });

const manifest = await readManifest();
const assetMap = new Map((manifest.assets || []).map((asset) => [asset.id, asset]));
const targets = await collectAssetTargets();
const audioTargets = [
  { id: 'sfx-weapon-fire', keyword: 'sci fi laser weapon fire' },
  { id: 'sfx-explosion', keyword: 'small sci fi explosion' },
  { id: 'sfx-build-complete', keyword: 'robot construction complete chime' },
  { id: 'sfx-unit-select', keyword: 'robot unit select beep' },
  { id: 'sfx-move-confirm', keyword: 'sci fi command confirm' },
  { id: 'sfx-veteran', keyword: 'short rank up chime' },
];

await log(`setup start: ${targets.length} model targets, ${audioTargets.length} audio targets`);

for (const target of targets) {
  const existing = assetMap.get(target.id);
  if (existing?.status === 'ready' && existing.cachePath && (await exists(path.join(root, existing.cachePath)))) {
    await log(`cache hit model ${target.id}: ${existing.cachePath}`);
    continue;
  }
  const asset = await resolveModelTarget(target);
  assetMap.set(target.id, asset);
}

for (const target of audioTargets) {
  const existing = assetMap.get(target.id);
  if (existing?.status === 'ready' && existing.cachePath && (await exists(path.join(root, existing.cachePath)))) {
    await log(`cache hit audio ${target.id}: ${existing.cachePath}`);
    continue;
  }
  const asset = await resolveAudioTarget(target);
  assetMap.set(target.id, asset);
}

const nextManifest = {
  generatedAt: new Date().toISOString(),
  notes:
    'Ready assets have publicPath values loadable by Vite. Placeholder entries are expected when provider API keys or direct GLB/audio downloads are unavailable.',
  assets: [...assetMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
await copyFile(manifestPath, publicManifestPath);
await log(`setup complete: manifest wrote ${nextManifest.assets.length} entries`);

console.log(`Asset cache ready: ${cacheDir}`);
console.log(`Manifest mirrored to: ${publicManifestPath}`);

async function collectAssetTargets() {
  const files = ['synthekon.json', 'vorreth.json', 'ironveil.json'];
  const targets = [];
  for (const file of files) {
    const faction = JSON.parse(await readFile(path.join(factionsDir, file), 'utf8'));
    for (const unit of faction.units) {
      targets.push({
        id: unit.id,
        kind: 'unit',
        faction: faction.id,
        keyword: unit.assetKeyword,
      });
    }
    for (const building of faction.buildings) {
      targets.push({
        id: building.id,
        kind: 'building',
        faction: faction.id,
        keyword: building.assetKeyword,
      });
    }
    targets.push({
      id: `${faction.id}-tunnel-entrance`,
      kind: 'building',
      faction: faction.id,
      keyword: `${faction.name} underground tunnel entrance sci fi glb`,
    });
  }
  return targets;
}

async function resolveModelTarget(target) {
  const providers = [
    () => trySketchfab(target),
    () => tryPolyPizza(target),
    () => tryOpenGameArt(target),
  ];

  for (const provider of providers) {
    const result = await provider();
    if (result?.status === 'ready') {
      return result;
    }
  }

  await log(`placeholder model ${target.id}: no directly loadable cached asset found`);
  return {
    ...target,
    status: 'placeholder',
    provider: 'placeholder',
    attempts: ['sketchfab', 'poly-pizza', 'open-game-art'],
  };
}

async function trySketchfab(target) {
  const searchUrl = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=${encodeURIComponent(
    target.keyword,
  )}&licenses=by,by-sa,by-nd,cc0`;
  if (!SKETCHFAB_TOKEN) {
    await log(`skip Sketchfab ${target.id}: SKETCHFAB_TOKEN missing`);
    return null;
  }

  try {
    await log(`fetch Sketchfab search ${target.id}: ${searchUrl}`);
    const search = await fetchJson(searchUrl, {
      Authorization: `Token ${SKETCHFAB_TOKEN}`,
    });
    const model = search.results?.[0];
    if (!model?.uid) {
      await log(`miss Sketchfab ${target.id}: no result`);
      return null;
    }
    const downloadUrl = `https://api.sketchfab.com/v3/models/${model.uid}/download`;
    await log(`fetch Sketchfab download ${target.id}: ${downloadUrl}`);
    const download = await fetchJson(downloadUrl, {
      Authorization: `Token ${SKETCHFAB_TOKEN}`,
    });
    const gltfUrl = download.gltf?.url;
    if (!gltfUrl) {
      await log(`miss Sketchfab ${target.id}: no gltf URL`);
      return null;
    }
    await log(`Sketchfab ${target.id}: downloadable archive found but zip extraction is not enabled yet`);
  } catch (error) {
    await log(`fail Sketchfab ${target.id}: ${error.message}`);
  }
  return null;
}

async function tryPolyPizza(target) {
  const searchUrl = `https://api.poly.pizza/v1/search/${encodeURIComponent(target.keyword)}`;
  try {
    await log(`fetch Poly Pizza search ${target.id}: ${searchUrl}`);
    const search = await fetchJson(searchUrl);
    const candidates = search.results || search.items || [];
    const candidate = candidates.find((item) => directModelUrl(item));
    const url = candidate ? directModelUrl(candidate) : null;
    if (!url) {
      await log(`miss Poly Pizza ${target.id}: no direct glb/gltf URL`);
      return null;
    }
    return await downloadDirectAsset(target, url, 'poly-pizza');
  } catch (error) {
    await log(`fail Poly Pizza ${target.id}: ${error.message}`);
    return null;
  }
}

async function tryOpenGameArt(target) {
  const searchUrl = `https://opengameart.org/art-search-advanced?keys=${encodeURIComponent(target.keyword)}`;
  await log(`fallback OpenGameArt search ${target.id}: ${searchUrl}`);
  await log(`miss OpenGameArt ${target.id}: manual license/file selection required`);
  return null;
}

async function resolveAudioTarget(target) {
  if (!FREESOUND_TOKEN) {
    await log(`skip Freesound ${target.id}: FREESOUND_TOKEN missing`);
    return {
      ...target,
      kind: 'audio',
      status: 'placeholder',
      provider: 'procedural-audio',
    };
  }

  const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(
    target.keyword,
  )}&filter=license:%22Creative Commons 0%22&fields=id,name,previews,license`;
  try {
    await log(`fetch Freesound search ${target.id}: ${searchUrl}`);
    const search = await fetchJson(searchUrl, {
      Authorization: `Token ${FREESOUND_TOKEN}`,
    });
    const result = search.results?.find((item) => item.previews?.['preview-hq-mp3']);
    if (!result) {
      await log(`miss Freesound ${target.id}: no CC0 preview result`);
      return {
        ...target,
        kind: 'audio',
        status: 'placeholder',
        provider: 'procedural-audio',
      };
    }
    return await downloadDirectAsset(
      { ...target, kind: 'audio' },
      result.previews['preview-hq-mp3'],
      'freesound',
      '.mp3',
    );
  } catch (error) {
    await log(`fail Freesound ${target.id}: ${error.message}`);
    return {
      ...target,
      kind: 'audio',
      status: 'placeholder',
      provider: 'procedural-audio',
    };
  }
}

async function downloadDirectAsset(target, url, provider, forcedExtension = null) {
  const extension = forcedExtension || path.extname(new URL(url).pathname).toLowerCase();
  if (!['.glb', '.gltf', '.mp3', '.ogg', '.wav'].includes(extension)) {
    await log(`miss ${provider} ${target.id}: unsupported extension ${extension || 'none'}`);
    return null;
  }
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const filename = `${target.id}-${hash}${extension}`;
  const cachePath = path.join(cacheDir, filename);
  const publicPath = path.join(publicCacheDir, filename);
  const relativeCache = path.relative(root, cachePath).replaceAll(path.sep, '/');
  const relativePublic = `/asset-cache/${filename}`;

  if (!(await exists(cachePath))) {
    await log(`download ${provider} ${target.id}: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${provider} download HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(cachePath, buffer);
  } else {
    await log(`cache hit ${provider} ${target.id}: ${relativeCache}`);
  }

  await copyFile(cachePath, publicPath);
  await log(`ready ${provider} ${target.id}: ${relativeCache}`);
  return {
    ...target,
    status: 'ready',
    provider,
    sourceUrl: url,
    cachePath: relativeCache,
    publicPath: relativePublic,
  };
}

function directModelUrl(item) {
  const candidates = [
    item?.Download,
    item?.download,
    item?.downloadUrl,
    item?.modelUrl,
    item?.url,
    item?.files?.glb,
    item?.files?.gltf,
  ].filter(Boolean);
  return candidates.find((url) => /\.(glb|gltf)(\?|$)/i.test(url));
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return { assets: [] };
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function log(message) {
  await appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`);
}
