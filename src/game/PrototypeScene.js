import * as THREE from 'three';

const FACTION_COLORS = {
  human: 0x38bdf8,
  robot: 0xc4d7e8,
  alien: 0x84cc16,
};

export class PrototypeScene {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071018);
    this.scene.fog = new THREE.Fog(0x071018, 35, 95);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 250);
    this.camera.position.set(18, 22, 22);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.append(this.renderer.domElement);

    this.units = [];
    this.buildScene();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  buildScene() {
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(18, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 1.2));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80, 40, 40),
      new THREE.MeshStandardMaterial({ color: 0x142126, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(80, 40, 0x2dd4bf, 0x1f3b44);
    grid.position.y = 0.02;
    this.scene.add(grid);

    this.addBuilding('Command Core', new THREE.Vector3(-10, 0, 4), FACTION_COLORS.human);
    this.addBuilding('Power Relay', new THREE.Vector3(-16, 0, -4), 0xf59e0b);
    this.addResourceNode(new THREE.Vector3(9, 0, -10), 0x94a3b8);
    this.addResourceNode(new THREE.Vector3(0, 0, 0), 0xa855f7);

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      this.addUnit(
        new THREE.Vector3(-4 + Math.cos(angle) * 4, 0, 5 + Math.sin(angle) * 3),
        index % 2 === 0 ? FACTION_COLORS.human : FACTION_COLORS.robot,
      );
    }
  }

  addBuilding(label, position, color) {
    const group = new THREE.Group();
    group.position.copy(position);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 1.1, 4.8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 }),
    );
    base.position.y = 0.55;
    base.castShadow = true;
    group.add(base);

    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(2, 3.8, 2),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.38, metalness: 0.5 }),
    );
    tower.position.y = 2.45;
    tower.castShadow = true;
    group.add(tower);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 12),
      new THREE.MeshBasicMaterial({ color }),
    );
    beacon.position.y = 4.65;
    group.add(beacon);
    group.userData.label = label;

    this.scene.add(group);
  }

  addResourceNode(position, color) {
    const node = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 1),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
    );
    node.position.copy(position);
    node.position.y = 1.2;
    node.castShadow = true;
    this.scene.add(node);
  }

  addUnit(position, color) {
    const unit = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 0.9, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15 }),
    );
    unit.position.copy(position);
    unit.position.y = 0.9;
    unit.castShadow = true;
    unit.userData.origin = position.clone();
    unit.userData.phase = Math.random() * Math.PI * 2;
    this.units.push(unit);
    this.scene.add(unit);
  }

  resize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  update() {
    const elapsed = this.clock.getElapsedTime();
    for (const unit of this.units) {
      unit.position.y = 0.9 + Math.sin(elapsed * 2 + unit.userData.phase) * 0.06;
      unit.rotation.y += 0.01;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
