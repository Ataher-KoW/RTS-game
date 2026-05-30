import * as THREE from 'three';

export class FogOfWar {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.size = 128;
    this.explored = new Uint8Array(this.size * this.size);
    this.visible = new Uint8Array(this.size * this.size);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.context = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.size, terrain.size),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 18;
    this.mesh.renderOrder = 50;
    scene.add(this.mesh);
  }

  update(sources) {
    this.visible.fill(0);
    for (const source of sources) {
      if (source.hp <= 0 || source.kind === 'building' && !source.completed) {
        continue;
      }
      this.reveal(source.position, source.vision || 8);
    }

    const image = this.context.createImageData(this.size, this.size);
    for (let index = 0; index < this.visible.length; index += 1) {
      const offset = index * 4;
      const isVisible = this.visible[index] === 1;
      const isExplored = this.explored[index] === 1;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = isVisible ? 0 : isExplored ? 138 : 245;
    }
    this.context.putImageData(image, 0, 0);
    this.texture.needsUpdate = true;
  }

  reveal(position, radius) {
    const center = this.worldToFog(position);
    const radiusCells = Math.ceil((radius / this.terrain.size) * this.size);
    const radiusSq = radiusCells * radiusCells;

    for (let z = center.z - radiusCells; z <= center.z + radiusCells; z += 1) {
      for (let x = center.x - radiusCells; x <= center.x + radiusCells; x += 1) {
        if (x < 0 || z < 0 || x >= this.size || z >= this.size) {
          continue;
        }
        const dx = x - center.x;
        const dz = z - center.z;
        if (dx * dx + dz * dz <= radiusSq) {
          const index = z * this.size + x;
          this.visible[index] = 1;
          this.explored[index] = 1;
        }
      }
    }
  }

  isVisible(position) {
    const cell = this.worldToFog(position);
    return this.visible[cell.z * this.size + cell.x] === 1;
  }

  worldToFog(position) {
    return {
      x: THREE.MathUtils.clamp(Math.floor(((position.x + this.terrain.half) / this.terrain.size) * this.size), 0, this.size - 1),
      z: THREE.MathUtils.clamp(Math.floor(((position.z + this.terrain.half) / this.terrain.size) * this.size), 0, this.size - 1),
    };
  }
}
