import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CATEGORY_SCALE = {
  infantry: 0.8,
  vehicle: 1.2,
  air: 1,
  mech: 1.45,
  building: 1,
};

export class AssetLibrary {
  constructor({ onWarning = () => {} } = {}) {
    this.onWarning = onWarning;
    this.loader = new GLTFLoader();
    this.manifest = new Map();
    this.activeDownloads = 0;
  }

  async loadManifest() {
    try {
      const response = await fetch('/asset-cache/manifest.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`manifest HTTP ${response.status}`);
      }
      const payload = await response.json();
      for (const item of payload.assets || []) {
        this.manifest.set(item.id, item);
      }
    } catch (error) {
      this.onWarning(`Asset manifest unavailable; using placeholders (${error.message})`);
    }
  }

  createEntityVisual({ id, kind, category, ownerColor, enemyColor, owner }) {
    const color = owner === 'ai' ? enemyColor : ownerColor;
    const root = new THREE.Group();
    const placeholder = this.createPlaceholder(kind, category, color);
    root.add(placeholder);

    const manifestEntry = this.manifest.get(id);
    if (manifestEntry?.publicPath && manifestEntry.status === 'ready') {
      this.activeDownloads += 1;
      this.loader.load(
        manifestEntry.publicPath,
        (gltf) => {
          root.clear();
          const model = gltf.scene;
          model.traverse((node) => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          const scale = CATEGORY_SCALE[kind === 'building' ? 'building' : category] || 1;
          model.scale.setScalar(scale);
          root.add(model);
          this.activeDownloads -= 1;
        },
        undefined,
        (error) => {
          this.activeDownloads -= 1;
          this.onWarning(`Could not load cached model for ${id}; placeholder active (${error.message})`);
        },
      );
    } else {
      this.onWarning(`Placeholder active for ${id}`);
    }

    return root;
  }

  createPlaceholder(kind, category, color) {
    if (kind === 'building') {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.2, 3.6),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25 }),
      );
      base.position.y = 0.6;
      base.castShadow = true;
      group.add(base);

      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 2.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.45 }),
      );
      tower.position.y = 2.35;
      tower.castShadow = true;
      group.add(tower);
      return group;
    }

    if (category === 'air') {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 1.7, 4),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      return mesh;
    }

    if (category === 'vehicle') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.7, 2.15),
        new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.28 }),
      );
      mesh.position.y = 0.35;
      mesh.castShadow = true;
      return mesh;
    }

    if (category === 'mech') {
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.7, 6, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.36 }),
      );
      mesh.position.y = 1.15;
      mesh.castShadow = true;
      return mesh;
    }

    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 0.9, 5, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.2 }),
    );
    mesh.position.y = 0.75;
    mesh.castShadow = true;
    return mesh;
  }
}
