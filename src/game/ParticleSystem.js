import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.particles = [];
    this.floaters = [];
  }

  burst(position, color = 0xffc857, count = 16) {
    for (let index = 0; index < count; index += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      particle.position.copy(position);
      particle.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 6,
      );
      particle.life = 0.7 + Math.random() * 0.5;
      particle.maxLife = particle.life;
      this.particles.push(particle);
      this.scene.add(particle);
    }
  }

  smoke(position, intensity = 1) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 + Math.random() * 0.18, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.24 * intensity,
        depthWrite: false,
      }),
    );
    particle.position.copy(position);
    particle.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.35);
    particle.life = 1.6;
    particle.maxLife = particle.life;
    particle.scale.setScalar(1);
    this.particles.push(particle);
    this.scene.add(particle);
  }

  fire(position) {
    this.burst(position, 0xf97316, 3);
  }

  floatingText(text, position, color = '#e0f2fe') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 26px Inter, Arial, sans-serif';
    context.textAlign = 'center';
    context.fillStyle = color;
    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 8;
    context.fillText(text, 128, 38);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.position.copy(position);
    sprite.scale.set(5, 1.25, 1);
    sprite.life = 1.35;
    sprite.maxLife = sprite.life;
    this.floaters.push(sprite);
    this.scene.add(sprite);
  }

  update(delta, camera) {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= delta;
      particle.velocity.y -= 5.5 * delta;
      particle.position.addScaledVector(particle.velocity, delta);

      const ground = this.terrain.heightAt(particle.position.x, particle.position.z) + 0.08;
      if (particle.position.y < ground) {
        particle.position.y = ground;
        particle.velocity.multiplyScalar(0.25);
      }

      particle.material.opacity = Math.max(0, particle.life / particle.maxLife);
      particle.scale.multiplyScalar(1 + delta * 0.8);

      if (particle.life <= 0) {
        this.scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        this.particles.splice(index, 1);
      }
    }

    for (let index = this.floaters.length - 1; index >= 0; index -= 1) {
      const floater = this.floaters[index];
      floater.life -= delta;
      floater.position.y += delta * 1.2;
      floater.material.opacity = Math.max(0, floater.life / floater.maxLife);
      floater.lookAt(camera.position);

      if (floater.life <= 0) {
        this.scene.remove(floater);
        floater.material.map.dispose();
        floater.material.dispose();
        this.floaters.splice(index, 1);
      }
    }
  }
}
