import * as THREE from 'three';
import { AssetLibrary } from './AssetLibrary.js';
import { AudioBus } from './AudioBus.js';
import { CameraController } from './CameraController.js';
import { FlowFieldManager } from './FlowField.js';
import { FogOfWar } from './FogOfWar.js';
import { InstancedLodRenderer } from './InstancedLodRenderer.js';
import {
  BUILD_ORDER,
  ENTITY_KIND,
  OWNER,
  STARTING_RESOURCES,
  WEAPON_MULTIPLIERS,
  getSynthekonData,
} from './GameData.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Terrain } from './Terrain.js';

const PLAYER_COLOR = 0x7dd3fc;
const AI_COLOR = 0xf43f5e;
const RESOURCE_KEYS = ['metal', 'energy', 'darkMatter'];
const ATTACK_KEY = 'KeyA';
const UNIT_RADIUS = 0.75;

export class SkirmishGame {
  constructor(container, hooks = {}) {
    this.container = container;
    this.hooks = hooks;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.lastFrameDelta = 1 / 60;
    this.matchEnded = false;
    this.matchResult = null;
    this.nextEntityId = 1;
    this.entities = new Map();
    this.selectedIds = new Set();
    this.pickables = [];
    this.warnings = [];
    this.pendingPlacement = null;
    this.attackMoveArmed = false;
    this.drag = null;
    this.resources = {
      [OWNER.PLAYER]: { ...STARTING_RESOURCES },
      [OWNER.AI]: { ...STARTING_RESOURCES },
    };
    this.income = {
      [OWNER.PLAYER]: { metal: 0, energy: 0, darkMatter: 0 },
      [OWNER.AI]: { metal: 0, energy: 0, darkMatter: 0 },
    };
    this.ai = {
      nextThink: 1,
      nextTrain: 20,
      nextAttack: 360,
      buildPlan: [
        { at: 6, id: 'power-conduit', offset: new THREE.Vector3(-8, 0, 2) },
        { at: 14, id: 'metal-harvester', offset: new THREE.Vector3(-8, 0, 12) },
        { at: 32, id: 'android-foundry', offset: new THREE.Vector3(-2, 0, 8) },
        { at: 58, id: 'vehicle-assembly', offset: new THREE.Vector3(7, 0, 3) },
        { at: 82, id: 'defense-turret', offset: new THREE.Vector3(-12, 0, -6) },
      ],
    };

    this.data = getSynthekonData();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071018);
    this.scene.fog = new THREE.Fog(0x071018, 70, 145);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 260);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.append(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.terrain = new Terrain();
    this.flowFields = new FlowFieldManager(this.terrain);
    this.audio = new AudioBus();
    this.assetLibrary = new AssetLibrary({ onWarning: (message) => this.warn(message) });
    this.particles = new ParticleSystem(this.scene, this.terrain);
    this.instancedLod = new InstancedLodRenderer(this.scene);

    this.setupScene();
    this.cameraController = new CameraController(this.camera, this.renderer.domElement, this.terrain);
    this.fog = new FogOfWar(this.scene, this.terrain);
    this.bindInput();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  async init() {
    await this.assetLibrary.loadManifest();
    this.spawnInitialState();
    this.updateHud();
  }

  setupScene() {
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-22, 38, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x172554, 1.1));

    const { terrain, water, grid } = this.terrain.createMeshes();
    this.terrainMesh = terrain;
    this.waterMesh = water;
    this.scene.add(terrain, water, grid);

    for (const deposit of this.terrain.metalDeposits) {
      this.addResourceNode(deposit, 0x94a3b8, 'metal');
    }
    for (const node of this.terrain.darkMatterNodes) {
      this.addResourceNode(node, 0xa855f7, 'darkMatter');
    }
  }

  spawnInitialState() {
    const playerBase = new THREE.Vector3(-32, 0, 28);
    const aiBase = new THREE.Vector3(32, 0, -28);
    this.spawnBuilding('synthekon-hq', OWNER.PLAYER, playerBase, { completed: true });
    this.spawnBuilding('power-conduit', OWNER.PLAYER, playerBase.clone().add(new THREE.Vector3(7, 0, -4)), {
      completed: true,
    });
    this.spawnBuilding('metal-harvester', OWNER.PLAYER, new THREE.Vector3(-24, 0, 17), { completed: true });

    this.spawnBuilding('synthekon-hq', OWNER.AI, aiBase, { completed: true });
    this.spawnBuilding('power-conduit', OWNER.AI, aiBase.clone().add(new THREE.Vector3(-7, 0, 4)), {
      completed: true,
    });
    this.spawnBuilding('metal-harvester', OWNER.AI, new THREE.Vector3(24, 0, -18), { completed: true });

    for (let index = 0; index < 5; index += 1) {
      this.spawnUnit('rifle-android', OWNER.PLAYER, playerBase.clone().add(new THREE.Vector3(4 + index * 1.4, 0, -8)));
      this.spawnUnit('rifle-android', OWNER.AI, aiBase.clone().add(new THREE.Vector3(-4 - index * 1.4, 0, 8)));
    }
    this.spawnUnit('scout-drone', OWNER.PLAYER, playerBase.clone().add(new THREE.Vector3(1, 0, -11)));
    this.spawnUnit('scout-drone', OWNER.AI, aiBase.clone().add(new THREE.Vector3(-1, 0, 11)));
  }

  addResourceNode(position, color, type) {
    const mesh = new THREE.Mesh(
      type === 'darkMatter' ? new THREE.IcosahedronGeometry(1.25, 2) : new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: type === 'darkMatter' ? 0.8 : 0.18,
        roughness: 0.35,
      }),
    );
    mesh.position.copy(position);
    mesh.position.y += 0.8;
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  bindInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    window.addEventListener('keydown', (event) => {
      if (event.code === ATTACK_KEY) {
        this.attackMoveArmed = true;
        this.setCursorMode('Attack Move');
      }
      if (event.code === 'F3') {
        this.hooks.onToggleDebug?.();
      }
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === ATTACK_KEY) {
        this.attackMoveArmed = false;
        this.setCursorMode(null);
      }
    });
  }

  onPointerDown(event) {
    this.audio.unlock();
    if (event.button === 2) {
      return;
    }
    const point = this.screenToWorld(event);
    this.drag = {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      world: point,
      shift: event.shiftKey,
      detail: event.detail,
    };
    this.hooks.onDragBox?.(null);
  }

  onPointerMove(event) {
    if (this.drag) {
      this.drag.currentX = event.clientX;
      this.drag.currentY = event.clientY;
      if (this.dragDistance(this.drag) > 6) {
        this.hooks.onDragBox?.(this.getDragRect(this.drag));
      }
    }
    if (this.pendingPlacement) {
      this.updatePlacementGhost(event);
    }
  }

  onPointerUp(event) {
    if (event.button === 2) {
      this.handleRightClick(event);
      return;
    }

    if (!this.drag) {
      return;
    }

    this.hooks.onDragBox?.(null);
    if (this.pendingPlacement) {
      this.tryPlacePending(event);
      this.drag = null;
      return;
    }

    if (this.attackMoveArmed) {
      const point = this.screenToWorld(event);
      if (point) {
        this.issueMove(point, { attackMove: true });
      }
      this.drag = null;
      return;
    }

    if (this.dragDistance(this.drag) > 6) {
      this.selectByBox(this.getDragRect(this.drag), this.drag.shift);
    } else {
      const entity = this.screenToEntity(event);
      if (entity && entity.owner === OWNER.PLAYER) {
        if (this.drag.detail >= 2 && entity.kind === ENTITY_KIND.UNIT) {
          this.selectAllVisibleOfType(entity.defId, this.drag.shift);
        } else {
          this.selectEntities([entity.id], this.drag.shift);
        }
      } else {
        this.selectEntities([], false);
      }
    }
    this.drag = null;
  }

  handleRightClick(event) {
    const target = this.screenToEntity(event);
    if (target && target.owner !== OWNER.PLAYER) {
      this.issueAttack(target);
      return;
    }

    const point = this.screenToWorld(event);
    if (!point) {
      return;
    }

    const selectedBuildings = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.BUILDING);
    if (selectedBuildings.length > 0 && this.getSelected().every((entity) => entity.kind === ENTITY_KIND.BUILDING)) {
      for (const building of selectedBuildings) {
        building.rallyPoint.copy(point);
        this.particles.floatingText('RALLY', point.clone().add(new THREE.Vector3(0, 2, 0)), '#bae6fd');
      }
      this.audio.play('move');
      this.updateHud();
      return;
    }

    this.issueMove(point, { attackMove: false });
  }

  screenToWorld(event) {
    this.updatePointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.terrainMesh, false);
    return hits[0]?.point ?? null;
  }

  screenToEntity(event) {
    this.updatePointerNdc(event);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const entityId = node.userData.entityId;
        if (entityId) {
          const entity = this.entities.get(entityId);
          if (entity && entity.hp > 0 && (entity.owner === OWNER.PLAYER || this.fog.isVisible(entity.position))) {
            return entity;
          }
        }
        node = node.parent;
      }
    }
    return null;
  }

  updatePointerNdc(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  dragDistance(drag) {
    return Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  }

  getDragRect(drag) {
    const left = Math.min(drag.startX, drag.currentX);
    const top = Math.min(drag.startY, drag.currentY);
    return {
      left,
      top,
      width: Math.abs(drag.currentX - drag.startX),
      height: Math.abs(drag.currentY - drag.startY),
    };
  }

  beginPlacement(buildingId) {
    const def = this.data.buildings[buildingId];
    if (!def) {
      return;
    }
    this.clearPlacement();
    this.pendingPlacement = { buildingId, valid: false, position: new THREE.Vector3() };
    this.placementGhost = this.assetLibrary.createEntityVisual({
      id: buildingId,
      kind: ENTITY_KIND.BUILDING,
      category: 'building',
      ownerColor: PLAYER_COLOR,
      enemyColor: AI_COLOR,
      owner: OWNER.PLAYER,
    });
    this.placementGhost.traverse((node) => {
      if (node.material) {
        node.material = node.material.clone();
        node.material.transparent = true;
        node.material.opacity = 0.5;
      }
    });
    this.scene.add(this.placementGhost);
    this.setCursorMode(`Place ${def.name}`);
  }

  updatePlacementGhost(event) {
    const point = this.screenToWorld(event);
    if (!point) {
      return;
    }
    const snapped = this.terrain.snapPosition(point);
    const valid = this.canPlaceBuilding(this.pendingPlacement.buildingId, snapped, OWNER.PLAYER);
    this.pendingPlacement.position.copy(snapped);
    this.pendingPlacement.valid = valid;
    this.placementGhost.position.copy(this.terrain.placeOnGround(snapped));
    this.placementGhost.traverse((node) => {
      if (node.material?.color) {
        node.material.color.setHex(valid ? 0x7dd3fc : 0xef4444);
      }
    });
  }

  tryPlacePending(event) {
    this.updatePlacementGhost(event);
    if (!this.pendingPlacement?.valid) {
      this.audio.play('denied');
      return;
    }
    const id = this.pendingPlacement.buildingId;
    const def = this.data.buildings[id];
    if (!this.canAfford(OWNER.PLAYER, def.cost)) {
      this.warn(`Not enough resources for ${def.name}`);
      this.audio.play('denied');
      return;
    }
    this.payCost(OWNER.PLAYER, def.cost);
    this.spawnBuilding(id, OWNER.PLAYER, this.pendingPlacement.position, { completed: false });
    this.audio.play('build');
    this.clearPlacement();
    this.updateHud();
  }

  clearPlacement() {
    if (this.placementGhost) {
      this.scene.remove(this.placementGhost);
      this.placementGhost = null;
    }
    this.pendingPlacement = null;
    this.setCursorMode(null);
  }

  canPlaceBuilding(buildingId, position, owner) {
    const def = this.data.buildings[buildingId];
    if (!def || !this.terrain.isPassable(position.x, position.z)) {
      return false;
    }
    if (!this.isInZoneControl(position, owner)) {
      return false;
    }
    if (buildingId === 'metal-harvester' && !this.terrain.metalDeposits.some((node) => node.distanceTo(position) < 3.2)) {
      return false;
    }
    if (buildingId === 'dark-matter-siphon' && !this.terrain.darkMatterNodes.some((node) => node.distanceTo(position) < 5.5)) {
      return false;
    }
    for (const entity of this.entities.values()) {
      if (entity.hp > 0 && entity.kind === ENTITY_KIND.BUILDING && entity.position.distanceTo(position) < (entity.footprint + def.footprint) * 0.55) {
        return false;
      }
    }
    return true;
  }

  isInZoneControl(position, owner) {
    for (const entity of this.entities.values()) {
      if (entity.owner !== owner || entity.hp <= 0 || (entity.kind === ENTITY_KIND.BUILDING && !entity.completed)) {
        continue;
      }
      const radius = entity.kind === ENTITY_KIND.BUILDING ? entity.zoneControl : 9;
      if (entity.position.distanceTo(position) <= radius) {
        return true;
      }
    }
    return false;
  }

  spawnBuilding(defId, owner, position, { completed = false } = {}) {
    const def = this.data.buildings[defId];
    const ground = this.terrain.placeOnGround(position);
    const visual = this.assetLibrary.createEntityVisual({
      id: defId,
      kind: ENTITY_KIND.BUILDING,
      category: 'building',
      ownerColor: PLAYER_COLOR,
      enemyColor: AI_COLOR,
      owner,
    });
    visual.position.copy(ground);
    const entity = {
      id: this.nextEntityId++,
      kind: ENTITY_KIND.BUILDING,
      defId,
      owner,
      name: def.name,
      position: ground.clone(),
      visual,
      hp: def.hp,
      maxHp: def.hp,
      armor: def.armor,
      weapon: def.weapon,
      damage: def.damage ?? 0,
      range: def.range ?? 0,
      cooldown: def.cooldown ?? 1,
      fireTimer: 0,
      vision: def.zoneControl ?? 8,
      completed,
      buildRemaining: completed ? 0 : def.buildTime,
      buildTime: def.buildTime,
      productionQueue: [],
      rallyPoint: ground.clone().add(new THREE.Vector3(owner === OWNER.PLAYER ? 6 : -6, 0, owner === OWNER.PLAYER ? -4 : 4)),
      footprint: def.footprint,
      zoneControl: def.zoneControl,
      energyUse: def.energyUse ?? 0,
      smokeTimer: 0,
    };
    entity.rallyPoint.y = this.terrain.heightAt(entity.rallyPoint.x, entity.rallyPoint.z);
    this.decorateEntity(entity);
    this.entities.set(entity.id, entity);
    this.scene.add(visual);
    this.pickables.push(visual);
    this.applyConstructionVisual(entity);
    return entity;
  }

  spawnUnit(defId, owner, position) {
    const def = this.data.units[defId];
    const ground = this.terrain.placeOnGround(position);
    const visual = this.assetLibrary.createEntityVisual({
      id: defId,
      kind: ENTITY_KIND.UNIT,
      category: def.category,
      ownerColor: PLAYER_COLOR,
      enemyColor: AI_COLOR,
      owner,
    });
    const yOffset = def.category === 'air' ? 4 : 0;
    visual.position.copy(ground).add(new THREE.Vector3(0, yOffset, 0));
    const entity = {
      id: this.nextEntityId++,
      kind: ENTITY_KIND.UNIT,
      defId,
      owner,
      name: def.name,
      category: def.category,
      position: visual.position.clone(),
      visual,
      hp: def.hp,
      maxHp: def.hp,
      baseMaxHp: def.hp,
      damage: def.damage,
      baseDamage: def.damage,
      speed: def.speed,
      vision: def.vision,
      armor: def.armor,
      weapon: def.weapon,
      range: def.range,
      cooldown: def.cooldown,
      canAttackAir: def.canAttackAir,
      fireTimer: 0,
      order: null,
      targetId: null,
      kills: 0,
      veteranLevel: 0,
      rankIcon: null,
    };
    this.decorateEntity(entity);
    this.entities.set(entity.id, entity);
    this.scene.add(visual);
    this.pickables.push(visual);
    return entity;
  }

  decorateEntity(entity) {
    entity.visual.userData.entityId = entity.id;
    entity.visual.traverse((node) => {
      node.userData.entityId = entity.id;
    });

    entity.hpBar = this.createBar(entity.owner === OWNER.PLAYER ? 0x22c55e : 0xef4444);
    this.scene.add(entity.hpBar.group);

    entity.selectionRing = new THREE.Mesh(
      new THREE.TorusGeometry(entity.kind === ENTITY_KIND.BUILDING ? entity.footprint * 0.62 : 0.9, 0.035, 6, 48),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 }),
    );
    entity.selectionRing.rotation.x = Math.PI / 2;
    entity.selectionRing.visible = false;
    this.scene.add(entity.selectionRing);
  }

  createBar(color) {
    const group = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.78, depthTest: false }),
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.62, 0.08),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }),
    );
    fill.position.z = 0.01;
    group.add(back, fill);
    group.renderOrder = 40;
    return { group, fill };
  }

  applyConstructionVisual(entity) {
    entity.visual.traverse((node) => {
      if (node.material) {
        node.material = node.material.clone();
        node.material.transparent = true;
        node.material.opacity = entity.completed ? 1 : 0.5;
      }
    });
  }

  selectEntities(ids, additive = false) {
    if (!additive) {
      this.selectedIds.clear();
    }
    for (const id of ids) {
      this.selectedIds.add(id);
    }
    this.audio.play(ids.length > 0 ? 'select' : 'denied');
    this.updateSelectionVisuals();
    this.updateHud();
  }

  selectByBox(rect, additive) {
    const ids = [];
    for (const entity of this.entities.values()) {
      if (entity.owner !== OWNER.PLAYER || entity.hp <= 0 || entity.kind !== ENTITY_KIND.UNIT) {
        continue;
      }
      const screen = this.worldToScreen(entity.position);
      if (screen.x >= rect.left && screen.x <= rect.left + rect.width && screen.y >= rect.top && screen.y <= rect.top + rect.height) {
        ids.push(entity.id);
      }
    }
    this.selectEntities(ids, additive);
  }

  selectAllVisibleOfType(defId, additive) {
    const ids = [];
    for (const entity of this.entities.values()) {
      if (entity.owner === OWNER.PLAYER && entity.defId === defId && entity.hp > 0 && this.fog.isVisible(entity.position)) {
        ids.push(entity.id);
      }
    }
    this.selectEntities(ids, additive);
  }

  worldToScreen(position) {
    const vector = position.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((vector.x + 1) / 2) * rect.width + rect.left,
      y: ((-vector.y + 1) / 2) * rect.height + rect.top,
    };
  }

  updateSelectionVisuals() {
    for (const entity of this.entities.values()) {
      entity.selectionRing.visible = this.selectedIds.has(entity.id);
    }
  }

  getSelected() {
    return [...this.selectedIds].map((id) => this.entities.get(id)).filter(Boolean);
  }

  issueMove(point, { attackMove = false } = {}) {
    const units = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.UNIT);
    if (units.length === 0) {
      return;
    }
    units.forEach((unit, index) => {
      const offset = this.formationOffset(index, units.length);
      const target = point.clone().add(offset);
      target.y = this.terrain.heightAt(target.x, target.z);
      unit.order = {
        type: attackMove ? 'attackMove' : 'move',
        target,
        flow: this.flowFields.getField(target, { air: unit.category === 'air' }),
      };
      unit.targetId = null;
    });
    this.audio.play('move');
  }

  issueAttack(target) {
    const units = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.UNIT);
    for (const unit of units) {
      unit.order = { type: 'attack', targetId: target.id };
      unit.targetId = target.id;
    }
    if (units.length > 0) {
      this.audio.play('move');
    }
  }

  formationOffset(index, total) {
    const columns = Math.ceil(Math.sqrt(total));
    const x = (index % columns) - columns / 2;
    const z = Math.floor(index / columns) - columns / 2;
    return new THREE.Vector3(x * 1.4, 0, z * 1.4);
  }

  queueUnit(unitId) {
    const selected = this.getSelected();
    const building = selected.find((entity) => entity.kind === ENTITY_KIND.BUILDING && entity.owner === OWNER.PLAYER && entity.completed);
    if (!building) {
      this.warn('Select a completed production building first');
      this.audio.play('denied');
      return;
    }
    const trains = this.data.buildings[building.defId].trains || [];
    const unitDef = this.data.units[unitId];
    if (!unitDef || !trains.includes(unitId)) {
      this.warn(`${building.name} cannot train that unit`);
      this.audio.play('denied');
      return;
    }
    if (!this.canAfford(OWNER.PLAYER, unitDef.cost)) {
      this.warn(`Not enough resources for ${unitDef.name}`);
      this.audio.play('denied');
      return;
    }
    this.payCost(OWNER.PLAYER, unitDef.cost);
    building.productionQueue.push({ unitId, remaining: unitDef.buildTime, total: unitDef.buildTime });
    this.audio.play('build');
    this.updateHud();
  }

  update(delta) {
    if (this.matchEnded) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsed += delta;
    this.lastFrameDelta = delta;
    this.cameraController.update(delta);
    this.updateResources(delta);
    this.updateConstruction(delta);
    this.updateProduction(delta);
    this.updateUnits(delta);
    this.updateCombat(delta);
    this.updateAI(delta);
    this.updateVisibility();
    this.updateVisuals(delta);
    this.instancedLod.update([...this.entities.values()], this.camera, this.selectedIds);
    this.particles.update(delta, this.camera);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  updateResources(delta) {
    for (const owner of [OWNER.PLAYER, OWNER.AI]) {
      const income = { metal: 0, energy: 0, darkMatter: 0 };
      for (const entity of this.entities.values()) {
        if (entity.owner !== owner || entity.kind !== ENTITY_KIND.BUILDING || entity.hp <= 0 || !entity.completed) {
          continue;
        }
        const def = this.data.buildings[entity.defId];
        if (entity.defId === 'metal-harvester' && this.terrain.metalDeposits.some((node) => node.distanceTo(entity.position) < 4)) {
          income.metal += def.produces?.metal ?? 0;
        } else if (entity.defId === 'dark-matter-siphon' && this.terrain.darkMatterNodes.some((node) => node.distanceTo(entity.position) < 6)) {
          income.darkMatter += def.produces?.darkMatter ?? 0;
        } else {
          income.energy += def.produces?.energy ?? 0;
        }
        income.energy -= entity.energyUse || 0;
      }
      this.income[owner] = income;
      for (const key of RESOURCE_KEYS) {
        this.resources[owner][key] = Math.max(0, this.resources[owner][key] + income[key] * delta);
      }
    }
  }

  updateConstruction(delta) {
    for (const entity of this.entities.values()) {
      if (entity.kind !== ENTITY_KIND.BUILDING || entity.completed || entity.hp <= 0) {
        continue;
      }
      const speed = this.getProductionSpeed(entity);
      entity.buildRemaining -= delta * speed;
      if (entity.buildRemaining <= 0) {
        entity.completed = true;
        entity.buildRemaining = 0;
        this.applyConstructionVisual(entity);
        this.audio.play(entity.owner === OWNER.PLAYER ? 'build' : 'select');
        this.particles.burst(entity.position.clone().add(new THREE.Vector3(0, 2, 0)), entity.owner === OWNER.PLAYER ? 0x7dd3fc : 0xf43f5e, 10);
      }
    }
  }

  updateProduction(delta) {
    for (const building of this.entities.values()) {
      if (building.kind !== ENTITY_KIND.BUILDING || !building.completed || building.productionQueue.length === 0 || building.hp <= 0) {
        continue;
      }
      const item = building.productionQueue[0];
      item.remaining -= delta * this.getProductionSpeed(building);
      if (item.remaining <= 0) {
        const spawn = building.rallyPoint.clone();
        const unit = this.spawnUnit(item.unitId, building.owner, building.position.clone().lerp(spawn, 0.18));
        unit.order = {
          type: 'move',
          target: spawn,
          flow: this.flowFields.getField(spawn, { air: unit.category === 'air' }),
        };
        building.productionQueue.shift();
        this.audio.play(building.owner === OWNER.PLAYER ? 'build' : 'select');
      }
    }
  }

  getProductionSpeed(entity) {
    const netEnergy = this.income[entity.owner].energy;
    return netEnergy < 0 && entity.energyUse > 0 ? 0.5 : 1;
  }

  updateUnits(delta) {
    const units = [...this.entities.values()].filter((entity) => entity.kind === ENTITY_KIND.UNIT && entity.hp > 0);
    for (const unit of units) {
      if (unit.order?.type === 'attack') {
        const target = this.entities.get(unit.order.targetId);
        if (!target || target.hp <= 0) {
          unit.order = null;
          unit.targetId = null;
        } else if (unit.position.distanceTo(target.position) > unit.range * 0.92) {
          this.moveToward(unit, target.position, delta);
        }
      } else if (unit.order?.type === 'move' || unit.order?.type === 'attackMove') {
        if (unit.order.type === 'attackMove') {
          const enemy = this.findNearestEnemy(unit, unit.vision);
          if (enemy) {
            unit.targetId = enemy.id;
            unit.order = { type: 'attack', targetId: enemy.id };
          }
        }
        if (unit.order?.target) {
          this.followFlow(unit, delta);
        }
      } else {
        const enemy = this.findNearestEnemy(unit, unit.range);
        if (enemy) {
          unit.targetId = enemy.id;
        }
      }
      this.keepOnTerrain(unit);
    }
  }

  followFlow(unit, delta) {
    const target = unit.order.target;
    if (unit.position.distanceTo(target) < 1.1) {
      unit.order = null;
      return;
    }
    const flowDirection = unit.order.flow.directionAt(unit.position);
    const direct = target.clone().sub(unit.position).setY(0).normalize();
    const direction = flowDirection ? flowDirection.clone().lerp(direct, 0.25).normalize() : direct;
    this.moveInDirection(unit, direction, delta);
  }

  moveToward(unit, target, delta) {
    const flow = this.flowFields.getField(target, { air: unit.category === 'air' });
    const direction = flow.directionAt(unit.position) || target.clone().sub(unit.position).setY(0).normalize();
    this.moveInDirection(unit, direction, delta);
  }

  moveInDirection(unit, direction, delta) {
    const separation = new THREE.Vector3();
    for (const other of this.entities.values()) {
      if (other === unit || other.owner !== unit.owner || other.kind !== ENTITY_KIND.UNIT || other.hp <= 0) {
        continue;
      }
      const distance = unit.position.distanceTo(other.position);
      if (distance > 0 && distance < UNIT_RADIUS * 2.2) {
        separation.add(unit.position.clone().sub(other.position).setY(0).normalize().multiplyScalar((UNIT_RADIUS * 2.2 - distance) * 0.6));
      }
    }
    const final = direction.clone().add(separation).normalize();
    const next = unit.position.clone().addScaledVector(final, unit.speed * delta);
    if (this.terrain.isPassable(next.x, next.z, { air: unit.category === 'air' })) {
      unit.position.copy(next);
      unit.visual.position.copy(next);
      if (final.lengthSq() > 0) {
        unit.visual.rotation.y = Math.atan2(final.x, final.z);
      }
    }
  }

  keepOnTerrain(unit) {
    const height = this.terrain.heightAt(unit.position.x, unit.position.z);
    unit.position.y = height + (unit.category === 'air' ? 4 : 0);
    unit.visual.position.copy(unit.position);
  }

  updateCombat(delta) {
    for (const entity of this.entities.values()) {
      if (entity.hp <= 0 || (entity.kind === ENTITY_KIND.BUILDING && !entity.completed)) {
        continue;
      }
      entity.fireTimer = Math.max(0, entity.fireTimer - delta);
      if (!entity.weapon) {
        continue;
      }

      let target = entity.targetId ? this.entities.get(entity.targetId) : null;
      if (!target || target.hp <= 0 || target.owner === entity.owner || entity.position.distanceTo(target.position) > entity.range) {
        target = this.findNearestEnemy(entity, entity.range);
      }
      if (!target || entity.fireTimer > 0) {
        continue;
      }
      this.dealDamage(entity, target);
      entity.fireTimer = entity.cooldown;
    }
  }

  dealDamage(attacker, target) {
    const multiplier = WEAPON_MULTIPLIERS[attacker.weapon]?.[target.armor] ?? 1;
    const damage = attacker.damage * multiplier;
    target.hp -= damage;
    this.audio.play('fire');
    this.particles.burst(target.position.clone().add(new THREE.Vector3(0, 1.2, 0)), attacker.owner === OWNER.PLAYER ? 0x7dd3fc : 0xf43f5e, 2);

    if (target.hp <= 0) {
      this.killEntity(target, attacker);
    }
  }

  killEntity(target, attacker) {
    target.hp = 0;
    this.audio.play('explosion');
    this.particles.burst(target.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xf97316, target.kind === ENTITY_KIND.BUILDING ? 28 : 12);
    this.scene.remove(target.visual);
    this.scene.remove(target.hpBar.group);
    this.scene.remove(target.selectionRing);
    this.pickables = this.pickables.filter((mesh) => mesh !== target.visual);
    this.selectedIds.delete(target.id);

    if (attacker?.kind === ENTITY_KIND.UNIT) {
      attacker.kills += 1;
      this.updateVeterancy(attacker);
    }

    if (target.defId === 'synthekon-hq') {
      this.endMatch(target.owner === OWNER.AI ? 'victory' : 'defeat');
    }
  }

  updateVeterancy(unit) {
    const thresholds = [5, 15, 30];
    const nextLevel = thresholds.findIndex((kills) => unit.kills < kills) + 1;
    const level = nextLevel === 0 ? 3 : nextLevel - 1;
    if (level <= unit.veteranLevel) {
      return;
    }
    unit.veteranLevel = level;
    const multiplier = 1 + level * 0.1;
    unit.maxHp = unit.baseMaxHp * multiplier;
    unit.damage = unit.baseDamage * multiplier;
    unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.1);
    this.audio.play('veteran');
    this.particles.floatingText('+VETERAN', unit.position.clone().add(new THREE.Vector3(0, 2.7, 0)), '#fde68a');
    if (!unit.rankIcon) {
      unit.rankIcon = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.28, 5),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }),
      );
      this.scene.add(unit.rankIcon);
    }
  }

  findNearestEnemy(entity, radius) {
    let nearest = null;
    let best = radius;
    for (const candidate of this.entities.values()) {
      if (candidate.owner === entity.owner || candidate.hp <= 0 || (candidate.kind === ENTITY_KIND.BUILDING && !candidate.completed)) {
        continue;
      }
      if (entity.owner === OWNER.PLAYER && !this.fog.isVisible(candidate.position)) {
        continue;
      }
      if (candidate.category === 'air' && entity.weapon !== 'antiAir' && entity.weapon !== 'antiArmor' && !entity.canAttackAir) {
        continue;
      }
      const distance = entity.position.distanceTo(candidate.position);
      if (distance < best) {
        best = distance;
        nearest = candidate;
      }
    }
    return nearest;
  }

  updateAI(delta) {
    if (this.elapsed < this.ai.nextThink) {
      return;
    }
    this.ai.nextThink = this.elapsed + 4;

    for (const item of this.ai.buildPlan) {
      if (item.done || this.elapsed < item.at) {
        continue;
      }
      const hq = this.findBuilding(OWNER.AI, 'synthekon-hq');
      if (!hq) {
        continue;
      }
      const position = hq.position.clone().add(item.offset);
      if (this.tryPlaceBuildingForAI(item.id, position)) {
        item.done = true;
      }
    }

    if (this.elapsed >= this.ai.nextTrain) {
      this.ai.nextTrain = this.elapsed + 17;
      const production = [...this.entities.values()].find(
        (entity) =>
          entity.owner === OWNER.AI &&
          entity.kind === ENTITY_KIND.BUILDING &&
          entity.completed &&
          (this.data.buildings[entity.defId].trains || []).length > 0,
      );
      if (production) {
        const options = this.data.buildings[production.defId].trains;
        const unitId = options[Math.floor(Math.random() * options.length)];
        const unitDef = this.data.units[unitId];
        if (this.canAfford(OWNER.AI, unitDef.cost)) {
          this.payCost(OWNER.AI, unitDef.cost);
          production.productionQueue.push({ unitId, remaining: unitDef.buildTime, total: unitDef.buildTime });
        }
      }
    }

    if (this.elapsed >= this.ai.nextAttack) {
      this.ai.nextAttack = this.elapsed + 95;
      const army = [...this.entities.values()].filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.UNIT && entity.hp > 0);
      const target = this.findBuilding(OWNER.PLAYER, 'synthekon-hq');
      if (target && army.length >= 4) {
        for (const unit of army.slice(0, 12)) {
          unit.order = {
            type: 'attackMove',
            target: target.position.clone(),
            flow: this.flowFields.getField(target.position, { air: unit.category === 'air' }),
          };
        }
        this.warn('Enemy attack force detected');
      }
    }
  }

  tryPlaceBuildingForAI(id, position) {
    const def = this.data.buildings[id];
    const snapped = this.terrain.snapPosition(position);
    if (id === 'metal-harvester') {
      const hq = this.findBuilding(OWNER.AI, 'synthekon-hq');
      const deposit = this.terrain.metalDeposits
        .filter((node) => node.x > 0)
        .sort((a, b) => a.distanceTo(hq.position) - b.distanceTo(hq.position))[0];
      if (deposit) {
        snapped.copy(this.terrain.snapPosition(deposit));
      }
    }
    if (!this.canPlaceBuilding(id, snapped, OWNER.AI)) {
      return false;
    }
    if (!this.canAfford(OWNER.AI, def.cost)) {
      return false;
    }
    this.payCost(OWNER.AI, def.cost);
    this.spawnBuilding(id, OWNER.AI, snapped, { completed: false });
    return true;
  }

  findBuilding(owner, defId) {
    return [...this.entities.values()].find((entity) => entity.owner === owner && entity.defId === defId && entity.hp > 0);
  }

  updateVisibility() {
    const playerSources = [...this.entities.values()].filter((entity) => entity.owner === OWNER.PLAYER && entity.hp > 0);
    this.fog.update(playerSources);
    for (const entity of this.entities.values()) {
      if (entity.owner !== OWNER.AI) {
        entity.renderVisible = true;
        continue;
      }
      const visible = this.fog.isVisible(entity.position);
      entity.renderVisible = visible;
      entity.visual.visible = visible;
      entity.hpBar.group.visible = visible;
      entity.selectionRing.visible = visible && this.selectedIds.has(entity.id);
    }
  }

  updateVisuals(delta) {
    for (const entity of this.entities.values()) {
      if (entity.hp <= 0) {
        continue;
      }
      const top = entity.kind === ENTITY_KIND.BUILDING ? 4.2 : entity.category === 'air' ? 2.2 : 1.9;
      entity.hpBar.group.position.copy(entity.position).add(new THREE.Vector3(0, top, 0));
      entity.hpBar.group.lookAt(this.camera.position);
      entity.hpBar.fill.scale.x = Math.max(0.02, entity.hp / entity.maxHp);
      entity.hpBar.fill.position.x = -0.81 * (1 - entity.hp / entity.maxHp);

      if (entity.kind === ENTITY_KIND.BUILDING && !entity.completed) {
        const progress = 1 - entity.buildRemaining / entity.buildTime;
        entity.hpBar.fill.material.color.setHex(0xfacc15);
        entity.hpBar.fill.scale.x = Math.max(0.02, progress);
      } else {
        entity.hpBar.fill.material.color.setHex(entity.owner === OWNER.PLAYER ? 0x22c55e : 0xef4444);
      }

      const ground = this.terrain.heightAt(entity.position.x, entity.position.z);
      entity.selectionRing.position.set(entity.position.x, ground + 0.08, entity.position.z);

      if (entity.rankIcon) {
        entity.rankIcon.position.copy(entity.position).add(new THREE.Vector3(0, entity.category === 'air' ? 2.8 : 2.2, 0));
        entity.rankIcon.lookAt(this.camera.position);
        entity.rankIcon.material.color.setHex(entity.veteranLevel === 3 ? 0x67e8f9 : 0xfacc15);
      }

      if (entity.kind === ENTITY_KIND.BUILDING && entity.completed) {
        entity.smokeTimer -= delta;
        if (entity.smokeTimer <= 0 && entity.hp / entity.maxHp < 0.5) {
          entity.smokeTimer = entity.hp / entity.maxHp < 0.25 ? 0.2 : 0.45;
          const source = entity.position.clone().add(new THREE.Vector3(0, 3, 0));
          if (entity.hp / entity.maxHp < 0.25) {
            this.particles.fire(source);
          } else {
            this.particles.smoke(source, 1);
          }
        }
      }
    }
  }

  updateHud() {
    this.hooks.onState?.({
      elapsed: this.elapsed,
      resources: this.resources[OWNER.PLAYER],
      income: this.income[OWNER.PLAYER],
      aiResources: this.resources[OWNER.AI],
      selected: this.getSelected().map((entity) => this.serializeEntity(entity)),
      buildOptions: BUILD_ORDER.map((id) => this.data.buildings[id]),
      productionOptions: this.getProductionOptions(),
      minimap: this.getMinimapState(),
      debug: this.getDebugState(),
      cursorMode: this.cursorMode,
    });
  }

  serializeEntity(entity) {
    return {
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      name: entity.name,
      hp: entity.hp,
      maxHp: entity.maxHp,
      completed: entity.completed ?? true,
      queue: entity.productionQueue || [],
      kills: entity.kills || 0,
      veteranLevel: entity.veteranLevel || 0,
    };
  }

  getProductionOptions() {
    const building = this.getSelected().find((entity) => entity.kind === ENTITY_KIND.BUILDING && entity.completed);
    if (!building) {
      return [];
    }
    return (this.data.buildings[building.defId].trains || []).map((id) => this.data.units[id]);
  }

  getMinimapState() {
    return [...this.entities.values()]
      .filter((entity) => entity.hp > 0 && (entity.owner === OWNER.PLAYER || this.fog.isVisible(entity.position)))
      .map((entity) => ({
        id: entity.id,
        owner: entity.owner,
        kind: entity.kind,
        x: (entity.position.x + this.terrain.half) / this.terrain.size,
        z: (entity.position.z + this.terrain.half) / this.terrain.size,
      }));
  }

  getDebugState() {
    return {
      fps: Math.round(1 / Math.max(this.lastFrameDelta, 0.001)),
      unitCount: [...this.entities.values()].filter((entity) => entity.kind === ENTITY_KIND.UNIT && entity.hp > 0).length,
      buildingCount: [...this.entities.values()].filter((entity) => entity.kind === ENTITY_KIND.BUILDING && entity.hp > 0).length,
      activeAssetDownloads: this.assetLibrary.activeDownloads,
      warnings: this.warnings.slice(-6),
      memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
      aiAttackIn: Math.max(0, this.ai.nextAttack - this.elapsed),
    };
  }

  getPublicData() {
    return this.data;
  }

  getBuildOrder() {
    return BUILD_ORDER;
  }

  getSnapshot() {
    const entities = [...this.entities.values()].filter((entity) => entity.hp > 0);
    return {
      elapsed: this.elapsed,
      matchEnded: this.matchEnded,
      matchResult: this.matchResult,
      resources: structuredClone(this.resources),
      income: structuredClone(this.income),
      playerUnits: entities.filter((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.UNIT).length,
      aiUnits: entities.filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.UNIT).length,
      playerBuildings: entities.filter((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.BUILDING).length,
      aiBuildings: entities.filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.BUILDING).length,
      playerHqAlive: Boolean(this.findBuilding(OWNER.PLAYER, 'synthekon-hq')),
      aiHqAlive: Boolean(this.findBuilding(OWNER.AI, 'synthekon-hq')),
      warnings: this.warnings.slice(-8),
    };
  }

  runAcceptanceProbe() {
    const checks = [];
    const assert = (name, condition, detail = '') => {
      checks.push({ name, pass: Boolean(condition), detail });
    };

    this.updateVisibility();
    this.updateResources(1);
    const hq = this.findBuilding(OWNER.PLAYER, 'synthekon-hq');
    assert('player HQ exists', hq?.completed === true);

    const startingUnits = this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT);
    this.selectEntities([hq.id]);
    this.queueUnit('scout-drone');
    assert('HQ queues scout drone', hq.productionQueue.length === 1);
    this.simulateSeconds(10);
    assert('queued unit spawns', this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT) > startingUnits);

    const foundrySpot = this.findBuildSpotForProbe('android-foundry', OWNER.PLAYER, hq.position);
    assert('valid foundry build spot found', Boolean(foundrySpot));
    const foundry = this.placeBuildingForProbe('android-foundry', OWNER.PLAYER, foundrySpot);
    this.simulateSeconds(this.data.buildings['android-foundry'].buildTime + 1);
    assert('construction completes', foundry.completed === true);

    const beforeSwarm = this.countUnitsByDef(OWNER.PLAYER, 'android-swarm');
    this.selectEntities([foundry.id]);
    this.queueUnit('android-swarm');
    this.simulateSeconds(this.data.units['android-swarm'].buildTime + 1);
    assert('production building trains unit', this.countUnitsByDef(OWNER.PLAYER, 'android-swarm') > beforeSwarm);

    const mover = [...this.entities.values()].find((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.UNIT && entity.hp > 0);
    const startPosition = mover.position.clone();
    this.selectEntities([mover.id]);
    this.issueMove(startPosition.clone().add(new THREE.Vector3(6, 0, -4)), { attackMove: false });
    this.simulateSeconds(2.5);
    assert('move order changes unit position', mover.position.distanceTo(startPosition) > 1);

    const combatTarget = this.spawnUnit('rifle-android', OWNER.AI, mover.position.clone().add(new THREE.Vector3(2.4, 0, 0)));
    combatTarget.hp = 1;
    mover.kills = 4;
    this.selectEntities([mover.id]);
    this.issueAttack(combatTarget);
    this.simulateSeconds(2);
    assert('combat destroys target', combatTarget.hp <= 0);
    assert('veterancy level gained', mover.veteranLevel >= 1);

    const centerScout = this.spawnUnit('scout-drone', OWNER.PLAYER, new THREE.Vector3(2, 0, 2));
    const siphonSpot = this.findBuildSpotForProbe('dark-matter-siphon', OWNER.PLAYER, centerScout.position);
    assert('valid dark matter siphon spot found', Boolean(siphonSpot));
    const siphon = this.placeBuildingForProbe('dark-matter-siphon', OWNER.PLAYER, siphonSpot, true);
    const darkBefore = this.resources[OWNER.PLAYER].darkMatter;
    this.simulateSeconds(6);
    assert('dark matter income works', siphon.completed && this.resources[OWNER.PLAYER].darkMatter > darkBefore);

    const aiBuildingsBefore = this.countEntities(OWNER.AI, ENTITY_KIND.BUILDING);
    this.simulateSeconds(95);
    assert('easy AI builds economy/production', this.countEntities(OWNER.AI, ENTITY_KIND.BUILDING) > aiBuildingsBefore);

    const aiHq = this.findBuilding(OWNER.AI, 'synthekon-hq');
    aiHq.hp = 1;
    this.dealDamage(mover, aiHq);
    assert('enemy HQ destruction wins match', this.matchEnded && this.matchResult === 'victory');

    const passed = checks.every((check) => check.pass);
    return {
      passed,
      checks,
      snapshot: this.getSnapshot(),
    };
  }

  simulateSeconds(seconds, step = 0.2) {
    const iterations = Math.ceil(seconds / step);
    for (let index = 0; index < iterations && !this.matchEnded; index += 1) {
      this.update(Math.min(step, seconds - index * step));
    }
  }

  findBuildSpotForProbe(buildingId, owner, origin) {
    const def = this.data.buildings[buildingId];
    const searchCenters =
      buildingId === 'metal-harvester'
        ? this.terrain.metalDeposits
        : buildingId === 'dark-matter-siphon'
          ? this.terrain.darkMatterNodes
          : [origin];

    for (const center of searchCenters) {
      for (let radius = 0; radius <= 18; radius += this.terrain.cellSize) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const candidate = this.terrain.snapPosition(
            center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)),
          );
          if (this.canPlaceBuilding(buildingId, candidate, owner)) {
            return candidate;
          }
        }
      }
    }

    this.warn(`Probe could not find build spot for ${def?.name ?? buildingId}`);
    return null;
  }

  placeBuildingForProbe(buildingId, owner, position, completed = false) {
    const def = this.data.buildings[buildingId];
    if (!position || !this.canPlaceBuilding(buildingId, position, owner)) {
      throw new Error(`No valid probe placement for ${buildingId}`);
    }
    this.payCost(owner, def.cost);
    return this.spawnBuilding(buildingId, owner, position, { completed });
  }

  countEntities(owner, kind) {
    return [...this.entities.values()].filter((entity) => entity.owner === owner && entity.kind === kind && entity.hp > 0).length;
  }

  countUnitsByDef(owner, defId) {
    return [...this.entities.values()].filter(
      (entity) => entity.owner === owner && entity.kind === ENTITY_KIND.UNIT && entity.defId === defId && entity.hp > 0,
    ).length;
  }

  canAfford(owner, cost = {}) {
    return RESOURCE_KEYS.every((key) => (this.resources[owner][key] ?? 0) >= (cost[key] ?? 0));
  }

  payCost(owner, cost = {}) {
    for (const key of RESOURCE_KEYS) {
      this.resources[owner][key] -= cost[key] ?? 0;
    }
  }

  warn(message) {
    const text = `[${this.formatTime(this.elapsed)}] ${message}`;
    if (this.warnings[this.warnings.length - 1] !== text) {
      this.warnings.push(text);
      if (this.warnings.length > 30) {
        this.warnings.shift();
      }
    }
  }

  setCursorMode(mode) {
    this.cursorMode = mode;
    this.updateHud();
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  endMatch(result) {
    this.matchEnded = true;
    this.matchResult = result;
    this.hooks.onGameOver?.({
      result,
      elapsed: this.elapsed,
    });
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
