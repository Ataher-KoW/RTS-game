import * as THREE from 'three';
import { AssetLibrary } from './AssetLibrary.js';
import { AudioBus } from './AudioBus.js';
import { CameraController } from './CameraController.js';
import { FlowFieldManager } from './FlowField.js';
import { FogOfWar } from './FogOfWar.js';
import { InstancedLodRenderer } from './InstancedLodRenderer.js';
import {
  ABILITIES,
  AI_DIFFICULTIES,
  ENTITY_KIND,
  OWNER,
  STARTING_RESOURCES,
  SUPERWEAPONS,
  WEAPON_MULTIPLIERS,
  getDifficultyById,
  getFactionData,
  getMapById,
} from './GameData.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Terrain } from './Terrain.js';

const RESOURCE_KEYS = ['metal', 'energy', 'darkMatter'];
const ATTACK_KEY = 'KeyA';
const UNIT_RADIUS = 0.75;
const TUNNEL_SPEED = 34;

export class SkirmishGame {
  constructor(container, hooks = {}, options = {}) {
    this.container = container;
    this.hooks = hooks;
    this.options = {
      playerFactionId: options.playerFactionId || 'synthekon',
      aiFactionId: options.aiFactionId || options.playerFactionId || 'synthekon',
      mapId: options.mapId || 'fractured-frontier',
      difficultyId: options.difficultyId || 'easy',
    };
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.lastFrameDelta = 1 / 60;
    this.matchEnded = false;
    this.matchResult = null;
    this.nextEntityId = 1;
    this.entities = new Map();
    this.rubble = [];
    this.selectedIds = new Set();
    this.pickables = [];
    this.warnings = [];
    this.pendingPlacement = null;
    this.pendingSuperweapon = null;
    this.attackMoveArmed = false;
    this.drag = null;
    this.activeSuperweapons = [];
    this.activeCombatCount = 0;
    this.nextAutosaveAt = 300;
    this.settings = {
      graphicsQuality: 'high',
      musicVolume: 0.42,
      sfxVolume: 0.78,
      fullscreen: false,
      resolution: '1280x800',
      ...options.settings,
    };
    this.multiplayer = {
      connected: false,
      isHost: false,
      latency: 0,
      room: null,
    };
    this.resources = {
      [OWNER.PLAYER]: { ...STARTING_RESOURCES },
      [OWNER.AI]: { ...STARTING_RESOURCES },
    };
    this.income = {
      [OWNER.PLAYER]: { metal: 0, energy: 0, darkMatter: 0 },
      [OWNER.AI]: { metal: 0, energy: 0, darkMatter: 0 },
    };
    this.superweaponCooldowns = {
      [OWNER.PLAYER]: Object.fromEntries(Object.keys(SUPERWEAPONS).map((id) => [id, 0])),
      [OWNER.AI]: Object.fromEntries(Object.keys(SUPERWEAPONS).map((id) => [id, 0])),
    };

    this.playerData = getFactionData(this.options.playerFactionId);
    this.aiData = getFactionData(this.options.aiFactionId);
    this.map = getMapById(this.options.mapId);
    this.difficulty = getDifficultyById(this.options.difficultyId);
    this.ai = this.createAiState();

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
    this.terrain = new Terrain({ map: this.map });
    this.flowFields = new FlowFieldManager(this.terrain);
    this.audio = new AudioBus();
    this.assetLibrary = new AssetLibrary({ onWarning: (message) => this.warn(message) });
    this.particles = new ParticleSystem(this.scene, this.terrain);
    this.instancedLod = new InstancedLodRenderer(this.scene);
    this.setSettings(this.settings);

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

  createAiState() {
    const roles = this.aiData.roles;
    const d = this.difficulty;
    const plan = [
      { at: 6, role: 'power', id: roles.power, offset: new THREE.Vector3(-8, 0, 2) },
      { at: 12, role: 'metal', id: roles.metal, offset: new THREE.Vector3(-8, 0, 12) },
      { at: d.expansionDelay, role: 'infantry', id: roles.infantry, offset: new THREE.Vector3(-2, 0, 8) },
      { at: d.expansionDelay + 26, role: 'vehicle', id: roles.vehicle, offset: new THREE.Vector3(7, 0, 3) },
      { at: d.expansionDelay + 42, role: 'air', id: roles.air, offset: new THREE.Vector3(2, 0, -9) },
      { at: d.expansionDelay + 58, role: 'turret', id: roles.turret, offset: new THREE.Vector3(-12, 0, -6) },
      { at: d.expansionDelay + 72, role: 'tunnel', id: roles.tunnel, offset: new THREE.Vector3(10, 0, 10) },
      { at: d.expansionDelay + 88, role: 'tech', id: roles.tech, offset: new THREE.Vector3(-9, 0, -12) },
    ];
    if (d.rush) {
      plan.unshift({ at: 3, role: 'infantry', id: roles.infantry, offset: new THREE.Vector3(-3, 0, 7) });
    }
    return {
      nextThink: 1,
      nextTrain: 12,
      nextAttack: d.firstAttack,
      nextAbility: 90,
      plan,
    };
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
    for (const anchor of this.terrain.tunnelAnchors) {
      this.addResourceNode(anchor, 0x22d3ee, 'tunnel');
    }
  }

  spawnInitialState() {
    const playerBase = this.terrain.placeOnGround(new THREE.Vector3(this.map.playerBase[0], 0, this.map.playerBase[1]));
    const aiBase = this.terrain.placeOnGround(new THREE.Vector3(this.map.aiBase[0], 0, this.map.aiBase[1]));
    this.spawnStarterBase(OWNER.PLAYER, playerBase);
    this.spawnStarterBase(OWNER.AI, aiBase);
  }

  spawnStarterBase(owner, base) {
    const data = this.dataForOwner(owner);
    const direction = owner === OWNER.PLAYER ? 1 : -1;
    this.spawnBuilding(data.roles.hq, owner, base, { completed: true });
    this.spawnBuilding(data.roles.power, owner, base.clone().add(new THREE.Vector3(7 * direction, 0, -4 * direction)), {
      completed: true,
    });
    const deposit = this.nearestDeposit(base, owner);
    this.spawnBuilding(data.roles.metal, owner, deposit, { completed: true });

    const starterUnits = data.faction.units.slice(0, 2);
    for (let index = 0; index < 6; index += 1) {
      const unit = starterUnits[index % starterUnits.length];
      this.spawnUnit(unit.id, owner, base.clone().add(new THREE.Vector3((4 + index * 1.4) * direction, 0, -8 * direction)));
    }
  }

  addResourceNode(position, color, type) {
    const geometry =
      type === 'darkMatter'
        ? new THREE.IcosahedronGeometry(1.25, 2)
        : type === 'tunnel'
          ? new THREE.TorusGeometry(1.1, 0.12, 8, 36)
          : new THREE.DodecahedronGeometry(1, 0);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: type === 'darkMatter' ? 0.8 : 0.22,
        roughness: 0.35,
      }),
    );
    mesh.position.copy(position);
    mesh.position.y += type === 'tunnel' ? 0.2 : 0.8;
    mesh.rotation.x = type === 'tunnel' ? Math.PI / 2 : 0;
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
      if (event.code === 'Escape') {
        this.clearPlacement();
        this.pendingSuperweapon = null;
        this.setCursorMode(null);
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
    this.audio.startMusic();
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

    const point = this.screenToWorld(event);
    if (this.pendingSuperweapon && point) {
      this.fireSuperweaponAt(this.pendingSuperweapon, point, OWNER.PLAYER);
      this.pendingSuperweapon = null;
      this.drag = null;
      return;
    }

    if (this.attackMoveArmed) {
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
    if (target && target.owner === OWNER.PLAYER && target.role === 'tunnel') {
      this.issueTunnelEnter(target);
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

  beginPlacement(buildingId) {
    const def = this.playerData.buildings[buildingId];
    if (!def) {
      return;
    }
    this.clearPlacement();
    this.pendingPlacement = { buildingId, valid: false, position: new THREE.Vector3() };
    this.placementGhost = this.createEntityVisual(buildingId, ENTITY_KIND.BUILDING, 'building', OWNER.PLAYER);
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
        node.material.color.setHex(valid ? this.playerData.palette.player : 0xef4444);
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
    const def = this.playerData.buildings[id];
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

  beginSuperweapon(superweaponId) {
    const weapon = SUPERWEAPONS[superweaponId];
    if (!weapon) {
      return;
    }
    if (!this.canFireSuperweapon(superweaponId, OWNER.PLAYER)) {
      this.audio.play('denied');
      return;
    }
    this.pendingSuperweapon = superweaponId;
    this.setCursorMode(`Target ${weapon.name}`);
  }

  fireSuperweaponAt(superweaponId, point, owner = OWNER.PLAYER) {
    const weapon = SUPERWEAPONS[superweaponId];
    if (!weapon || !this.canFireSuperweapon(superweaponId, owner)) {
      return false;
    }
    this.resources[owner].darkMatter -= weapon.cost;
    this.superweaponCooldowns[owner][superweaponId] = weapon.cooldown;
    const position = this.terrain.placeOnGround(point).add(new THREE.Vector3(0, 1.2, 0));
    this.audio.play('explosion');

    if (superweaponId === 'kineticStrike') {
      this.damageEntitiesInRadius(position, weapon.radius, owner, 520);
      this.terrain.deformCrater(position, weapon.radius, 1.2);
      this.addCraterMarker(position, weapon.radius);
      this.particles.burst(position, 0xf97316, 42);
    } else if (superweaponId === 'empStorm') {
      for (const entity of this.enemiesInRadius(position, weapon.radius, owner)) {
        entity.disabledUntil = Math.max(entity.disabledUntil || 0, this.elapsed + weapon.duration);
      }
      this.particles.burst(position, 0x38bdf8, 34);
    } else if (superweaponId === 'voidRift') {
      for (const entity of this.entitiesInRadius(position, weapon.radius)) {
        if (entity.kind === ENTITY_KIND.UNIT) {
          this.teleportEntity(entity, this.randomPassablePosition());
        }
      }
      this.particles.burst(position, 0xa855f7, 38);
    } else {
      this.activeSuperweapons.push({
        id: superweaponId,
        owner,
        position: position.clone(),
        remaining: weapon.duration,
        tick: 0,
      });
      this.particles.burst(position, superweaponId === 'blackHole' ? 0x111827 : 0x22c55e, 28);
    }
    this.updateHud();
    return true;
  }

  canFireSuperweapon(superweaponId, owner) {
    const weapon = SUPERWEAPONS[superweaponId];
    return Boolean(
      weapon &&
        this.resources[owner].darkMatter >= weapon.cost &&
        (this.superweaponCooldowns[owner][superweaponId] || 0) <= 0,
    );
  }

  useSelectedAbility(abilityId) {
    const caster = this.getSelected().find((entity) => entity.kind === ENTITY_KIND.UNIT && entity.abilitySlots?.includes(abilityId));
    if (!caster) {
      this.audio.play('denied');
      return false;
    }
    return this.useAbility(caster, abilityId);
  }

  useAbility(caster, abilityId, explicitTarget = null) {
    const ability = ABILITIES[abilityId];
    if (!ability || caster.inTunnel || caster.hp <= 0 || (caster.abilityCooldowns[abilityId] || 0) > 0) {
      return false;
    }
    caster.abilityCooldowns[abilityId] = ability.cooldown;
    this.audio.play('veteran');

    if (abilityId === 'stomp') {
      for (const enemy of this.enemiesInRadius(caster.position, ability.range, caster.owner)) {
        enemy.hp -= 75;
        const push = enemy.position.clone().sub(caster.position).setY(0).normalize().multiplyScalar(3.5);
        enemy.position.add(push);
        enemy.visual.position.copy(enemy.position);
        if (enemy.hp <= 0) {
          this.killEntity(enemy, caster);
        }
      }
      this.particles.burst(caster.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x7dd3fc, 18);
    } else if (abilityId === 'cloak') {
      caster.cloakedUntil = this.elapsed + ability.duration;
      this.particles.floatingText('CLOAK', caster.position.clone().add(new THREE.Vector3(0, 2.4, 0)), '#bae6fd');
    } else if (abilityId === 'burrow') {
      const destination = explicitTarget || this.randomPassablePosition(caster.position, ability.range);
      this.enterBurrow(caster, destination);
    } else if (abilityId === 'spawn-brood') {
      for (let index = 0; index < 3; index += 1) {
        const offset = new THREE.Vector3((index - 1) * 1.5, 0, 2);
        const brood = this.spawnUnit('brood-warrior', caster.owner, caster.position.clone().add(offset));
        brood.expiresAt = this.elapsed + ability.duration;
      }
    } else if (abilityId === 'emp-pulse') {
      const target = explicitTarget || this.findNearestEnemy(caster, ability.range);
      if (target) {
        target.disabledUntil = Math.max(target.disabledUntil || 0, this.elapsed + ability.duration);
        this.particles.burst(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x38bdf8, 12);
      }
    } else if (abilityId === 'shield-burst') {
      caster.shieldUntil = this.elapsed + ability.duration;
      caster.shieldRemaining = 240;
      this.particles.floatingText('SHIELD', caster.position.clone().add(new THREE.Vector3(0, 2.6, 0)), '#fed7aa');
    }
    this.updateHud();
    return true;
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
    this.updateCooldowns(delta);
    this.updateConstruction(delta);
    this.updateProduction(delta);
    this.updateTunnels(delta);
    this.updateUnits(delta);
    this.updateCombat(delta);
    this.audio.setCombatActivity(this.activeCombatCount);
    this.updateSuperweapons(delta);
    this.updateAI(delta);
    this.updateVisibility();
    this.updateVisuals(delta);
    this.instancedLod.update([...this.entities.values()], this.camera, this.selectedIds);
    this.particles.update(delta, this.camera);
    this.updateHud();
    if (this.elapsed >= this.nextAutosaveAt) {
      this.nextAutosaveAt += 300;
      this.hooks.onAutosave?.(this.exportSave('autosave'));
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateResources(delta) {
    for (const owner of [OWNER.PLAYER, OWNER.AI]) {
      const data = this.dataForOwner(owner);
      const income = { metal: 0, energy: 0, darkMatter: 0 };
      for (const entity of this.entities.values()) {
        if (entity.owner !== owner || entity.kind !== ENTITY_KIND.BUILDING || entity.hp <= 0 || !entity.completed) {
          continue;
        }
        if (entity.role === 'metal' && this.terrain.metalDeposits.some((node) => node.distanceTo(entity.position) < 4)) {
          income.metal += entity.def.produces?.metal ?? 0;
        } else if (entity.role === 'darkMatter' && this.terrain.darkMatterNodes.some((node) => node.distanceTo(entity.position) < 6)) {
          income.darkMatter += entity.def.produces?.darkMatter ?? 0;
        } else {
          income.energy += entity.def.produces?.energy ?? 0;
        }
        income.energy -= entity.energyUse || 0;
      }
      this.income[owner] = income;
      for (const key of RESOURCE_KEYS) {
        this.resources[owner][key] = Math.max(0, this.resources[owner][key] + income[key] * delta);
      }
      if (data.factionId === 'vorreth') {
        this.resources[owner].energy += 0;
      }
    }
  }

  updateCooldowns(delta) {
    for (const owner of [OWNER.PLAYER, OWNER.AI]) {
      for (const id of Object.keys(this.superweaponCooldowns[owner])) {
        this.superweaponCooldowns[owner][id] = Math.max(0, this.superweaponCooldowns[owner][id] - delta);
      }
    }
    for (const entity of this.entities.values()) {
      if (!entity.abilityCooldowns) {
        continue;
      }
      for (const id of Object.keys(entity.abilityCooldowns)) {
        entity.abilityCooldowns[id] = Math.max(0, entity.abilityCooldowns[id] - delta);
      }
    }
  }

  updateConstruction(delta) {
    for (const entity of this.entities.values()) {
      if (entity.kind !== ENTITY_KIND.BUILDING || entity.completed || entity.hp <= 0) {
        continue;
      }
      entity.buildRemaining -= delta * this.getProductionSpeed(entity);
      if (entity.buildRemaining <= 0) {
        entity.completed = true;
        entity.buildRemaining = 0;
        this.applyConstructionVisual(entity);
        this.audio.play(entity.owner === OWNER.PLAYER ? 'build' : 'select');
        this.particles.burst(entity.position.clone().add(new THREE.Vector3(0, 2, 0)), this.colorForOwner(entity.owner), 10);
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

  updateTunnels(delta) {
    for (const entity of this.entities.values()) {
      if (entity.inTunnel) {
        entity.tunnelRemaining -= delta;
        if (entity.tunnelRemaining <= 0) {
          this.exitTunnel(entity);
        }
        continue;
      }
      if (entity.hp <= 0) {
        continue;
      }
      if (entity.expiresAt && this.elapsed >= entity.expiresAt) {
        this.killEntity(entity, null);
      }
    }
  }

  updateUnits(delta) {
    const units = [...this.entities.values()].filter((entity) => entity.kind === ENTITY_KIND.UNIT && entity.hp > 0 && !entity.inTunnel);
    for (const unit of units) {
      if ((unit.disabledUntil || 0) > this.elapsed) {
        continue;
      }
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

  updateCombat(delta) {
    let activeCombat = 0;
    for (const entity of this.entities.values()) {
      if (
        entity.hp <= 0 ||
        entity.inTunnel ||
        (entity.disabledUntil || 0) > this.elapsed ||
        (entity.kind === ENTITY_KIND.BUILDING && !entity.completed)
      ) {
        continue;
      }
      entity.fireTimer = Math.max(0, entity.fireTimer - delta);
      if (!entity.weapon) {
        continue;
      }
      let target = entity.targetId ? this.entities.get(entity.targetId) : null;
      if (!target || target.hp <= 0 || target.owner === entity.owner || target.inTunnel || entity.position.distanceTo(target.position) > entity.range) {
        target = this.findNearestEnemy(entity, entity.range);
      }
      if (!target || entity.fireTimer > 0) {
        continue;
      }
      activeCombat += 1;
      this.dealDamage(entity, target);
      entity.fireTimer = entity.cooldown;
    }
    this.activeCombatCount = activeCombat;
  }

  updateSuperweapons(delta) {
    for (let index = this.activeSuperweapons.length - 1; index >= 0; index -= 1) {
      const effect = this.activeSuperweapons[index];
      const weapon = SUPERWEAPONS[effect.id];
      effect.remaining -= delta;
      effect.tick -= delta;
      if (effect.tick <= 0) {
        effect.tick = 0.35;
        if (effect.id === 'blackHole') {
          for (const entity of this.entitiesInRadius(effect.position, weapon.radius)) {
            if (entity.kind !== ENTITY_KIND.UNIT || entity.owner === effect.owner || entity.inTunnel) {
              continue;
            }
            const pull = effect.position.clone().sub(entity.position).setY(0).normalize().multiplyScalar(1.8);
            entity.position.add(pull);
            entity.visual.position.copy(entity.position);
            this.applyDamage(null, entity, 16);
          }
          this.particles.burst(effect.position, 0x111827, 4);
        } else if (effect.id === 'nanoSwarm') {
          for (const entity of this.enemiesInRadius(effect.position, weapon.radius, effect.owner)) {
            this.applyDamage(null, entity, 14);
          }
          this.particles.burst(effect.position, 0x22c55e, 5);
        }
      }
      if (effect.remaining <= 0) {
        this.activeSuperweapons.splice(index, 1);
      }
    }
  }

  updateAI() {
    if (this.elapsed < this.ai.nextThink) {
      return;
    }
    this.ai.nextThink = this.elapsed + this.difficulty.thinkInterval;
    this.aiBuild();
    this.aiTrain();
    this.aiUseAbilities();
    this.aiAttack();
  }

  aiBuild() {
    for (const item of this.ai.plan) {
      if (item.done || this.elapsed < item.at) {
        continue;
      }
      const hq = this.findBuilding(OWNER.AI, this.aiData.roles.hq);
      if (!hq) {
        continue;
      }
      const position = item.role === 'metal' ? this.nearestDeposit(hq.position, OWNER.AI) : hq.position.clone().add(item.offset);
      if (this.tryPlaceBuildingForAI(item.id, position)) {
        item.done = true;
      }
    }
    if (this.elapsed > this.difficulty.expansionDelay && this.difficulty.id !== 'easy') {
      const hq = this.findBuilding(OWNER.AI, this.aiData.roles.hq);
      const extraDeposit = this.terrain.metalDeposits
        .filter((deposit) => deposit.x > 0)
        .find((deposit) => !this.findNearbyBuilding(OWNER.AI, this.aiData.roles.metal, deposit, 5));
      if (hq && extraDeposit) {
        this.tryPlaceBuildingForAI(this.aiData.roles.metal, extraDeposit);
      }
    }
  }

  aiTrain() {
    if (this.elapsed < this.ai.nextTrain) {
      return;
    }
    this.ai.nextTrain = this.elapsed + this.difficulty.trainInterval;
    const productionBuildings = [...this.entities.values()].filter(
      (entity) =>
        entity.owner === OWNER.AI &&
        entity.kind === ENTITY_KIND.BUILDING &&
        entity.completed &&
        (this.dataForOwner(entity.owner).buildings[entity.defId].trains || []).length > 0,
    );
    for (const production of productionBuildings.slice(0, this.difficulty.id === 'hard' ? 3 : 2)) {
      const options = this.dataForOwner(OWNER.AI).buildings[production.defId].trains;
      const unitId = options[Math.floor(Math.random() * options.length)];
      const unitDef = this.aiData.units[unitId];
      if (unitDef && this.canAfford(OWNER.AI, unitDef.cost)) {
        this.payCost(OWNER.AI, unitDef.cost);
        production.productionQueue.push({ unitId, remaining: unitDef.buildTime, total: unitDef.buildTime });
      }
    }
  }

  aiUseAbilities() {
    if (!this.difficulty.usesAbilities || this.elapsed < this.ai.nextAbility) {
      return;
    }
    this.ai.nextAbility = this.elapsed + 38;
    for (const unit of this.entities.values()) {
      if (unit.owner === OWNER.AI && unit.kind === ENTITY_KIND.UNIT && unit.abilitySlots?.length && unit.hp > 0) {
        this.useAbility(unit, unit.abilitySlots[0]);
        return;
      }
    }
  }

  aiAttack() {
    if (this.elapsed < this.ai.nextAttack) {
      return;
    }
    this.ai.nextAttack = this.elapsed + this.difficulty.attackInterval;
    const army = [...this.entities.values()].filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.UNIT && entity.hp > 0);
    const target =
      this.difficulty.targetResources && this.findRoleBuilding(OWNER.PLAYER, 'metal')
        ? this.findRoleBuilding(OWNER.PLAYER, 'metal')
        : this.findBuilding(OWNER.PLAYER, this.playerData.roles.hq);
    if (target && army.length >= (this.difficulty.rush ? 3 : 4)) {
      for (const unit of army.slice(0, this.difficulty.waveSize)) {
        unit.order = {
          type: 'attackMove',
          target: target.position.clone(),
          flow: this.flowFields.getField(target.position, { air: unit.category === 'air' }),
        };
      }
      this.warn(`${this.difficulty.name} AI attack force detected`);
    }
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
    const def = this.dataForOwner(owner).buildings[buildingId];
    if (!def || !this.terrain.isPassable(position.x, position.z)) {
      return false;
    }
    if (!this.isInZoneControl(position, owner)) {
      return false;
    }
    if (def.role === 'metal' && !this.terrain.metalDeposits.some((node) => node.distanceTo(position) < 3.4)) {
      return false;
    }
    if (def.role === 'darkMatter' && !this.terrain.darkMatterNodes.some((node) => node.distanceTo(position) < 5.8)) {
      return false;
    }
    if (def.role === 'tunnel' && !this.terrain.tunnelAnchors.some((node) => node.distanceTo(position) < 6.5)) {
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
      if (entity.owner !== owner || entity.hp <= 0 || (entity.kind === ENTITY_KIND.BUILDING && !entity.completed) || entity.inTunnel) {
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
    const data = this.dataForOwner(owner);
    const def = data.buildings[defId];
    const ground = this.terrain.placeOnGround(position);
    const visual = this.createEntityVisual(defId, ENTITY_KIND.BUILDING, 'building', owner);
    visual.position.copy(ground);
    const entity = {
      id: this.nextEntityId++,
      kind: ENTITY_KIND.BUILDING,
      defId,
      owner,
      factionId: data.factionId,
      name: def.name,
      role: def.role,
      def,
      ownerColor: this.colorForOwner(owner),
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
    const data = this.dataForOwner(owner);
    const def = data.units[defId];
    if (!def) {
      return null;
    }
    const ground = this.terrain.placeOnGround(position);
    const visual = this.createEntityVisual(defId, ENTITY_KIND.UNIT, def.category, owner);
    const yOffset = def.category === 'air' ? 4 : 0;
    visual.position.copy(ground).add(new THREE.Vector3(0, yOffset, 0));
    const entity = {
      id: this.nextEntityId++,
      kind: ENTITY_KIND.UNIT,
      defId,
      owner,
      factionId: data.factionId,
      name: def.name,
      category: def.category,
      def,
      ownerColor: this.colorForOwner(owner),
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
      abilitySlots: def.abilitySlots || [],
      abilityCooldowns: Object.fromEntries((def.abilitySlots || []).map((id) => [id, 0])),
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

  createEntityVisual(id, kind, category, owner) {
    const data = this.dataForOwner(owner);
    return this.assetLibrary.createEntityVisual({
      id,
      kind,
      category,
      ownerColor: data.palette.player,
      enemyColor: data.palette.ai,
      owner,
      factionId: data.factionId,
      glowColor: data.palette.glow,
      accentColor: data.palette.accent,
    });
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
      if (entity.owner !== OWNER.PLAYER || entity.hp <= 0 || entity.kind !== ENTITY_KIND.UNIT || entity.inTunnel) {
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
      if (entity.owner === OWNER.PLAYER && entity.defId === defId && entity.hp > 0 && !entity.inTunnel && this.fog.isVisible(entity.position)) {
        ids.push(entity.id);
      }
    }
    this.selectEntities(ids, additive);
  }

  updateSelectionVisuals() {
    for (const entity of this.entities.values()) {
      entity.selectionRing.visible = this.selectedIds.has(entity.id) && !entity.inTunnel;
    }
  }

  getSelected() {
    return [...this.selectedIds].map((id) => this.entities.get(id)).filter(Boolean);
  }

  issueMove(point, { attackMove = false } = {}) {
    const units = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.UNIT && entity.hp > 0 && !entity.inTunnel);
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
    const units = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.UNIT && !entity.inTunnel);
    for (const unit of units) {
      unit.order = { type: 'attack', targetId: target.id };
      unit.targetId = target.id;
    }
    if (units.length > 0) {
      this.audio.play('move');
    }
  }

  issueTunnelEnter(entrance, preferredExit = null) {
    const units = this.getSelected().filter((entity) => entity.kind === ENTITY_KIND.UNIT && !entity.inTunnel);
    const exits = this.getTunnelEntrances(entrance.owner).filter((candidate) => candidate.id !== entrance.id);
    if (units.length === 0 || exits.length === 0) {
      this.audio.play('denied');
      return;
    }
    const exit = exits.includes(preferredExit)
      ? preferredExit
      : exits.sort((a, b) => b.position.distanceTo(entrance.position) - a.position.distanceTo(entrance.position))[0];
    for (const unit of units) {
      const distance = entrance.position.distanceTo(exit.position);
      unit.inTunnel = true;
      unit.tunnelExitId = exit.id;
      unit.tunnelRemaining = Math.max(2.5, distance / TUNNEL_SPEED);
      unit.visual.visible = false;
      unit.hpBar.group.visible = false;
      unit.selectionRing.visible = false;
      unit.order = null;
      unit.targetId = null;
      for (const entity of this.entities.values()) {
        if (entity.targetId === unit.id) {
          entity.targetId = null;
        }
      }
    }
    this.audio.play('move');
    this.warn(`${units.length} unit(s) entered tunnel network`);
  }

  exitTunnel(unit) {
    const exit = this.entities.get(unit.tunnelExitId) || this.getTunnelEntrances(unit.owner)[0];
    if (!exit) {
      unit.inTunnel = false;
      return;
    }
    unit.inTunnel = false;
    unit.tunnelExitId = null;
    unit.position.copy(exit.position).add(new THREE.Vector3(1.8, 0, 1.8));
    this.keepOnTerrain(unit);
    this.particles.burst(unit.position.clone().add(new THREE.Vector3(0, 1, 0)), this.colorForOwner(unit.owner), 8);
  }

  queueUnit(unitId) {
    const selected = this.getSelected();
    const building = selected.find((entity) => entity.kind === ENTITY_KIND.BUILDING && entity.owner === OWNER.PLAYER && entity.completed);
    if (!building) {
      this.warn('Select a completed production building first');
      this.audio.play('denied');
      return;
    }
    const trains = this.playerData.buildings[building.defId].trains || [];
    const unitDef = this.playerData.units[unitId];
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
      if (other === unit || other.owner !== unit.owner || other.kind !== ENTITY_KIND.UNIT || other.hp <= 0 || other.inTunnel) {
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

  dealDamage(attacker, target) {
    const multiplier = WEAPON_MULTIPLIERS[attacker.weapon]?.[target.armor] ?? 1;
    const damage = attacker.damage * multiplier;
    this.applyDamage(attacker, target, damage);
    this.audio.play('fire');
    this.particles.burst(target.position.clone().add(new THREE.Vector3(0, 1.2, 0)), this.colorForOwner(attacker.owner), 2);
  }

  applyDamage(attacker, target, amount) {
    if (target.inTunnel || target.hp <= 0) {
      return;
    }
    if (target.shieldRemaining > 0 && (target.shieldUntil || 0) > this.elapsed) {
      const absorbed = Math.min(target.shieldRemaining, amount);
      target.shieldRemaining -= absorbed;
      amount -= absorbed;
    }
    target.hp -= amount;
    if (target.hp <= 0) {
      this.killEntity(target, attacker);
    }
  }

  killEntity(target, attacker) {
    if (target.hp <= -999) {
      return;
    }
    target.hp = -1000;
    this.audio.play('explosion');
    this.particles.destruction(target.position.clone().add(new THREE.Vector3(0, 1.2, 0)), target.factionId, target.kind);
    if (target.kind === ENTITY_KIND.BUILDING) {
      this.addRubble(target);
    }
    this.scene.remove(target.visual);
    this.scene.remove(target.hpBar.group);
    this.scene.remove(target.selectionRing);
    if (target.rankIcon) {
      this.scene.remove(target.rankIcon);
    }
    this.pickables = this.pickables.filter((mesh) => mesh !== target.visual);
    this.selectedIds.delete(target.id);

    if (attacker?.kind === ENTITY_KIND.UNIT) {
      attacker.kills += 1;
      this.updateVeterancy(attacker);
    }

    if (target.defId === this.aiData.roles.hq && target.owner === OWNER.AI) {
      this.endMatch('victory');
    }
    if (target.defId === this.playerData.roles.hq && target.owner === OWNER.PLAYER) {
      this.endMatch('defeat');
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
      if (
        candidate.owner === entity.owner ||
        candidate.hp <= 0 ||
        candidate.inTunnel ||
        (candidate.cloakedUntil || 0) > this.elapsed ||
        (candidate.kind === ENTITY_KIND.BUILDING && !candidate.completed)
      ) {
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

  updateVisibility() {
    const playerSources = [...this.entities.values()].filter((entity) => entity.owner === OWNER.PLAYER && entity.hp > 0 && !entity.inTunnel);
    this.fog.update(playerSources);
    for (const entity of this.entities.values()) {
      if (entity.owner !== OWNER.AI) {
        entity.renderVisible = !entity.inTunnel;
        entity.visual.visible = !entity.inTunnel;
        entity.hpBar.group.visible = !entity.inTunnel;
        continue;
      }
      const visible = this.fog.isVisible(entity.position) && !entity.inTunnel && !((entity.cloakedUntil || 0) > this.elapsed);
      entity.renderVisible = visible;
      entity.visual.visible = visible;
      entity.hpBar.group.visible = visible;
      entity.selectionRing.visible = visible && this.selectedIds.has(entity.id);
    }
  }

  updateVisuals(delta) {
    for (const entity of this.entities.values()) {
      if (entity.hp <= 0 || entity.inTunnel) {
        continue;
      }
      const top = entity.kind === ENTITY_KIND.BUILDING ? 4.2 : entity.category === 'air' ? 2.2 : 1.9;
      entity.hpBar.group.position.copy(entity.position).add(new THREE.Vector3(0, top, 0));
      entity.hpBar.group.lookAt(this.camera.position);
      entity.hpBar.fill.scale.x = Math.max(0.02, Math.max(0, entity.hp) / entity.maxHp);
      entity.hpBar.fill.position.x = -0.81 * (1 - Math.max(0, entity.hp) / entity.maxHp);

      if (entity.kind === ENTITY_KIND.BUILDING && !entity.completed) {
        const progress = 1 - entity.buildRemaining / entity.buildTime;
        entity.visual.position.y = entity.position.y - (1 - progress) * 2.4;
        entity.hpBar.fill.material.color.setHex(0xfacc15);
        entity.hpBar.fill.scale.x = Math.max(0.02, progress);
      } else if ((entity.disabledUntil || 0) > this.elapsed) {
        entity.hpBar.fill.material.color.setHex(0x38bdf8);
      } else {
        if (entity.kind === ENTITY_KIND.BUILDING) {
          entity.visual.position.y = entity.position.y;
        }
        entity.hpBar.fill.material.color.setHex(entity.owner === OWNER.PLAYER ? 0x22c55e : 0xef4444);
      }

      const ground = this.terrain.heightAt(entity.position.x, entity.position.z);
      entity.selectionRing.position.set(entity.position.x, ground + 0.08, entity.position.z);

      if (entity.rankIcon) {
        entity.rankIcon.position.copy(entity.position).add(new THREE.Vector3(0, entity.category === 'air' ? 2.8 : 2.2, 0));
        entity.rankIcon.lookAt(this.camera.position);
        entity.rankIcon.material.color.setHex(entity.veteranLevel === 3 ? 0x67e8f9 : 0xfacc15);
      }

      if ((entity.cloakedUntil || 0) > this.elapsed) {
        entity.visual.traverse((node) => {
          if (node.material) {
            node.material.opacity = 0.32;
            node.material.transparent = true;
          }
        });
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
      buildOptions: this.playerData.buildOrder.map((id) => this.playerData.buildings[id]),
      productionOptions: this.getProductionOptions(),
      superweapons: this.getSuperweaponState(),
      minimap: this.getMinimapState(),
      tunnelLines: this.getTunnelLines(),
      debug: this.getDebugState(),
      cursorMode: this.cursorMode,
      setup: {
        playerFactionId: this.options.playerFactionId,
        aiFactionId: this.options.aiFactionId,
        mapId: this.options.mapId,
        difficultyId: this.options.difficultyId,
      },
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
      abilitySlots: entity.abilitySlots || [],
      abilityCooldowns: entity.abilityCooldowns || {},
      disabled: (entity.disabledUntil || 0) > this.elapsed,
      shield: entity.shieldRemaining || 0,
      inTunnel: Boolean(entity.inTunnel),
    };
  }

  getProductionOptions() {
    const building = this.getSelected().find((entity) => entity.kind === ENTITY_KIND.BUILDING && entity.completed);
    if (!building) {
      return [];
    }
    return (this.playerData.buildings[building.defId].trains || []).map((id) => this.playerData.units[id]);
  }

  getSuperweaponState() {
    return Object.values(SUPERWEAPONS).map((weapon) => ({
      ...weapon,
      cooldownRemaining: this.superweaponCooldowns[OWNER.PLAYER][weapon.id] || 0,
      affordable: this.resources[OWNER.PLAYER].darkMatter >= weapon.cost,
    }));
  }

  getMinimapState() {
    return [...this.entities.values()]
      .filter((entity) => entity.hp > 0 && !entity.inTunnel && (entity.owner === OWNER.PLAYER || this.fog.isVisible(entity.position)))
      .map((entity) => ({
        id: entity.id,
        owner: entity.owner,
        kind: entity.kind,
        role: entity.role,
        x: (entity.position.x + this.terrain.half) / this.terrain.size,
        z: (entity.position.z + this.terrain.half) / this.terrain.size,
      }));
  }

  getTunnelLines() {
    return [OWNER.PLAYER, OWNER.AI].flatMap((owner) => {
      const entrances = this.getTunnelEntrances(owner);
      const lines = [];
      for (let index = 0; index < entrances.length - 1; index += 1) {
        lines.push({
          owner,
          x1: (entrances[index].position.x + this.terrain.half) / this.terrain.size,
          z1: (entrances[index].position.z + this.terrain.half) / this.terrain.size,
          x2: (entrances[index + 1].position.x + this.terrain.half) / this.terrain.size,
          z2: (entrances[index + 1].position.z + this.terrain.half) / this.terrain.size,
        });
      }
      return lines;
    });
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
      difficulty: this.difficulty.name,
      map: this.map.name,
      multiplayer: this.multiplayer,
      combatActivity: this.activeCombatCount,
    };
  }

  getSnapshot() {
    const entities = [...this.entities.values()].filter((entity) => entity.hp > 0);
    return {
      elapsed: this.elapsed,
      matchEnded: this.matchEnded,
      matchResult: this.matchResult,
      options: this.options,
      resources: structuredClone(this.resources),
      income: structuredClone(this.income),
      playerUnits: entities.filter((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.UNIT).length,
      aiUnits: entities.filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.UNIT).length,
      playerBuildings: entities.filter((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.BUILDING).length,
      aiBuildings: entities.filter((entity) => entity.owner === OWNER.AI && entity.kind === ENTITY_KIND.BUILDING).length,
      playerHqAlive: Boolean(this.findBuilding(OWNER.PLAYER, this.playerData.roles.hq)),
      aiHqAlive: Boolean(this.findBuilding(OWNER.AI, this.aiData.roles.hq)),
      superweapons: this.getSuperweaponState(),
      tunnelLines: this.getTunnelLines(),
      warnings: this.warnings.slice(-8),
    };
  }

  exportSave(label = 'manual') {
    return {
      version: '1.0.0-beta',
      label,
      savedAt: new Date().toISOString(),
      elapsed: this.elapsed,
      nextEntityId: this.nextEntityId,
      options: this.options,
      settings: this.settings,
      resources: structuredClone(this.resources),
      income: structuredClone(this.income),
      superweaponCooldowns: structuredClone(this.superweaponCooldowns),
      ai: structuredClone(this.ai),
      fog: this.fog.serialize(),
      entities: [...this.entities.values()].filter((entity) => entity.hp > 0).map((entity) => this.serializeForSave(entity)),
    };
  }

  loadSave(save) {
    if (!save?.entities || !save?.options) {
      throw new Error('Invalid save file');
    }
    this.clearEntities();
    this.elapsed = Number(save.elapsed || 0);
    this.nextEntityId = Number(save.nextEntityId || 1);
    this.resources = structuredClone(save.resources || this.resources);
    this.income = structuredClone(save.income || this.income);
    this.superweaponCooldowns = structuredClone(save.superweaponCooldowns || this.superweaponCooldowns);
    this.ai = structuredClone(save.ai || this.createAiState());
    this.setSettings({ ...this.settings, ...(save.settings || {}) });
    for (const saved of save.entities) {
      this.restoreEntity(saved);
    }
    this.fog.load(save.fog);
    this.updateVisibility();
    this.updateHud();
    return true;
  }

  serializeForSave(entity) {
    return {
      id: entity.id,
      kind: entity.kind,
      defId: entity.defId,
      owner: entity.owner,
      factionId: entity.factionId,
      position: entity.position.toArray(),
      hp: entity.hp,
      maxHp: entity.maxHp,
      completed: entity.completed ?? true,
      buildRemaining: entity.buildRemaining || 0,
      buildTime: entity.buildTime || 0,
      productionQueue: structuredClone(entity.productionQueue || []),
      rallyPoint: entity.rallyPoint?.toArray(),
      kills: entity.kills || 0,
      veteranLevel: entity.veteranLevel || 0,
      abilityCooldowns: structuredClone(entity.abilityCooldowns || {}),
      fireTimer: entity.fireTimer || 0,
      disabledUntil: entity.disabledUntil || 0,
      shieldUntil: entity.shieldUntil || 0,
      shieldRemaining: entity.shieldRemaining || 0,
      cloakedUntil: entity.cloakedUntil || 0,
    };
  }

  restoreEntity(saved) {
    const position = new THREE.Vector3().fromArray(saved.position);
    const entity =
      saved.kind === ENTITY_KIND.BUILDING
        ? this.spawnBuilding(saved.defId, saved.owner, position, { completed: saved.completed })
        : this.spawnUnit(saved.defId, saved.owner, position);
    if (!entity) {
      return null;
    }
    this.entities.delete(entity.id);
    entity.id = saved.id;
    entity.visual.userData.entityId = entity.id;
    entity.visual.traverse((node) => {
      node.userData.entityId = entity.id;
    });
    entity.hp = saved.hp;
    entity.maxHp = saved.maxHp || entity.maxHp;
    entity.completed = saved.completed ?? entity.completed;
    entity.buildRemaining = saved.buildRemaining || 0;
    entity.productionQueue = structuredClone(saved.productionQueue || []);
    if (saved.rallyPoint && entity.rallyPoint) {
      entity.rallyPoint.fromArray(saved.rallyPoint);
    }
    entity.kills = saved.kills || 0;
    entity.veteranLevel = saved.veteranLevel || 0;
    entity.abilityCooldowns = { ...entity.abilityCooldowns, ...(saved.abilityCooldowns || {}) };
    entity.fireTimer = saved.fireTimer || 0;
    entity.disabledUntil = saved.disabledUntil || 0;
    entity.shieldUntil = saved.shieldUntil || 0;
    entity.shieldRemaining = saved.shieldRemaining || 0;
    entity.cloakedUntil = saved.cloakedUntil || 0;
    this.entities.set(entity.id, entity);
    return entity;
  }

  clearEntities() {
    for (const entity of this.entities.values()) {
      this.scene.remove(entity.visual);
      this.scene.remove(entity.hpBar?.group);
      this.scene.remove(entity.selectionRing);
      if (entity.rankIcon) {
        this.scene.remove(entity.rankIcon);
      }
    }
    for (const mesh of this.rubble) {
      this.scene.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.rubble = [];
    this.entities.clear();
    this.pickables = [];
    this.selectedIds.clear();
    this.particles.clear();
  }

  setSettings(settings = {}) {
    this.settings = { ...this.settings, ...settings };
    const quality = this.settings.graphicsQuality || 'high';
    const presets = {
      low: { pixelRatio: 1, particles: 220, shadows: false },
      medium: { pixelRatio: 1.4, particles: 420, shadows: true },
      high: { pixelRatio: Math.min(window.devicePixelRatio, 2), particles: 760, shadows: true },
    };
    const preset = presets[quality] || presets.high;
    if (this.renderer) {
      this.renderer.setPixelRatio(preset.pixelRatio);
      this.renderer.shadowMap.enabled = preset.shadows;
      this.resize();
    }
    this.particles?.setBudget(preset.particles);
    this.instancedLod?.setQuality(quality);
    this.audio?.setSettings(this.settings);
  }

  setMultiplayerState(state = {}) {
    this.multiplayer = { ...this.multiplayer, ...state };
  }

  runAcceptanceProbe() {
    return this.runMilestoneProbe(false);
  }

  runV03AcceptanceProbe() {
    return this.runMilestoneProbe(true);
  }

  runV10AcceptanceProbe() {
    const checks = [];
    const assert = (name, condition, detail = '') => checks.push({ name, pass: Boolean(condition), detail });
    this.setSettings({ graphicsQuality: 'low', musicVolume: 0.2, sfxVolume: 0.2 });
    assert('settings apply', this.settings.graphicsQuality === 'low');

    const save = this.exportSave('probe');
    assert('save export has entities', save.entities.length > 0);
    const beforeUnits = this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT);
    this.loadSave(save);
    assert('save load restores unit count', this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT) === beforeUnits);

    const baseline = this.exportSave('pre-performance');
    const unitIds = this.playerData.faction.units.map((unit) => unit.id);
    const start = performance.now();
    for (let index = 0; index < 500; index += 1) {
      const x = -42 + (index % 40) * 1.2;
      const z = -12 + Math.floor(index / 40) * 1.2;
      this.spawnUnit(unitIds[index % unitIds.length], OWNER.PLAYER, new THREE.Vector3(x, 0, z));
    }
    this.simulateSeconds(2, 1 / 30);
    const elapsedMs = performance.now() - start;
    assert('500 unit performance population', this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT) >= beforeUnits + 500);
    assert('500 unit simulation budget', elapsedMs < 9000, `${Math.round(elapsedMs)}ms`);
    assert('particle budget capped', this.particles.budget <= 760);
    this.loadSave(baseline);

    return {
      passed: checks.every((check) => check.pass),
      checks,
      snapshot: this.getSnapshot(),
    };
  }

  runMilestoneProbe(includeV03) {
    const checks = [];
    const assert = (name, condition, detail = '') => checks.push({ name, pass: Boolean(condition), detail });
    this.updateVisibility();
    this.updateResources(1);
    const hq = this.findBuilding(OWNER.PLAYER, this.playerData.roles.hq);
    assert('player HQ exists', hq?.completed === true);
    const startingUnits = this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT);
    this.selectEntities([hq.id]);
    this.queueUnit(this.playerData.buildings[hq.defId].trains[0]);
    assert('HQ queues starter unit', hq.productionQueue.length === 1);
    this.simulateSeconds(12);
    assert('queued unit spawns', this.countEntities(OWNER.PLAYER, ENTITY_KIND.UNIT) > startingUnits);

    const productionSpot = this.findBuildSpotForProbe(this.playerData.roles.infantry, OWNER.PLAYER, hq.position);
    assert('valid production build spot found', Boolean(productionSpot));
    const production = this.placeBuildingForProbe(this.playerData.roles.infantry, OWNER.PLAYER, productionSpot);
    this.simulateSeconds(this.playerData.buildings[this.playerData.roles.infantry].buildTime + 1);
    assert('construction completes', production.completed === true);

    const trainId = this.playerData.buildings[production.defId].trains[0];
    const beforeUnit = this.countUnitsByDef(OWNER.PLAYER, trainId);
    this.selectEntities([production.id]);
    this.queueUnit(trainId);
    this.simulateSeconds(this.playerData.units[trainId].buildTime + 1);
    assert('production building trains unit', this.countUnitsByDef(OWNER.PLAYER, trainId) > beforeUnit);

    const mover = [...this.entities.values()].find((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.UNIT && entity.hp > 0);
    const startPosition = mover.position.clone();
    this.selectEntities([mover.id]);
    this.issueMove(startPosition.clone().add(new THREE.Vector3(6, 0, -4)), { attackMove: false });
    this.simulateSeconds(2.5);
    assert('move order changes unit position', mover.position.distanceTo(startPosition) > 1);

    const targetUnitId = this.aiData.faction.units[0].id;
    const combatTarget = this.spawnUnit(targetUnitId, OWNER.AI, mover.position.clone().add(new THREE.Vector3(2.4, 0, 0)));
    combatTarget.hp = 1;
    mover.kills = 4;
    this.selectEntities([mover.id]);
    this.issueAttack(combatTarget);
    this.simulateSeconds(2);
    assert('combat destroys target', combatTarget.hp <= 0);
    assert('veterancy level gained', mover.veteranLevel >= 1);

    const centerScout = this.spawnUnit(this.playerData.faction.units[0].id, OWNER.PLAYER, new THREE.Vector3(2, 0, 2));
    const siphonSpot = this.findBuildSpotForProbe(this.playerData.roles.darkMatter, OWNER.PLAYER, centerScout.position);
    assert('valid dark matter siphon spot found', Boolean(siphonSpot));
    const siphon = this.placeBuildingForProbe(this.playerData.roles.darkMatter, OWNER.PLAYER, siphonSpot, true);
    const darkBefore = this.resources[OWNER.PLAYER].darkMatter;
    this.simulateSeconds(6);
    assert('dark matter income works', siphon.completed && this.resources[OWNER.PLAYER].darkMatter > darkBefore);

    const aiBuildingsBefore = this.countEntities(OWNER.AI, ENTITY_KIND.BUILDING);
    this.simulateSeconds(95);
    assert('AI builds economy/production', this.countEntities(OWNER.AI, ENTITY_KIND.BUILDING) > aiBuildingsBefore);

    if (includeV03) {
      this.resources[OWNER.PLAYER].metal += 3000;
      this.resources[OWNER.PLAYER].energy += 3000;
      this.resources[OWNER.PLAYER].darkMatter += 6;
      const tunnelA = this.placeBuildingForProbe(this.playerData.roles.tunnel, OWNER.PLAYER, this.findBuildSpotForProbe(this.playerData.roles.tunnel, OWNER.PLAYER, hq.position), true);
      const tunnelB = this.placeBuildingForProbe(
        this.playerData.roles.tunnel,
        OWNER.PLAYER,
        this.findBuildSpotForProbe(this.playerData.roles.tunnel, OWNER.PLAYER, this.terrain.tunnelAnchors.at(-1)),
        true,
      );
      const tunnelMover =
        mover.hp > 0
          ? mover
          : this.spawnUnit(this.playerData.faction.units[0].id, OWNER.PLAYER, tunnelA.position.clone().add(new THREE.Vector3(1.5, 0, 1.5)));
      this.selectEntities([tunnelMover.id]);
      this.issueTunnelEnter(tunnelA, tunnelB);
      assert('unit enters tunnel', tunnelMover.inTunnel === true);
      this.simulateSeconds(10);
      assert(
        'unit exits tunnel network',
        tunnelMover.inTunnel === false && tunnelMover.hp > 0 && tunnelMover.position.distanceTo(tunnelB.position) < 8,
        `${tunnelMover.inTunnel}:${tunnelMover.hp.toFixed(1)}:${(tunnelMover.tunnelRemaining ?? 0).toFixed(2)}:${tunnelMover.position.distanceTo(tunnelB.position).toFixed(2)}`,
      );

      const abilityUnit = this.spawnAbilityProbeUnit(OWNER.PLAYER);
      assert('ability unit available', Boolean(abilityUnit));
      if (abilityUnit) {
        const abilityId = abilityUnit.abilitySlots[0];
        abilityUnit.abilityCooldowns[abilityId] = 0;
        const used = this.useAbility(abilityUnit, abilityId);
        assert(
          'active ability fires',
          used && abilityUnit.abilityCooldowns[abilityId] > 0,
          `${abilityUnit.defId}:${abilityId}:${used}:${abilityUnit.abilityCooldowns[abilityId]}`,
        );
      }

      const enemyBlob = this.spawnUnit(targetUnitId, OWNER.AI, new THREE.Vector3(0, 0, 0));
      const fired = this.fireSuperweaponAt('kineticStrike', enemyBlob.position.clone(), OWNER.PLAYER);
      assert('superweapon fires', fired);
      assert('superweapon damages enemies', enemyBlob.hp <= 0);
      assert('tunnel minimap lines exist', this.getTunnelLines().length > 0);
    }

    const aiHq = this.findBuilding(OWNER.AI, this.aiData.roles.hq);
    aiHq.hp = 1;
    const victoryAttacker =
      [...this.entities.values()].find((entity) => entity.owner === OWNER.PLAYER && entity.kind === ENTITY_KIND.UNIT && entity.hp > 0 && !entity.inTunnel) ||
      this.spawnUnit(this.playerData.faction.units[0].id, OWNER.PLAYER, hq.position.clone().add(new THREE.Vector3(3, 0, 3)));
    this.dealDamage(victoryAttacker, aiHq);
    assert('enemy HQ destruction wins match', this.matchEnded && this.matchResult === 'victory');

    return {
      passed: checks.every((check) => check.pass),
      checks,
      snapshot: this.getSnapshot(),
    };
  }

  spawnAbilityProbeUnit(owner) {
    const data = this.dataForOwner(owner);
    const def = Object.values(data.units).find((unit) => unit.abilitySlots?.length);
    if (!def) {
      return null;
    }
    return this.spawnUnit(def.id, owner, this.findBuilding(owner, data.roles.hq).position.clone().add(new THREE.Vector3(3, 0, 3)));
  }

  simulateSeconds(seconds, step = 0.2) {
    const iterations = Math.ceil(seconds / step);
    for (let index = 0; index < iterations && !this.matchEnded; index += 1) {
      this.update(Math.min(step, seconds - index * step));
    }
  }

  findBuildSpotForProbe(buildingId, owner, origin) {
    const def = this.dataForOwner(owner).buildings[buildingId];
    const searchCenters =
      def.role === 'metal'
        ? this.terrain.metalDeposits
        : def.role === 'darkMatter'
          ? this.terrain.darkMatterNodes
          : def.role === 'tunnel'
            ? this.terrain.tunnelAnchors
            : [origin];
    for (const center of searchCenters) {
      for (let radius = 0; radius <= 20; radius += this.terrain.cellSize) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const candidate = this.terrain.snapPosition(center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)));
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
    const def = this.dataForOwner(owner).buildings[buildingId];
    if (!position || !this.canPlaceBuilding(buildingId, position, owner)) {
      throw new Error(`No valid probe placement for ${buildingId}`);
    }
    this.payCost(owner, def.cost);
    return this.spawnBuilding(buildingId, owner, position, { completed });
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
          if (entity && entity.hp > 0 && !entity.inTunnel && (entity.owner === OWNER.PLAYER || this.fog.isVisible(entity.position))) {
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
    return {
      left: Math.min(drag.startX, drag.currentX),
      top: Math.min(drag.startY, drag.currentY),
      width: Math.abs(drag.currentX - drag.startX),
      height: Math.abs(drag.currentY - drag.startY),
    };
  }

  formationOffset(index, total) {
    const columns = Math.ceil(Math.sqrt(total));
    const x = (index % columns) - columns / 2;
    const z = Math.floor(index / columns) - columns / 2;
    return new THREE.Vector3(x * 1.4, 0, z * 1.4);
  }

  nearestDeposit(base, owner) {
    return this.terrain.metalDeposits
      .filter((node) => (owner === OWNER.PLAYER ? node.x <= 4 : node.x >= -4))
      .sort((a, b) => a.distanceTo(base) - b.distanceTo(base))[0]
      .clone();
  }

  findNearbyBuilding(owner, defId, position, radius) {
    return [...this.entities.values()].find((entity) => entity.owner === owner && entity.defId === defId && entity.hp > 0 && entity.position.distanceTo(position) < radius);
  }

  findBuilding(owner, defId) {
    return [...this.entities.values()].find((entity) => entity.owner === owner && entity.defId === defId && entity.hp > 0);
  }

  findRoleBuilding(owner, role) {
    return [...this.entities.values()].find((entity) => entity.owner === owner && entity.role === role && entity.hp > 0);
  }

  getTunnelEntrances(owner) {
    return [...this.entities.values()].filter((entity) => entity.owner === owner && entity.role === 'tunnel' && entity.completed && entity.hp > 0);
  }

  tryPlaceBuildingForAI(id, position) {
    const def = this.aiData.buildings[id];
    const snapped = this.terrain.snapPosition(position);
    if (def.role === 'metal') {
      snapped.copy(this.nearestDeposit(this.findBuilding(OWNER.AI, this.aiData.roles.hq).position, OWNER.AI));
    }
    if (def.role === 'tunnel') {
      const anchor = this.terrain.tunnelAnchors.find((node) => node.x > 0) || this.terrain.tunnelAnchors[0];
      snapped.copy(this.terrain.snapPosition(anchor));
    }
    if (!this.canPlaceBuilding(id, snapped, OWNER.AI) || !this.canAfford(OWNER.AI, def.cost)) {
      return false;
    }
    this.payCost(OWNER.AI, def.cost);
    this.spawnBuilding(id, OWNER.AI, snapped, { completed: false });
    return true;
  }

  getProductionSpeed(entity) {
    const netEnergy = this.income[entity.owner].energy;
    return netEnergy < 0 && entity.energyUse > 0 ? 0.5 : 1;
  }

  canAfford(owner, cost = {}) {
    return RESOURCE_KEYS.every((key) => (this.resources[owner][key] ?? 0) >= (cost[key] ?? 0));
  }

  payCost(owner, cost = {}) {
    for (const key of RESOURCE_KEYS) {
      this.resources[owner][key] -= cost[key] ?? 0;
    }
  }

  countEntities(owner, kind) {
    return [...this.entities.values()].filter((entity) => entity.owner === owner && entity.kind === kind && entity.hp > 0).length;
  }

  countUnitsByDef(owner, defId) {
    return [...this.entities.values()].filter((entity) => entity.owner === owner && entity.kind === ENTITY_KIND.UNIT && entity.defId === defId && entity.hp > 0).length;
  }

  dataForOwner(owner) {
    return owner === OWNER.PLAYER ? this.playerData : this.aiData;
  }

  colorForOwner(owner) {
    const data = this.dataForOwner(owner);
    return owner === OWNER.PLAYER ? data.palette.player : data.palette.ai;
  }

  enemiesInRadius(position, radius, owner) {
    return this.entitiesInRadius(position, radius).filter((entity) => entity.owner !== owner);
  }

  entitiesInRadius(position, radius) {
    return [...this.entities.values()].filter((entity) => entity.hp > 0 && !entity.inTunnel && entity.position.distanceTo(position) <= radius);
  }

  damageEntitiesInRadius(position, radius, owner, amount) {
    for (const entity of this.enemiesInRadius(position, radius, owner)) {
      this.applyDamage(null, entity, amount);
    }
  }

  randomPassablePosition(origin = null, radius = this.terrain.half - 6) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = origin ? Math.random() * radius : Math.random() * (this.terrain.half - 6);
      const center = origin || new THREE.Vector3(0, 0, 0);
      const candidate = new THREE.Vector3(center.x + Math.cos(angle) * distance, 0, center.z + Math.sin(angle) * distance);
      candidate.y = this.terrain.heightAt(candidate.x, candidate.z);
      if (this.terrain.isPassable(candidate.x, candidate.z)) {
        return candidate;
      }
    }
    return this.terrain.placeOnGround(new THREE.Vector3(0, 0, 0));
  }

  teleportEntity(entity, position) {
    entity.position.copy(this.terrain.placeOnGround(position));
    if (entity.category === 'air') {
      entity.position.y += 4;
    }
    entity.visual.position.copy(entity.position);
    entity.order = null;
    this.particles.burst(entity.position, 0xa855f7, 8);
  }

  enterBurrow(entity, destination) {
    entity.visual.visible = false;
    entity.hpBar.group.visible = false;
    entity.inTunnel = true;
    entity.tunnelRemaining = 2.5;
    entity.tunnelExitPosition = destination.clone();
    const originalExit = this.exitTunnel.bind(this);
    entity.customTunnelExit = () => {
      entity.inTunnel = false;
      this.teleportEntity(entity, entity.tunnelExitPosition);
      delete entity.customTunnelExit;
    };
    this.exitTunnel = (unit) => {
      if (unit === entity && unit.customTunnelExit) {
        unit.customTunnelExit();
      } else {
        originalExit(unit);
      }
    };
  }

  addCraterMarker(position, radius) {
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 36),
      new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(this.terrain.placeOnGround(position, 0.06));
    this.scene.add(marker);
  }

  addRubble(entity) {
    const color = entity.factionId === 'vorreth' ? 0x31572c : entity.factionId === 'ironveil' ? 0x334155 : 0x64748b;
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(entity.footprint * 0.75, 0.28, entity.footprint * 0.75),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: entity.factionId === 'vorreth' ? 0.02 : 0.18 }),
    );
    rubble.position.copy(this.terrain.placeOnGround(entity.position, 0.08));
    rubble.rotation.y = Math.random() * Math.PI;
    rubble.castShadow = true;
    rubble.receiveShadow = true;
    this.rubble.push(rubble);
    this.scene.add(rubble);
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
    this.hooks.onGameOver?.({ result, elapsed: this.elapsed });
  }

  worldToScreen(position) {
    const vector = position.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((vector.x + 1) / 2) * rect.width + rect.left,
      y: ((-vector.y + 1) / 2) * rect.height + rect.top,
    };
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
