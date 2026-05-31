import './styles.css';
import { AI_DIFFICULTIES, MAPS, SUPERWEAPONS, getAllFactionSummaries } from './game/GameData.js';
import { MultiplayerClient } from './game/MultiplayerClient.js';
import { SkirmishGame } from './game/SkirmishGame.js';

const app = document.querySelector('#app');
const factions = getAllFactionSummaries();
const difficulties = Object.values(AI_DIFFICULTIES);
const defaultSettings = {
  graphicsQuality: 'high',
  musicVolume: 0.42,
  sfxVolume: 0.78,
  fullscreen: false,
  resolution: '1280x800',
};

app.innerHTML = `
  <main class="game-shell">
    <section class="setup-panel" id="setupPanel">
      <div>
        <img class="brand-logo" src="/logo.svg" alt="AT Strategy logo">
        <span class="eyebrow">Skirmish Setup</span>
        <strong>AT Strategy</strong>
        <label>Player Faction<select id="playerFaction"></select></label>
        <label>Enemy Faction<select id="aiFaction"></select></label>
        <label>Map<select id="mapSelect"></select></label>
        <label>AI Difficulty<select id="difficultySelect"></select></label>
        <button type="button" id="startMatch">Start Skirmish</button>
      </div>
    </section>
    <section class="utility-bar" aria-label="Game menu">
      <button type="button" id="multiplayerButton"><span>Multiplayer</span></button>
      <button type="button" id="settingsButton"><span>Settings</span></button>
      <button type="button" id="saveButton"><span>Save</span></button>
      <button type="button" id="loadButton"><span>Load</span></button>
    </section>
    <section class="modal-panel" id="settingsPanel" hidden>
      <div>
        <span class="eyebrow">Settings</span>
        <strong>Video & Audio</strong>
        <label>Resolution<select id="resolutionSelect">
          <option value="1280x800">1280 x 800</option>
          <option value="1600x900">1600 x 900</option>
          <option value="1920x1080">1920 x 1080</option>
        </select></label>
        <label>Graphics<select id="graphicsQuality">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select></label>
        <label class="checkbox-row"><input type="checkbox" id="fullscreenToggle"> Fullscreen</label>
        <label>Music Volume<input type="range" min="0" max="1" step="0.01" id="musicVolume"></label>
        <label>SFX Volume<input type="range" min="0" max="1" step="0.01" id="sfxVolume"></label>
        <div class="keybinding-list">
          <span>A + left-click: attack move</span>
          <span>Right-click: move / attack / rally</span>
          <span>Shift-click: add selection</span>
          <span>F3: debug overlay</span>
        </div>
        <button type="button" id="closeSettings">Close</button>
      </div>
    </section>
    <section class="modal-panel multiplayer-panel" id="multiplayerPanel" hidden>
      <div>
        <span class="eyebrow">Multiplayer Lobby</span>
        <strong>LAN / Online</strong>
        <label>Commander Name<input id="mpName" value="Commander"></label>
        <label>Faction<select id="mpFaction"></select></label>
        <label>Color<input id="mpColor" type="color" value="#38bdf8"></label>
        <label>Format<select id="mpFormat">
          <option value="1v1">1v1</option>
          <option value="2v2">2v2</option>
          <option value="ffa">FFA up to 4</option>
        </select></label>
        <label>Map<select id="mpMap"></select></label>
        <div class="button-row">
          <button type="button" id="hostLanButton"><span>Host LAN</span></button>
          <button type="button" id="startNetworkMatch"><span>Start Match</span></button>
        </div>
        <label>Server IP / Hostname<input id="joinAddress" placeholder="127.0.0.1:8787"></label>
        <label>Room ID<input id="joinRoomId" placeholder="room-1"></label>
        <button type="button" id="joinButton"><span>Join Server</span></button>
        <pre id="multiplayerStatus">Offline</pre>
        <button type="button" id="closeMultiplayer">Close</button>
      </div>
    </section>
    <section class="resource-bar" aria-label="Resources">
      <div><span>Metal</span><strong id="metal">0</strong><small id="metalRate">+0/s</small></div>
      <div><span>Energy</span><strong id="energy">0</strong><small id="energyRate">+0/s</small></div>
      <div><span>Dark Matter</span><strong id="darkMatter">0</strong><small id="darkMatterRate">+0/s</small></div>
    </section>
    <section class="superweapon-bar" id="superweaponBar" hidden>
      <span>Superweapon Charge</span>
      <div><i id="superweaponCharge"></i></div>
    </section>
    <section class="superweapon-panel" id="superweaponPanel" hidden></section>
    <section class="viewport" id="viewport" aria-label="AT Strategy battlefield"></section>
    <div class="drag-box" id="dragBox" hidden></div>
    <section class="command-bar" aria-label="Command panel">
      <div class="minimap" id="minimap"></div>
      <div class="selection-panel">
        <div class="panel-heading">
          <span class="eyebrow" id="cursorMode">Synthekon Skirmish</span>
          <strong id="selectionTitle">No selection</strong>
        </div>
        <div class="selection-list" id="selectionList"></div>
      </div>
      <div class="action-panel">
        <div class="queue-strip" id="queueStrip"></div>
        <div class="ability-grid" id="actionGrid"></div>
      </div>
    </section>
    <section class="debug-overlay" id="debugOverlay" hidden></section>
    <section class="toast-log" id="toastLog"></section>
    <section class="match-over" id="matchOver" hidden>
      <div>
        <span id="matchResult"></span>
        <strong id="matchDuration"></strong>
        <button type="button" id="restartButton">Restart</button>
      </div>
    </section>
  </main>
`;

const viewport = document.querySelector('#viewport');
const dragBox = document.querySelector('#dragBox');
const debugOverlay = document.querySelector('#debugOverlay');
const actionGrid = document.querySelector('#actionGrid');
const queueStrip = document.querySelector('#queueStrip');
const minimap = document.querySelector('#minimap');
const selectionList = document.querySelector('#selectionList');
const toastLog = document.querySelector('#toastLog');
const setupPanel = document.querySelector('#setupPanel');
const superweaponPanel = document.querySelector('#superweaponPanel');
const settingsPanel = document.querySelector('#settingsPanel');
const multiplayerPanel = document.querySelector('#multiplayerPanel');
const multiplayerStatus = document.querySelector('#multiplayerStatus');
let debugVisible = true;
let latestState = null;
let game = null;
let settings = await loadSettings();
const multiplayer = new MultiplayerClient({
  onEvent: handleMultiplayerEvent,
  onStatus: renderMultiplayerStatus,
});

populateSelect('#playerFaction', factions, 'synthekon');
populateSelect('#aiFaction', factions, 'synthekon');
populateSelect('#mapSelect', MAPS, 'fractured-frontier');
populateSelect('#difficultySelect', difficulties, 'easy');
populateSelect('#mpFaction', factions, 'synthekon');
populateSelect('#mpMap', MAPS, 'fractured-frontier');
applySettingsToControls(settings);

await startGame({ hideSetup: false });

document.querySelector('#startMatch').addEventListener('click', async () => {
  setupPanel.hidden = true;
  await startGame({
    playerFactionId: document.querySelector('#playerFaction').value,
    aiFactionId: document.querySelector('#aiFaction').value,
    mapId: document.querySelector('#mapSelect').value,
    difficultyId: document.querySelector('#difficultySelect').value,
    hideSetup: true,
  });
});

actionGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || !game) {
    return;
  }
  if (button.dataset.build) {
    game.beginPlacement(button.dataset.build);
  }
  if (button.dataset.train) {
    game.queueUnit(button.dataset.train);
  }
  if (button.dataset.ability) {
    game.useSelectedAbility(button.dataset.ability);
  }
});

superweaponPanel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.dataset.superweapon) {
    game.beginSuperweapon(button.dataset.superweapon);
  }
});

document.querySelector('#restartButton').addEventListener('click', () => {
  window.location.reload();
});

document.querySelector('#settingsButton').addEventListener('click', () => {
  settingsPanel.hidden = false;
});

document.querySelector('#closeSettings').addEventListener('click', () => {
  settingsPanel.hidden = true;
});

document.querySelector('#multiplayerButton').addEventListener('click', () => {
  multiplayerPanel.hidden = false;
  renderMultiplayerStatus(multiplayer.getState());
});

document.querySelector('#closeMultiplayer').addEventListener('click', () => {
  multiplayerPanel.hidden = true;
});

for (const id of ['resolutionSelect', 'graphicsQuality', 'fullscreenToggle', 'musicVolume', 'sfxVolume']) {
  document.querySelector(`#${id}`).addEventListener('input', async () => {
    settings = readSettingsFromControls();
    game?.setSettings(settings);
    if (settings.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else if (!settings.fullscreen && document.fullscreenElement) {
      document.exitFullscreen?.();
    }
    await saveSettings(settings);
  });
}

document.querySelector('#saveButton').addEventListener('click', () => manualSave());
document.querySelector('#loadButton').addEventListener('click', () => loadLatestSave());

document.querySelector('#hostLanButton').addEventListener('click', async () => {
  try {
    const info = await multiplayer.hostLocal({
      format: document.querySelector('#mpFormat').value,
      mapId: document.querySelector('#mpMap').value,
      player: multiplayerPlayer(),
    });
    renderMultiplayerStatus({ ...multiplayer.getState(), status: `Hosting on ${info.lanAddresses[0] || `ws://127.0.0.1:${info.port}`}` });
  } catch (error) {
    renderMultiplayerStatus({ status: error.message });
  }
});

document.querySelector('#joinButton').addEventListener('click', async () => {
  try {
    const url = normalizeWsUrl(document.querySelector('#joinAddress').value);
    await multiplayer.connect(url);
    const roomId = document.querySelector('#joinRoomId').value.trim();
    if (roomId) {
      multiplayer.joinRoom(roomId, multiplayerPlayer());
    } else {
      multiplayer.createOnlineRoom({
        format: document.querySelector('#mpFormat').value,
        mapId: document.querySelector('#mpMap').value,
        player: multiplayerPlayer(),
      });
    }
  } catch (error) {
    renderMultiplayerStatus({ status: error.message });
  }
});

document.querySelector('#startNetworkMatch').addEventListener('click', async () => {
  multiplayer.startMatch();
  multiplayerPanel.hidden = true;
  setupPanel.hidden = true;
  await startGame({
    playerFactionId: document.querySelector('#mpFaction').value,
    aiFactionId: document.querySelector('#aiFaction').value,
    mapId: document.querySelector('#mpMap').value,
    difficultyId: 'medium',
    hideSetup: true,
  });
});

function frame() {
  if (game) {
    game.update(Math.min(game.clock.getDelta(), 0.05));
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

async function startGame(options = {}) {
  game?.dispose();
  viewport.replaceChildren();
  game = new SkirmishGame(viewport, {
    onState: renderState,
    onToggleDebug: () => {
      debugVisible = !debugVisible;
      debugOverlay.hidden = !debugVisible;
    },
    onDragBox: (rect) => {
      if (!rect) {
        dragBox.hidden = true;
        return;
      }
      dragBox.hidden = false;
      dragBox.style.left = `${rect.left}px`;
      dragBox.style.top = `${rect.top}px`;
      dragBox.style.width = `${rect.width}px`;
      dragBox.style.height = `${rect.height}px`;
    },
    onGameOver: ({ result, elapsed }) => {
      document.querySelector('#matchOver').hidden = false;
      document.querySelector('#matchResult').textContent = result === 'victory' ? 'Victory' : 'Defeat';
      document.querySelector('#matchDuration').textContent = `Match duration ${formatTime(elapsed)}`;
    },
    onAutosave: autosave,
  }, { ...options, settings });
  await game.init();
  game.setMultiplayerState(multiplayer.getState());
  setupPanel.hidden = Boolean(options.hideSetup);
  if (window.atStrategyGame) {
    window.atStrategyGame.current = game;
  }
}

function renderState(state) {
  latestState = state;
  if (multiplayer.connected && multiplayer.isHost && game) {
    multiplayer.broadcastState({ sentAt: Date.now(), snapshot: game.getSnapshot() }, Math.floor(state.elapsed * 20));
  }
  game?.setMultiplayerState(multiplayer.getState());
  renderResources(state);
  renderSelection(state);
  renderActions(state);
  renderSuperweapons(state);
  renderMinimap(state);
  renderDebug(state);
  renderWarnings(state);
}

function renderResources(state) {
  setResource('metal', state.resources.metal, state.income.metal);
  setResource('energy', state.resources.energy, state.income.energy);
  setResource('darkMatter', state.resources.darkMatter, state.income.darkMatter);

  const superweaponBar = document.querySelector('#superweaponBar');
  const charge = Math.min(1, state.resources.darkMatter / 3);
  superweaponBar.hidden = state.resources.darkMatter <= 0;
  document.querySelector('#superweaponCharge').style.width = `${charge * 100}%`;
}

function setResource(id, amount, rate) {
  document.querySelector(`#${id}`).textContent = id === 'darkMatter' ? amount.toFixed(2) : Math.floor(amount).toString();
  const rateElement = document.querySelector(`#${id}Rate`);
  rateElement.textContent = `${rate >= 0 ? '+' : ''}${rate.toFixed(id === 'darkMatter' ? 2 : 0)}/s`;
  rateElement.classList.toggle('negative', rate < 0);
}

function renderSelection(state) {
  const title = document.querySelector('#selectionTitle');
  const cursor = document.querySelector('#cursorMode');
  cursor.textContent = state.cursorMode || `${state.setup.playerFactionId} vs ${state.setup.aiFactionId}`;

  if (state.selected.length === 0) {
    title.textContent = 'No selection';
    selectionList.innerHTML = `<p class="muted">Select units or buildings to command them.</p>`;
    queueStrip.innerHTML = '';
    return;
  }

  title.textContent = state.selected.length === 1 ? state.selected[0].name : `${state.selected.length} selected`;
  selectionList.innerHTML = state.selected
    .slice(0, 12)
    .map(
      (entity) => `
        <article class="selection-card">
          <span>${entity.inTunnel ? 'Tunnel' : entity.kind}</span>
          <strong>${entity.name}</strong>
          <div class="health-bar"><span style="width:${Math.max(0, (entity.hp / entity.maxHp) * 100)}%"></span></div>
          <small>${entity.completed === false ? 'Constructing' : entity.disabled ? 'Disabled' : entity.veteranLevel ? `Veteran ${entity.veteranLevel}` : `${Math.ceil(entity.hp)} HP`}</small>
        </article>
      `,
    )
    .join('');

  const primary = state.selected[0];
  queueStrip.innerHTML = primary?.queue?.length
    ? primary.queue
        .map((item) => {
          const progress = 1 - item.remaining / item.total;
          return `<div class="queue-item"><span>${item.unitId}</span><i style="width:${progress * 100}%"></i></div>`;
        })
        .join('')
    : '';
}

function renderActions(state) {
  const selectedUnitAbilities = state.selected.flatMap((entity) =>
    (entity.abilitySlots || []).map((id) => ({
      id,
      cooldown: entity.abilityCooldowns?.[id] || 0,
    })),
  );
  if (selectedUnitAbilities.length > 0) {
    actionGrid.innerHTML = selectedUnitAbilities
      .slice(0, 8)
      .map(
        (ability) => `
          <button type="button" data-ability="${ability.id}" ${ability.cooldown > 0 ? 'disabled' : ''}>
            <span>${shortName(ability.id)}</span>
            <small>${ability.cooldown > 0 ? `${Math.ceil(ability.cooldown)}s` : 'Ready'}</small>
          </button>
        `,
      )
      .join('');
    return;
  }

  if (state.productionOptions.length > 0) {
    actionGrid.innerHTML = state.productionOptions
      .map(
        (unit) => `
          <button type="button" data-train="${unit.id}" title="${costText(unit.cost)}">
            <span>${shortName(unit.name)}</span>
            <small>${unit.buildTime}s</small>
          </button>
        `,
      )
      .join('');
    return;
  }

  actionGrid.innerHTML = state.buildOptions
    .map(
      (building) => `
        <button type="button" data-build="${building.id}" title="${costText(building.cost)}">
          <span>${shortName(building.name)}</span>
          <small>${Math.round(building.buildTime)}s</small>
        </button>
      `,
    )
    .join('');
}

function renderSuperweapons(state) {
  superweaponPanel.hidden = state.resources.darkMatter <= 0;
  superweaponPanel.innerHTML = state.superweapons
    .map(
      (weapon) => `
        <button type="button" data-superweapon="${weapon.id}" ${!weapon.affordable || weapon.cooldownRemaining > 0 ? 'disabled' : ''}>
          <span>${weapon.name}</span>
          <small>${weapon.cooldownRemaining > 0 ? `${Math.ceil(weapon.cooldownRemaining)}s` : `${weapon.cost} DM`}</small>
        </button>
      `,
    )
    .join('');
}

function renderMinimap(state) {
  const lines = state.tunnelLines
    .map(
      (line) =>
        `<i class="tunnel-line ${line.owner}" style="left:${line.x1 * 100}%; top:${line.z1 * 100}%; width:${Math.hypot(line.x2 - line.x1, line.z2 - line.z1) * 100}%; transform: rotate(${Math.atan2(line.z2 - line.z1, line.x2 - line.x1)}rad);"></i>`,
    )
    .join('');
  const dots = state.minimap
    .map(
      (dot) =>
        `<i class="dot ${dot.owner} ${dot.kind} ${dot.role || ''}" style="left:${dot.x * 100}%; top:${dot.z * 100}%"></i>`,
    )
    .join('');
  minimap.innerHTML = `${lines}${dots}`;
}

function renderDebug(state) {
  debugOverlay.hidden = !debugVisible;
  if (!debugVisible) {
    return;
  }
  debugOverlay.innerHTML = `
    <strong>F3 Debug</strong>
    <span>FPS: ${state.debug.fps}</span>
    <span>Units: ${state.debug.unitCount}</span>
    <span>Buildings: ${state.debug.buildingCount}</span>
    <span>Asset loads: ${state.debug.activeAssetDownloads}</span>
    <span>Memory: ${state.debug.memory ?? 'n/a'} MB</span>
    <span>AI: ${state.debug.difficulty}</span>
    <span>Map: ${state.debug.map}</span>
    <span>AI attack: ${formatTime(state.debug.aiAttackIn)}</span>
    <span>Net: ${state.debug.multiplayer?.connected ? 'online' : 'offline'} ${state.debug.multiplayer?.latency || 0}ms</span>
    <span>Combat: ${state.debug.combatActivity}</span>
  `;
}

function renderWarnings(state) {
  toastLog.innerHTML = state.debug.warnings
    .slice(-4)
    .map((message) => `<p>${message}</p>`)
    .join('');
}

function populateSelect(selector, items, selectedId) {
  const element = document.querySelector(selector);
  element.innerHTML = items.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  element.value = selectedId;
}

async function manualSave() {
  const data = game?.exportSave('manual');
  if (!data) {
    return;
  }
  const name = `manual-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (window.atStrategy?.writeSave) {
    await window.atStrategy.writeSave({ name, data });
  } else {
    localStorage.setItem('at-strategy-save', JSON.stringify(data));
  }
  pushToast(`Saved ${name}`);
}

async function loadLatestSave() {
  let data = null;
  if (window.atStrategy?.listSaves) {
    const saves = await window.atStrategy.listSaves();
    if (saves[0]) {
      data = await window.atStrategy.readSave(saves[0]);
    }
  } else {
    const raw = localStorage.getItem('at-strategy-save');
    data = raw ? JSON.parse(raw) : null;
  }
  if (!data) {
    pushToast('No save found');
    return;
  }
  await startGame({ ...data.options, hideSetup: true });
  game.loadSave(data);
  pushToast('Loaded latest save');
}

async function autosave(data) {
  if (window.atStrategy?.writeSave) {
    await window.atStrategy.writeSave({ name: 'autosave', data });
  } else {
    localStorage.setItem('at-strategy-autosave', JSON.stringify(data));
  }
}

async function loadSettings() {
  const stored = window.atStrategy?.readSettings ? await window.atStrategy.readSettings() : JSON.parse(localStorage.getItem('at-strategy-settings') || '{}');
  return { ...defaultSettings, ...stored };
}

async function saveSettings(nextSettings) {
  if (window.atStrategy?.writeSettings) {
    await window.atStrategy.writeSettings(nextSettings);
  } else {
    localStorage.setItem('at-strategy-settings', JSON.stringify(nextSettings));
  }
}

function applySettingsToControls(nextSettings) {
  document.querySelector('#resolutionSelect').value = nextSettings.resolution;
  document.querySelector('#graphicsQuality').value = nextSettings.graphicsQuality;
  document.querySelector('#fullscreenToggle').checked = Boolean(nextSettings.fullscreen);
  document.querySelector('#musicVolume').value = nextSettings.musicVolume;
  document.querySelector('#sfxVolume').value = nextSettings.sfxVolume;
}

function readSettingsFromControls() {
  return {
    resolution: document.querySelector('#resolutionSelect').value,
    graphicsQuality: document.querySelector('#graphicsQuality').value,
    fullscreen: document.querySelector('#fullscreenToggle').checked,
    musicVolume: Number(document.querySelector('#musicVolume').value),
    sfxVolume: Number(document.querySelector('#sfxVolume').value),
  };
}

function multiplayerPlayer() {
  return {
    name: document.querySelector('#mpName').value,
    factionId: document.querySelector('#mpFaction').value,
    color: document.querySelector('#mpColor').value,
    ready: true,
  };
}

function normalizeWsUrl(value) {
  const raw = value.trim() || '127.0.0.1:8787';
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }
  return `ws://${raw}`;
}

function handleMultiplayerEvent(message, client) {
  if (message.type === 'server:ping') {
    return;
  }
  if (message.type === 'match:start' && !client.isHost) {
    multiplayerPanel.hidden = true;
    setupPanel.hidden = true;
    startGame({
      playerFactionId: document.querySelector('#mpFaction').value,
      aiFactionId: document.querySelector('#aiFaction').value,
      mapId: message.room?.mapId || document.querySelector('#mpMap').value,
      difficultyId: 'medium',
      hideSetup: true,
    });
  }
  if (message.type === 'match:ai-takeover') {
    pushToast('Disconnected player handed to AI');
  }
  renderMultiplayerStatus(client.getState());
}

function renderMultiplayerStatus(state = {}) {
  const room = state.room || multiplayer.room;
  const players = room?.players?.map((player) => `${player.name} (${player.factionId})`).join('\n') || 'No room';
  multiplayerStatus.textContent = [
    state.status || (state.connected ? 'Connected' : 'Offline'),
    `Client: ${state.clientId || multiplayer.clientId || 'n/a'}`,
    `Latency: ${state.latency || multiplayer.latency || 0}ms`,
    room ? `Room: ${room.id} ${room.format} ${room.status}` : 'Room: none',
    players,
  ].join('\n');
}

function pushToast(message) {
  game?.warn(message);
  if (latestState) {
    renderWarnings({
      debug: {
        warnings: [...(latestState.debug?.warnings || []), message],
      },
    });
  }
}

function costText(cost) {
  return `Metal ${cost.metal || 0} | Energy ${cost.energy || 0} | Dark Matter ${cost.darkMatter || 0}`;
}

function shortName(name) {
  return String(name)
    .replace('synthekon-', '')
    .replace('vorreth-', '')
    .replace('ironveil-', '')
    .replace('Synthekon ', '')
    .replace('Vorreth ', '')
    .replace('Ironveil ', '')
    .replace('Android ', 'And. ')
    .replace('Vehicle ', 'Veh. ')
    .split(/[\s-]/)
    .map((word) => word.slice(0, 5))
    .join(' ');
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

window.addEventListener('beforeunload', () => {
  game?.dispose();
});

window.atStrategyGame = {
  current: game,
  startGame,
  get state() {
    return latestState;
  },
  snapshot: () => game?.getSnapshot(),
  runAcceptanceProbe: () => game?.runAcceptanceProbe(),
  runV03AcceptanceProbe: () => game?.runV03AcceptanceProbe(),
  runV10AcceptanceProbe: () => game?.runV10AcceptanceProbe(),
  save: () => game?.exportSave('manual'),
  load: (data) => game?.loadSave(data),
  multiplayer,
};
