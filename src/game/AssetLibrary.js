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
      } else {
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.5, 0.16, 18),
          new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.82 }),
        );
        core.position.y = 2.9;
        core.rotation.x = Math.PI / 2;
        group.add(core);
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
          new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.32, metalness: 0.7 }),
        );
        antenna.position.y = 4;
        group.add(antenna);
      }
      return group;
    }

    if (category === 'air') {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 1.7, 4),
        new THREE.MeshStandardMaterial({
          color,
          emissive: factionId === 'vorreth' ? glowColor : 0x000000,
          emissiveIntensity: factionId === 'vorreth' ? 0.35 : 0,
          roughness: 0.45,
          metalness: factionId === 'ironveil' ? 0.35 : 0.25,
        }),
      );
      body.rotation.x = Math.PI / 2;
      body.castShadow = true;
      group.add(body);
      const wingMaterial = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.38, metalness: factionId === 'vorreth' ? 0.05 : 0.45 });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.42), wingMaterial);
        wing.position.set(side * 0.72, 0, -0.08);
        wing.rotation.z = side * 0.18;
        wing.castShadow = true;
        group.add(wing);
      }
      const engine = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: glowColor }));
      engine.position.z = 0.82;
      group.add(engine);
      return group;
    }

    if (category === 'vehicle') {
      const group = new THREE.Group();
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.7, 2.15),
        new THREE.MeshStandardMaterial({ color: factionId === 'ironveil' ? accentColor : color, roughness: 0.42, metalness: 0.32 }),
      );
      chassis.position.y = 0.35;
      chassis.castShadow = true;
      group.add(chassis);
      const turret = new THREE.Mesh(
        factionId === 'vorreth' ? new THREE.ConeGeometry(0.35, 0.9, 7) : new THREE.BoxGeometry(0.72, 0.32, 0.92),
        new THREE.MeshStandardMaterial({ color, emissive: factionId === 'vorreth' ? glowColor : 0x000000, emissiveIntensity: factionId === 'vorreth' ? 0.28 : 0, roughness: 0.35, metalness: 0.42 }),
      );
      turret.position.y = 0.92;
      turret.rotation.x = factionId === 'vorreth' ? Math.PI / 2 : 0;
      turret.castShadow = true;
      group.add(turret);
      for (const side of [-1, 1]) {
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.24, 2.25),
          new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.7, metalness: 0.25 }),
        );
        tread.position.set(side * 0.9, 0.18, 0);
        group.add(tread);
      }
      return group;
    }

    if (category === 'mech') {
      const group = new THREE.Group();
      const torso = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.7, 6, 12),
        new THREE.MeshStandardMaterial({
          color,
          emissive: factionId === 'vorreth' ? glowColor : 0x000000,
          emissiveIntensity: factionId === 'vorreth' ? 0.24 : 0,
          roughness: 0.36,
          metalness: factionId === 'ironveil' ? 0.42 : 0.36,
        }),
      );
      torso.position.y = 1.35;
      torso.castShadow = true;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.46), new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.34, metalness: 0.52 }));
      head.position.y = 2.55;
      head.castShadow = true;
      group.add(head);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.45, metalness: 0.4 }));
        leg.position.set(side * 0.34, 0.45, 0);
        leg.castShadow = true;
        group.add(leg);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.2), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 }));
        arm.position.set(side * 0.72, 1.42, 0.06);
        arm.rotation.z = side * 0.28;
        group.add(arm);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: glowColor }));
      core.position.set(0, 1.55, -0.45);
      group.add(core);
      return group;
    }

    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 0.9, 5, 10),
      new THREE.MeshStandardMaterial({
        color,
        emissive: factionId === 'vorreth' ? glowColor : 0x000000,
        emissiveIntensity: factionId === 'vorreth' ? 0.18 : 0,
        roughness: 0.48,
        metalness: factionId === 'ironveil' ? 0.28 : 0.2,
      }),
    );
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(
      factionId === 'vorreth' ? new THREE.SphereGeometry(0.22, 10, 8) : new THREE.BoxGeometry(0.34, 0.28, 0.3),
      new THREE.MeshStandardMaterial({ color: accentColor, emissive: factionId === 'vorreth' ? glowColor : 0x000000, emissiveIntensity: factionId === 'vorreth' ? 0.2 : 0, roughness: 0.42, metalness: 0.28 }),
    );
    head.position.y = 1.48;
    group.add(head);
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.78), new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.35, roughness: 0.2 }));
    weapon.position.set(0.42, 0.9, -0.22);
    weapon.rotation.y = -0.25;
    group.add(weapon);
    return group;
  }
}
