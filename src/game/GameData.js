import synthekon from '../data/factions/synthekon.json';

export const OWNER = {
  PLAYER: 'player',
  AI: 'ai',
};

export const ENTITY_KIND = {
  UNIT: 'unit',
  BUILDING: 'building',
};

export const UNIT_META = {
  'scout-drone': { armor: 'air', weapon: 'light', range: 6, cooldown: 0.9, canAttackAir: true },
  'rifle-android': { armor: 'light', weapon: 'light', range: 5, cooldown: 0.95 },
  'heavy-mech': { armor: 'heavy', weapon: 'antiArmor', range: 6, cooldown: 1.5 },
  'hover-tank': { armor: 'vehicle', weapon: 'antiArmor', range: 6.5, cooldown: 1.35 },
  gunship: { armor: 'air', weapon: 'antiArmor', range: 7, cooldown: 1.2, canAttackAir: true },
  'titan-mech': { armor: 'heavy', weapon: 'siege', range: 8, cooldown: 2.2 },
  'android-swarm': { armor: 'light', weapon: 'light', range: 3.8, cooldown: 0.65 },
  'rail-cannon-vehicle': { armor: 'vehicle', weapon: 'siege', range: 9.5, cooldown: 2.4 },
};

export const BUILDING_META = {
  'synthekon-hq': {
    armor: 'structure',
    footprint: 4,
    zoneControl: 18,
    trains: ['scout-drone', 'rifle-android'],
    energyUse: 0,
  },
  'power-conduit': { armor: 'structure', footprint: 3, zoneControl: 9, trains: [], energyUse: 0 },
  'metal-harvester': { armor: 'structure', footprint: 3, zoneControl: 9, trains: [], energyUse: 0 },
  'android-foundry': {
    armor: 'structure',
    footprint: 4,
    zoneControl: 12,
    trains: ['rifle-android', 'android-swarm', 'heavy-mech'],
    energyUse: 6,
  },
  'vehicle-assembly': {
    armor: 'structure',
    footprint: 5,
    zoneControl: 12,
    trains: ['hover-tank', 'rail-cannon-vehicle'],
    energyUse: 8,
  },
  'aero-bay': {
    armor: 'structure',
    footprint: 4,
    zoneControl: 12,
    trains: ['scout-drone', 'gunship'],
    energyUse: 8,
  },
  'research-nexus': { armor: 'structure', footprint: 4, zoneControl: 10, trains: [], energyUse: 10 },
  'defense-turret': {
    armor: 'structure',
    footprint: 2,
    zoneControl: 10,
    trains: [],
    weapon: 'antiArmor',
    range: 9,
    damage: 32,
    cooldown: 1.3,
    energyUse: 2,
  },
  'dark-matter-siphon': { armor: 'structure', footprint: 3, zoneControl: 9, trains: [], energyUse: 12 },
};

export const WEAPON_MULTIPLIERS = {
  light: { light: 1.15, vehicle: 0.65, heavy: 0.55, air: 0.85, structure: 0.45 },
  antiArmor: { light: 0.8, vehicle: 1.35, heavy: 1.2, air: 0.65, structure: 0.8 },
  antiAir: { light: 0.7, vehicle: 0.5, heavy: 0.5, air: 2, structure: 0.35 },
  siege: { light: 0.65, vehicle: 1.1, heavy: 1.25, air: 0.2, structure: 1.65 },
};

export const BUILD_ORDER = [
  'power-conduit',
  'metal-harvester',
  'android-foundry',
  'vehicle-assembly',
  'aero-bay',
  'defense-turret',
  'dark-matter-siphon',
];

export const STARTING_RESOURCES = {
  metal: 1400,
  energy: 650,
  darkMatter: 0,
};

export function getSynthekonData() {
  const units = Object.fromEntries(
    synthekon.units.map((unit) => [
      unit.id,
      {
        ...unit,
        ...UNIT_META[unit.id],
        maxHp: unit.hp,
      },
    ]),
  );
  const buildings = Object.fromEntries(
    synthekon.buildings.map((building) => [
      building.id,
      {
        ...building,
        ...BUILDING_META[building.id],
        maxHp: building.hp,
      },
    ]),
  );

  return {
    faction: synthekon,
    units,
    buildings,
  };
}
