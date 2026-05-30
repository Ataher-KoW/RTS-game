import * as THREE from 'three';

const FAR_LOD_DISTANCE = 58;
const INSTANCE_CAPACITY = 700;

const GEOMETRIES = {
  infantry: () => new THREE.CapsuleGeometry(0.34, 0.76, 4, 8),
  vehicle: () => new THREE.BoxGeometry(1.35, 0.55, 1.85),
  air: () => new THREE.ConeGeometry(0.58, 1.45, 4),
  mech: () => new THREE.CapsuleGeometry(0.48, 1.45, 5, 10),
};

export class InstancedLodRenderer {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map();
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  update(entities, camera, selectedIds) {
    for (const batch of this.batches.values()) {
      batch.count = 0;
      batch.mesh.count = 0;
      batch.mesh.visible = false;
    }

    for (const entity of entities) {
      if (entity.kind !== 'unit' || entity.hp <= 0) {
        continue;
      }

      const allowed = entity.renderVisible !== false;
      const selected = selectedIds.has(entity.id);
      const far = entity.position.distanceTo(camera.position) > FAR_LOD_DISTANCE && !selected;
      entity.usingInstancedLod = allowed && far;

      if (!entity.usingInstancedLod) {
        entity.visual.visible = allowed;
        entity.hpBar.group.visible = allowed;
        entity.selectionRing.visible = allowed && selected;
        continue;
      }

      entity.visual.visible = false;
      entity.hpBar.group.visible = false;
      entity.selectionRing.visible = false;

      const batch = this.getBatch(entity);
      if (batch.count >= INSTANCE_CAPACITY) {
        continue;
      }

      this.quaternion.setFromAxisAngle(this.up, entity.visual.rotation.y);
      this.scale.setScalar(entity.veteranLevel === 3 ? 1.14 : 1);
      this.matrix.compose(entity.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(batch.count, this.matrix);
      batch.count += 1;
    }

    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.count;
      batch.mesh.visible = batch.count > 0;
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  getBatch(entity) {
    const key = `${entity.owner}:${entity.category}:${entity.defId}`;
    if (this.batches.has(key)) {
      return this.batches.get(key);
    }

    const geometryFactory = GEOMETRIES[entity.category] || GEOMETRIES.infantry;
    const material = new THREE.MeshStandardMaterial({
      color: entity.ownerColor || (entity.owner === 'player' ? 0x7dd3fc : 0xf43f5e),
      roughness: 0.48,
      metalness: 0.22,
    });
    const mesh = new THREE.InstancedMesh(geometryFactory(), material, INSTANCE_CAPACITY);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);

    const batch = { mesh, count: 0 };
    this.batches.set(key, batch);
    return batch;
  }
}
