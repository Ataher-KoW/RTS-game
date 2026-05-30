import './styles.css';
import { SkirmishGame } from './game/SkirmishGame.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="game-shell">
    <section class="resource-bar" aria-label="Resources">
      <div><span>Metal</span><strong id="metal">0</strong><small id="metalRate">+0/s</small></div>
      <div><span>Energy</span><strong id="energy">0</strong><small id="energyRate">+0/s</small></div>
      <div><span>Dark Matter</span><strong id="darkMatter">0</strong><small id="darkMatterRate">+0/s</small></div>
    </section>
    <section class="superweapon-bar" id="superweaponBar" hidden>
      <span>Superweapon Charge</span>
      <div><i id="superweaponCharge"></i></div>
    </section>
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
let debugVisible = true;
let latestState = null;

const game = new SkirmishGame(viewport, {
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
});

await game.init();

actionGrid.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }
  if (button.dataset.build) {
    game.beginPlacement(button.dataset.build);
  }
  if (button.dataset.train) {
    game.queueUnit(button.dataset.train);
  }
});

document.querySelector('#restartButton').addEventListener('click', () => {
  window.location.reload();
});

function frame() {
  game.update(Math.min(game.clock.getDelta(), 0.05));
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

function renderState(state) {
  latestState = state;
  renderResources(state);
  renderSelection(state);
  renderActions(state);
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
  cursor.textContent = state.cursorMode || 'Synthekon Skirmish';

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
          <span>${entity.kind}</span>
          <strong>${entity.name}</strong>
          <div class="health-bar"><span style="width:${Math.max(0, (entity.hp / entity.maxHp) * 100)}%"></span></div>
          <small>${entity.completed === false ? 'Constructing' : entity.veteranLevel ? `Veteran ${entity.veteranLevel}` : `${Math.ceil(entity.hp)} HP`}</small>
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

function renderMinimap(state) {
  minimap.innerHTML = state.minimap
    .map(
      (dot) =>
        `<i class="dot ${dot.owner} ${dot.kind}" style="left:${dot.x * 100}%; top:${dot.z * 100}%"></i>`,
    )
    .join('');
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
    <span>AI attack: ${formatTime(state.debug.aiAttackIn)}</span>
  `;
}

function renderWarnings(state) {
  toastLog.innerHTML = state.debug.warnings
    .slice(-4)
    .map((message) => `<p>${message}</p>`)
    .join('');
}

function costText(cost) {
  return `Metal ${cost.metal || 0} | Energy ${cost.energy || 0} | Dark Matter ${cost.darkMatter || 0}`;
}

function shortName(name) {
  return name
    .replace('Synthekon ', '')
    .replace('Android ', 'And. ')
    .replace('Vehicle ', 'Veh. ')
    .split(' ')
    .map((word) => word.slice(0, 5))
    .join(' ');
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

window.addEventListener('beforeunload', () => {
  game.dispose();
});

window.atStrategyGame = {
  get state() {
    return latestState;
  },
  snapshot: () => game.getSnapshot(),
  runAcceptanceProbe: () => game.runAcceptanceProbe(),
};
