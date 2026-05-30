import * as THREE from 'three';

export class Terrain {
  constructor({ size = 96, segments = 96, map = null, waterLevel = map?.waterLevel ?? -0.42 } = {}) {
    this.size = size;
    this.half = size / 2;
    this.segments = segments;
    this.map = map;
    this.terrainSeed = map?.terrainSeed ?? 1;
    this.waterLevel = waterLevel;
    this.gridSize = 48;
    this.cellSize = size / this.gridSize;
    this.metalDeposits = (map?.metalDeposits ?? [
      [-30, -19],
      [-24, 17],
      [-12, -31],
      [24, -18],
      [30, 19],
      [12, 31],
    ]).map(([x, z]) => this.placeOnGround(new THREE.Vector3(x, 0, z)));
    this.darkMatterNodes = (map?.darkMatterNodes ?? [
      [0, 0],
      [6, 4],
    ]).map(([x, z]) => this.placeOnGround(new THREE.Vector3(x, 0, z)));
    this.tunnelAnchors = (map?.tunnelAnchors ?? [
      [-34, 24],
      [34, -24],
      [-6, -30],
      [6, 30],
    ]).map(([x, z]) => this.placeOnGround(new THREE.Vector3(x, 0, z)));
  }

  createMeshes() {
    const geometry = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      position.setY(index, this.heightAt(x, z));
    }
    geometry.computeVertexNormals();

    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x1b332f,
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    terrain.receiveShadow = true;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x082f49,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.46,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = this.waterLevel + 0.02;

    const grid = new THREE.GridHelper(this.size, this.gridSize, 0x38bdf8, 0x21434d);
    grid.position.y = 0.05;

    return { terrain, water, grid };
  }

  heightAt(x, z) {
    let base;
    if (this.terrainSeed === 2) {
      const channels = Math.sin((x + z) * 0.08) * 0.95 - Math.cos(z * 0.16) * 0.55;
      const deltaBasin = Math.exp(-(x ** 2) / 180) * -0.9;
      const darkMatterIsland = Math.exp(-(x ** 2 + z ** 2) / 120) * 1.4;
      const shelves = Math.sin(x * 0.11) * 0.35 + Math.cos(z * 0.09) * 0.35;
      base = channels + deltaBasin + darkMatterIsland + shelves - 0.2;
    } else if (this.terrainSeed === 3) {
      const crater = Math.exp(-(x ** 2 + z ** 2) / 190) * -2.0;
      const rim = Math.exp(-Math.abs(Math.hypot(x, z) - 22) / 8) * 1.35;
      const ramps = Math.sin((x - z) * 0.06) * 0.65 + Math.cos((x + z) * 0.05) * 0.4;
      base = crater + rim + ramps - 0.15;
    } else {
      const ridge = Math.exp(-Math.abs(x + z * 0.18) / 18) * 1.35;
      const basin = Math.exp(-((x - 15) ** 2 + (z + 8) ** 2) / 380) * -1.4;
      const waves = Math.sin(x * 0.18) * 0.55 + Math.cos(z * 0.14) * 0.45;
      const ramp = Math.sin((x - z) * 0.055) * 0.8;
      base = waves + ramp + ridge + basin - 0.35;
    }

    for (const crater of this.craters || []) {
      const distance = Math.hypot(x - crater.center.x, z - crater.center.z);
      if (distance < crater.radius) {
        base -= (1 - distance / crater.radius) * crater.depth;
      }
    }
    return base;
  }

  deformCrater(center, radius = 7, depth = 0.9) {
    this.craters ??= [];
    this.craters.push({ center: center.clone(), radius, depth });
  }

  slopeAt(x, z) {
    const sample = 0.8;
    const dx = Math.abs(this.heightAt(x + sample, z) - this.heightAt(x - sample, z));
    const dz = Math.abs(this.heightAt(x, z + sample) - this.heightAt(x, z - sample));
    return Math.max(dx, dz) / (sample * 2);
  }

  isWaterAt(x, z) {
    return this.heightAt(x, z) <= this.waterLevel + 0.08;
  }

  isInside(x, z, margin = 1) {
    return x > -this.half + margin && x < this.half - margin && z > -this.half + margin && z < this.half - margin;
  }

  isPassable(x, z, { air = false } = {}) {
    if (!this.isInside(x, z)) {
      return false;
    }
    if (air) {
      return true;
    }
    return !this.isWaterAt(x, z) && this.slopeAt(x, z) < 0.78;
  }

  snap(value) {
    return Math.round(value / this.cellSize) * this.cellSize;
  }

  snapPosition(position) {
    return new THREE.Vector3(this.snap(position.x), this.heightAt(position.x, position.z), this.snap(position.z));
  }

  placeOnGround(position, yOffset = 0) {
    return new THREE.Vector3(position.x, this.heightAt(position.x, position.z) + yOffset, position.z);
  }

  worldToCell(position) {
    const x = Math.floor((position.x + this.half) / this.cellSize);
    const z = Math.floor((position.z + this.half) / this.cellSize);
    return {
      x: THREE.MathUtils.clamp(x, 0, this.gridSize - 1),
      z: THREE.MathUtils.clamp(z, 0, this.gridSize - 1),
    };
  }

  cellToWorld(x, z) {
    const wx = -this.half + x * this.cellSize + this.cellSize / 2;
    const wz = -this.half + z * this.cellSize + this.cellSize / 2;
    return new THREE.Vector3(wx, this.heightAt(wx, wz), wz);
  }
}
