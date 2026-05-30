import synthekon from '../data/factions/synthekon.json';
import vorreth from '../data/factions/vorreth.json';
import ironveil from '../data/factions/ironveil.json';

export const OWNER = {
  PLAYER: 'player',
  AI: 'ai',
};

export const ENTITY_KIND = {
  UNIT: 'unit',
  BUILDING: 'building',
};

export const FACTION_REGISTRY = {
  synthekon: {
    source: synthekon,
    palette: {
      player: 0x7dd3fc,
      ai: 0xf43f5e,
      glow: 0x67e8f9,
      accent: 0xe2e8f0,
    },
    roles: {
      hq: 'synthekon-hq',
      power: 'power-conduit',
      metal: 'metal-harvester',
      infantry: 'android-foundry',
      vehicle: 'vehicle-assembly',
      air: 'aero-bay',
      tech: 'research-nexus',
      turret: 'defense-turret',
      darkMatter: 'dark-matter-siphon',
      tunnel: 'synthekon-tunnel-entrance',
    },
    abilityUnits: {
      'heavy-mech': ['stomp'],
      gunship: ['cloak'],
    },
  },
  vorreth: {
    source: vorreth,
    palette: {
      player: 0x84cc16,
      ai: 0xa855f7,
      glow: 0xc084fc,
      accent: 0x4ade80,
    },
    roles: {
      hq: 'vorreth-core',
      power: 'bio-reactor',
      metal: 'mineral-tendril',
      infantry: 'spawning-pit',
      vehicle: 'growth-chamber',
      air: 'spore-launch-pad',
      tech: 'evolution-shrine',
      turret: 'thorn-barrier',
      darkMatter: 'dark-matter-node-tap',
      tunnel: 'vorreth-tunnel-entrance',
    },
    abilityUnits: {
      'colossal-worm': ['burrow'],
      'hive-flyer': ['spawn-brood'],
    },
  },
  ironveil: {
    source: ironveil,
    palette: {
      player: 0xf97316,
      ai: 0x38bdf8,
      glow: 0xf59e0b,
      accent: 0x334155,
    },
    roles: {
      hq: 'ironveil-command',
      power: 'power-station',
      metal: 'ore-processor',
      infantry: 'infantry-barracks',
      vehicle: 'tank-foundry',
      air: 'vtol-hangar',
      tech: 'tech-lab',
      turret: 'missile-tower',
      darkMatter: 'dark-matter-extractor',
      tunnel: 'ironveil-tunnel-entrance',
    },
    abilityUnits: {
      'emp-drone': ['emp-pulse'],
      'siege-walker': ['shield-burst'],
    },
  },
};

export const MAPS = [
  {
    id: 'fractured-frontier',
    name: 'Fractured Frontier',
    description: 'Balanced hills with a contested dark matter basin.',
    terrainSeed: 1,
    waterLevel: -0.42,
    playerBase: [-32, 28],
    aiBase: [32, -28],
    metalDeposits: [
      [-30, -19],
      [-24, 17],
      [-12, -31],
      [24, -18],
      [30, 19],
      [12, 31],
    ],
    darkMatterNodes: [
      [0, 0],
      [6, 4],
    ],
    tunnelAnchors: [
      [-34, 24],
      [34, -24],
      [-6, -30],
      [6, 30],
    ],
  },
  {
    id: 'ember-delta',
    name: 'Ember Delta',
    description: 'Wide metal fields split by shallow water and long attack lanes.',
    terrainSeed: 2,
    waterLevel: -0.2,
    playerBase: [-34, -26],
    aiBase: [34, 26],
    metalDeposits: [
      [-36, -12],
      [-22, -34],
      [-10, 20],
      [36, 12],
      [22, 34],
      [10, -20],
      [0, 36],
      [0, -36],
    ],
    darkMatterNodes: [[0, 0]],
    tunnelAnchors: [
      [-30, -30],
      [30, 30],
      [-28, 24],
      [28, -24],
    ],
  },
  {
    id: 'void-crater',
    name: 'Void Crater',
    description: 'A central crater with three dark matter nodes and risky ramps.',
    terrainSeed: 3,
    waterLevel: -0.72,
    playerBase: [-36, 20],
    aiBase: [36, -20],
    metalDeposits: [
      [-38, 4],
      [-26, 34],
      [-18, -28],
      [38, -4],
      [26, -34],
      [18, 28],
    ],
    darkMatterNodes: [
      [-5, 0],
      [5, 0],
      [0, 7],
    ],
    tunnelAnchors: [
      [-32, 20],
      [32, -20],
      [-18, -18],
      [18, 18],
    ],
  },
];

export const AI_DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Easy',
    thinkInterval: 4,
    firstAttack: 360,
    attackInterval: 95,
    trainInterval: 17,
    waveSize: 8,
    expansionDelay: 90,
    rush: false,
    usesAbilities: false,
    targetResources: false,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    thinkInterval: 3,
    firstAttack: 240,
    attackInterval: 240,
    trainInterval: 11,
    waveSize: 14,
    expansionDelay: 55,
    rush: false,
    usesAbilities: true,
    targetResources: false,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    thinkInterval: 2,
    firstAttack: 105,
    attackInterval: 165,
    trainInterval: 7,
    waveSize: 20,
    expansionDelay: 35,
    rush: true,
    usesAbilities: true,
    targetResources: true,
  },
};

export const SUPERWEAPONS = {
  blackHole: {
    id: 'blackHole',
    name: 'Black Hole',
    cost: 1.5,
    cooldown: 90,
    radius: 13,
    duration: 8,
  },
  empStorm: {
    id: 'empStorm',
    name: 'EMP Storm',
    cost: 1,
    cooldown: 75,
    radius: 14,
    duration: 20,
  },
  nanoSwarm: {
    id: 'nanoSwarm',
    name: 'Nano Swarm',
    cost: 1.25,
    cooldown: 80,
    radius: 12,
    duration: 15,
  },
  kineticStrike: {
    id: 'kineticStrike',
    name: 'Kinetic Strike',
    cost: 1.75,
    cooldown: 105,
    radius: 7,
    duration: 1,
  },
  voidRift: {
    id: 'voidRift',
    name: 'Void Rift',
    cost: 1.4,
    cooldown: 95,
    radius: 10,
    duration: 4,
  },
};

export const ABILITIES = {
  stomp: { id: 'stomp', name: 'Stomp', cooldown: 18, range: 5 },
  cloak: { id: 'cloak', name: 'Cloak', cooldown: 34, duration: 10 },
  burrow: { id: 'burrow', name: 'Burrow', cooldown: 38, range: 24 },
  'spawn-brood': { id: 'spawn-brood', name: 'Spawn Brood', cooldown: 32, duration: 42 },
  'emp-pulse': { id: 'emp-pulse', name: 'EMP Pulse', cooldown: 24, duration: 8, range: 9 },
  'shield-burst': { id: 'shield-burst', name: 'Shield Burst', cooldown: 30, duration: 6 },
};

export const WEAPON_MULTIPLIERS = {
  light: { light: 1.15, vehicle: 0.65, heavy: 0.55, air: 0.85, structure: 0.45 },
  antiArmor: { light: 0.8, vehicle: 1.35, heavy: 1.2, air: 0.65, structure: 0.8 },
  antiAir: { light: 0.7, vehicle: 0.5, heavy: 0.5, air: 2, structure: 0.35 },
  siege: { light: 0.65, vehicle: 1.1, heavy: 1.25, air: 0.2, structure: 1.65 },
  bioAcid: { light: 1.2, vehicle: 1.05, heavy: 0.9, air: 0.75, structure: 0.85 },
  energy: { light: 1, vehicle: 1.05, heavy: 1.05, air: 1, structure: 0.95 },
};

export const STARTING_RESOURCES = {
  metal: 1400,
  energy: 650,
  darkMatter: 0,
};

const CATEGORY_META = {
  infantry: { armor: 'light', weapon: 'light', range: 5, cooldown: 0.95 },
  vehicle: { armor: 'vehicle', weapon: 'antiArmor', range: 6.5, cooldown: 1.35 },
  air: { armor: 'air', weapon: 'antiArmor', range: 7, cooldown: 1.2, canAttackAir: true },
  mech: { armor: 'heavy', weapon: 'siege', range: 7.5, cooldown: 1.8 },
};

const UNIT_OVERRIDES = {
  'scout-drone': { weapon: 'light', range: 6, cooldown: 0.9, canAttackAir: true },
  'rifle-android': { weapon: 'light', range: 5, cooldown: 0.95 },
  'android-swarm': { weapon: 'light', range: 3.8, cooldown: 0.65 },
  'rail-cannon-vehicle': { weapon: 'siege', range: 9.5, cooldown: 2.4 },
  'titan-mech': { weapon: 'siege', range: 8, cooldown: 2.2 },
  'acid-spitter': { weapon: 'bioAcid', range: 6.2, cooldown: 1.1 },
  'hive-flyer': { weapon: 'bioAcid', range: 6.7, cooldown: 1.15, canAttackAir: true },
  'void-leech': { weapon: 'energy', range: 7.5, cooldown: 1.25, canAttackAir: true },
  'colossal-worm': { weapon: 'siege', range: 3.6, cooldown: 1.7 },
  'emp-drone': { weapon: 'antiAir', range: 6.5, cooldown: 1.4, canAttackAir: true },
  'laser-trooper': { weapon: 'energy', range: 5.8, cooldown: 0.9 },
  'plasma-tank': { weapon: 'energy', range: 6.8, cooldown: 1.35 },
  'attack-vtol': { weapon: 'antiArmor', range: 7, cooldown: 1.15, canAttackAir: true },
  'railgun-platform': { weapon: 'siege', range: 9.5, cooldown: 2.3 },
};

const BUILDING_ROLE_META = {
  hq: { armor: 'structure', footprint: 4, zoneControl: 18, energyUse: 0 },
  power: { armor: 'structure', footprint: 3, zoneControl: 9, energyUse: 0 },
  metal: { armor: 'structure', footprint: 3, zoneControl: 9, energyUse: 0 },
  infantry: { armor: 'structure', footprint: 4, zoneControl: 12, energyUse: 6 },
  vehicle: { armor: 'structure', footprint: 5, zoneControl: 12, energyUse: 8 },
  air: { armor: 'structure', footprint: 4, zoneControl: 12, energyUse: 8 },
  tech: { armor: 'structure', footprint: 4, zoneControl: 10, energyUse: 10 },
  turret: {
    armor: 'structure',
    footprint: 2,
    zoneControl: 10,
    weapon: 'antiArmor',
    range: 9,
    damage: 32,
    cooldown: 1.3,
    energyUse: 2,
  },
  darkMatter: { armor: 'structure', footprint: 3, zoneControl: 9, energyUse: 12 },
  tunnel: { armor: 'structure', footprint: 3, zoneControl: 10, energyUse: 2 },
};

export function getFactionData(factionId = 'synthekon') {
  const config = FACTION_REGISTRY[factionId] || FACTION_REGISTRY.synthekon;
  const source = config.source;
  const units = Object.fromEntries(
    source.units.map((unit) => [
      unit.id,
      {
        ...unit,
        ...CATEGORY_META[unit.category],
        ...UNIT_OVERRIDES[unit.id],
        abilitySlots: config.abilityUnits[unit.id] || [],
        maxHp: unit.hp,
      },
    ]),
  );
  const buildingsWithTunnel = [...source.buildings, createTunnelBuilding(source, config.roles.tunnel)];
  const buildings = Object.fromEntries(
    buildingsWithTunnel.map((building) => {
      const role = roleForBuilding(config.roles, building.id);
      return [
        building.id,
        {
          ...building,
          ...BUILDING_ROLE_META[role],
          role,
          trains: trainsForRole(role, source.units),
          maxHp: building.hp,
        },
      ];
    }),
  );

  return {
    faction: source,
    factionId: source.id,
    palette: config.palette,
    roles: config.roles,
    buildOrder: buildOrderFor(config.roles),
    units,
    buildings,
  };
}

export function getAllFactionSummaries() {
  return Object.values(FACTION_REGISTRY).map(({ source, palette }) => ({
    id: source.id,
    name: source.name,
    description: source.description,
    color: source.color,
    palette,
  }));
}

export function getMapById(mapId) {
  return MAPS.find((map) => map.id === mapId) || MAPS[0];
}

export function getDifficultyById(difficultyId) {
  return AI_DIFFICULTIES[difficultyId] || AI_DIFFICULTIES.easy;
}

export function getSynthekonData() {
  return getFactionData('synthekon');
}

function roleForBuilding(roles, buildingId) {
  return Object.entries(roles).find(([, id]) => id === buildingId)?.[0] || 'tech';
}

function trainsForRole(role, units) {
  if (role === 'hq') {
    return units.slice(0, 2).map((unit) => unit.id);
  }
  if (role === 'infantry') {
    return units.filter((unit) => unit.category === 'infantry').slice(0, 4).map((unit) => unit.id);
  }
  if (role === 'vehicle') {
    return units.filter((unit) => unit.category === 'vehicle' || unit.category === 'mech').slice(0, 4).map((unit) => unit.id);
  }
  if (role === 'air') {
    return units.filter((unit) => unit.category === 'air').map((unit) => unit.id);
  }
  if (role === 'tech') {
    return units
      .slice()
      .sort((a, b) => resourceTotal(b.cost) - resourceTotal(a.cost))
      .slice(0, 2)
      .map((unit) => unit.id);
  }
  return [];
}

function buildOrderFor(roles) {
  return [
    roles.power,
    roles.metal,
    roles.infantry,
    roles.vehicle,
    roles.air,
    roles.tech,
    roles.turret,
    roles.darkMatter,
    roles.tunnel,
  ];
}

function createTunnelBuilding(faction, id) {
  return {
    id,
    name: `${faction.name} Tunnel Entrance`,
    hp: 760,
    cost: { metal: 260, energy: 90, darkMatter: 0 },
    buildTime: 24,
    produces: { tunnel: 1 },
    assetKeyword: `${faction.name} underground tunnel entrance sci fi glb`,
  };
}

function resourceTotal(cost = {}) {
  return (cost.metal || 0) + (cost.energy || 0) + (cost.darkMatter || 0) * 600;
}
