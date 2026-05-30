import * as THREE from 'three';

export class CameraController {
  constructor(camera, domElement, terrain) {
    this.camera = camera;
    this.domElement = domElement;
    this.terrain = terrain;
    this.focus = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI * 0.25;
    this.pitch = Math.PI * 0.31;
    this.distance = 42;
    this.edgeSize = 18;
    this.pointer = { x: 0, y: 0 };
    this.dragging = false;
    this.lastDrag = { x: 0, y: 0 };

    domElement.addEventListener('pointermove', (event) => this.onPointerMove(event));
    domElement.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    domElement.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.035, 18, 70);
      },
      { passive: false },
    );

    this.updateCamera();
  }

  onPointerMove(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;

    if (this.dragging) {
      const dx = event.clientX - this.lastDrag.x;
      this.yaw -= dx * 0.006;
      this.lastDrag.x = event.clientX;
      this.lastDrag.y = event.clientY;
    }
  }

  onPointerDown(event) {
    if (event.button !== 2) {
      return;
    }
    this.dragging = true;
    this.lastDrag.x = event.clientX;
    this.lastDrag.y = event.clientY;
  }

  update(delta) {
    const rect = this.domElement.getBoundingClientRect();
    const speed = 28 * delta * (this.distance / 42);
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

    if (this.pointer.x <= this.edgeSize) {
      this.focus.addScaledVector(right, -speed);
    } else if (this.pointer.x >= rect.width - this.edgeSize) {
      this.focus.addScaledVector(right, speed);
    }

    if (this.pointer.y <= this.edgeSize) {
      this.focus.addScaledVector(forward, -speed);
    } else if (this.pointer.y >= rect.height - this.edgeSize) {
      this.focus.addScaledVector(forward, speed);
    }

    this.focus.x = THREE.MathUtils.clamp(this.focus.x, -this.terrain.half + 10, this.terrain.half - 10);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, -this.terrain.half + 10, this.terrain.half - 10);
    this.focus.y = this.terrain.heightAt(this.focus.x, this.focus.z);
    this.updateCamera();
  }

  updateCamera() {
    const horizontalDistance = Math.cos(this.pitch) * this.distance;
    const position = new THREE.Vector3(
      this.focus.x + Math.sin(this.yaw) * horizontalDistance,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontalDistance,
    );

    this.camera.position.copy(position);
    this.camera.lookAt(this.focus);
  }
}
