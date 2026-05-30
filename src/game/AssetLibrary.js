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

  createEntityVisual({ id, kind, category, ownerColor, enemyColor, owner, factionId, glowColor, accentColor }) {
    const color = owner === 'ai' ? enemyColor : ownerColor;
    const root = new THREE.Group();
    const placeholder = this.createPlaceholder(kind, category, color, {
      factionId,
      glowColor,
      accentColor,
    });
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

  createPlaceholder(kind, category, color, { factionId = 'synthekon', glowColor = color, accentColor = 0xe2e8f0 } = {}) {
    if (kind === 'building') {
      const group = new THREE.Group();
      const organic = factionId === 'vorreth';
      const military = factionId === 'ironveil';
      const base = new THREE.Mesh(
        organic ? new THREE.SphereGeometry(2, 14, 10) : new THREE.BoxGeometry(3.6, 1.2, 3.6),
        new THREE.MeshStandardMaterial({
          color: military ? accentColor : color,
          emissive: organic ? glowColor : 0x000000,
          emissiveIntensity: organic ? 0.28 : 0,
          roughness: organic ? 0.72 : 0.5,
          metalness: military ? 0.38 : 0.25,
        }),
      );
      base.position.y = organic ? 1.1 : 0.6;
      base.scale.y = organic ? 0.45 : 1;
      base.castShadow = true;
      group.add(base);

      const tower = new THREE.Mesh(
        organic ? new THREE.ConeGeometry(1.1, 2.7, 7) : new THREE.BoxGeometry(military ? 2.1 : 1.5, 2.5, military ? 1.2 : 1.5),
        new THREE.MeshStandardMaterial({
          color: organic ? color : accentColor,
          emissive: organic ? glowColor : 0x000000,
          emissiveIntensity: organic ? 0.38 : 0,
          roughness: 0.35,
          metalness: organic ? 0.05 : 0.45,
        }),
      );
      tower.position.y = 2.35;
      tower.castShadow = true;
      group.add(tower);
      if (organic) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 10, 8),
          new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.75 }),
        );
        glow.position.y = 3.8;
        group.add(glow);
      }
      return group;
    }

    if (category === 'air') {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 1.7, 4),
        new THREE.MeshStandardMaterial({
          color,
          emissive: factionId === 'vorreth' ? glowColor : 0x000000,
          emissiveIntensity: factionId === 'vorreth' ? 0.35 : 0,
          roughness: 0.45,
          metalness: factionId === 'ironveil' ? 0.35 : 0.25,
        }),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      return mesh;
    }

    if (category === 'vehicle') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.7, 2.15),
        new THREE.MeshStandardMaterial({ color: factionId === 'ironveil' ? accentColor : color, roughness: 0.42, metalness: 0.32 }),
      );
      mesh.position.y = 0.35;
      mesh.castShadow = true;
      return mesh;
    }

    if (category === 'mech') {
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.7, 6, 12),
        new THREE.MeshStandardMaterial({
          color,
          emissive: factionId === 'vorreth' ? glowColor : 0x000000,
          emissiveIntensity: factionId === 'vorreth' ? 0.24 : 0,
          roughness: 0.36,
          metalness: factionId === 'ironveil' ? 0.42 : 0.36,
        }),
      );
      mesh.position.y = 1.15;
      mesh.castShadow = true;
      return mesh;
    }

    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 0.9, 5, 10),
      new THREE.MeshStandardMaterial({
        color,
        emissive: factionId === 'vorreth' ? glowColor : 0x000000,
        emissiveIntensity: factionId === 'vorreth' ? 0.18 : 0,
        roughness: 0.48,
        metalness: factionId === 'ironveil' ? 0.28 : 0.2,
      }),
    );
    mesh.position.y = 0.75;
    mesh.castShadow = true;
    return mesh;
  }
}
