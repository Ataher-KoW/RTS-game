import './styles.css';
import { AI_DIFFICULTIES, MAPS, SUPERWEAPONS, getAllFactionSummaries } from './game/GameData.js';
import { SkirmishGame } from './game/SkirmishGame.js';

const app = document.querySelector('#app');
const factions = getAllFactionSummaries();
const difficulties = Object.values(AI_DIFFICULTIES);

app.innerHTML = `
  <main class="game-shell">
    <section class="setup-panel" id="setupPanel">
      <div>
        <span class="eyebrow">Skirmish Setup</span>
        <strong>AT Strategy</strong>
        <label>Player Faction<select id="playerFaction"></select></label>
        <label>Enemy Faction<select id="aiFaction"></select></label>
        <label>Map<select id="mapSelect"></select></label>
        <label>AI Difficulty<select id="difficultySelect"></select></label>
        <button type="button" id="startMatch">Start Skirmish</button>
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
let debugVisible = true;
let latestState = null;
let game = null;

populateSelect('#playerFaction', factions, 'synthekon');
populateSelect('#aiFaction', factions, 'synthekon');
populateSelect('#mapSelect', MAPS, 'fractured-frontier');
populateSelect('#difficultySelect', difficulties, 'easy');

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
  }, options);
  await game.init();
  setupPanel.hidden = Boolean(options.hideSetup);
  if (window.atStrategyGame) {
    window.atStrategyGame.current = game;
  }
}

function renderState(state) {
  latestState = state;
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
  current: null,
  startGame,
  get state() {
    return latestState;
  },
  snapshot: () => game?.getSnapshot(),
  runAcceptanceProbe: () => game?.runAcceptanceProbe(),
  runV03AcceptanceProbe: () => game?.runV03AcceptanceProbe(),
};
