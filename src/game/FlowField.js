import * as THREE from 'three';

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

export class FlowFieldManager {
  constructor(terrain) {
    this.terrain = terrain;
    this.cache = new Map();
    this.maxCache = 32;
  }

  getField(target, options = {}) {
    const cell = this.terrain.worldToCell(target);
    const airKey = options.air ? 'air' : 'ground';
    const key = `${airKey}:${cell.x}:${cell.z}`;
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const field = this.buildField(cell, options);
    this.cache.set(key, field);

    if (this.cache.size > this.maxCache) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }

    return field;
  }

  invalidate() {
    this.cache.clear();
  }

  buildField(targetCell, options) {
    const { gridSize } = this.terrain;
    const distances = new Float32Array(gridSize * gridSize);
    distances.fill(Number.POSITIVE_INFINITY);
    const vectors = new Array(gridSize * gridSize).fill(null);
    const queue = [];

    const targetIndex = this.index(targetCell.x, targetCell.z);
    distances[targetIndex] = 0;
    queue.push(targetCell);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const currentDistance = distances[this.index(current.x, current.z)];

      for (const [dx, dz] of NEIGHBORS) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        if (nx < 0 || nz < 0 || nx >= gridSize || nz >= gridSize) {
          continue;
        }

        const world = this.terrain.cellToWorld(nx, nz);
        if (!this.terrain.isPassable(world.x, world.z, options)) {
          continue;
        }

        const nextIndex = this.index(nx, nz);
        const stepCost = dx !== 0 && dz !== 0 ? 1.41 : 1;
        const nextDistance = currentDistance + stepCost;
        if (nextDistance < distances[nextIndex]) {
          distances[nextIndex] = nextDistance;
          queue.push({ x: nx, z: nz });
        }
      }
    }

    for (let z = 0; z < gridSize; z += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const index = this.index(x, z);
        let best = distances[index];
        let bestVector = null;

        for (const [dx, dz] of NEIGHBORS) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= gridSize || nz >= gridSize) {
            continue;
          }

          const nextDistance = distances[this.index(nx, nz)];
          if (nextDistance < best) {
            best = nextDistance;
            bestVector = new THREE.Vector3(dx, 0, dz).normalize();
          }
        }

        vectors[index] = bestVector;
      }
    }

    return {
      targetCell,
      targetWorld: this.terrain.cellToWorld(targetCell.x, targetCell.z),
      directionAt: (position) => {
        const cell = this.terrain.worldToCell(position);
        return vectors[this.index(cell.x, cell.z)];
      },
      reachableAt: (position) => {
        const cell = this.terrain.worldToCell(position);
        return Number.isFinite(distances[this.index(cell.x, cell.z)]);
      },
    };
  }

  index(x, z) {
    return z * this.terrain.gridSize + x;
  }
}
