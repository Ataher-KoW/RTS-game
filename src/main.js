import './styles.css';
import { PrototypeScene } from './game/PrototypeScene.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="game-shell">
    <section class="resource-bar" aria-label="Resources">
      <div><span>Metal</span><strong id="metal">1200</strong><small>+18</small></div>
      <div><span>Energy</span><strong id="energy">840</strong><small>+24</small></div>
      <div><span>Dark Matter</span><strong id="darkMatter">0</strong><small>+0</small></div>
    </section>
    <section class="viewport" id="viewport" aria-label="AT Strategy battlefield"></section>
    <section class="command-bar" aria-label="Command panel">
      <div class="minimap"></div>
      <div class="selection-panel">
        <span class="eyebrow">Selected</span>
        <strong>Command Core</strong>
        <div class="health-bar"><span></span></div>
      </div>
      <div class="ability-grid">
        <button type="button">HQ</button>
        <button type="button">PWR</button>
        <button type="button">MEX</button>
        <button type="button">LAB</button>
      </div>
    </section>
  </main>
`;

const viewport = document.querySelector('#viewport');
const scene = new PrototypeScene(viewport);
const metal = document.querySelector('#metal');
const energy = document.querySelector('#energy');

function animate() {
  const time = performance.now() / 1000;
  metal.textContent = String(1200 + Math.floor(time * 18));
  energy.textContent = String(840 + Math.floor(time * 24));
  scene.update();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

window.addEventListener('beforeunload', () => {
  scene.dispose();
});
