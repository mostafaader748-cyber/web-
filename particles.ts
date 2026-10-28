/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  initialSize: number;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
  active: boolean;
}

export class ParticleSystem {
  private maxParticles = 1200;
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private pointsMesh: THREE.Points;

  private positionsArray: Float32Array;
  private colorsArray: Float32Array;

  // Environmental falling ash / rain
  private ashGeometry: THREE.BufferGeometry;
  private ashMesh: THREE.Points;
  private ashPositions: Float32Array;
  private ashCount = 350;

  constructor(scene: THREE.Scene) {
    this.positionsArray = new Float32Array(this.maxParticles * 3);
    this.colorsArray = new Float32Array(this.maxParticles * 3);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 0.1,
        initialSize: 0.1,
        alpha: 1,
        life: 0,
        maxLife: 1,
        gravity: 0,
        drag: 0.96,
        active: false,
      });
      this.positionsArray[i * 3 + 1] = -999;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsArray, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorsArray, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.pointsMesh = new THREE.Points(this.geometry, this.material);
    this.pointsMesh.frustumCulled = false;
    scene.add(this.pointsMesh);

    // Ash / Ember atmosphere
    this.ashPositions = new Float32Array(this.ashCount * 3);
    for (let i = 0; i < this.ashCount; i++) {
      this.ashPositions[i * 3] = (Math.random() - 0.5) * 70;
      this.ashPositions[i * 3 + 1] = Math.random() * 20;
      this.ashPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }

    this.ashGeometry = new THREE.BufferGeometry();
    this.ashGeometry.setAttribute('position', new THREE.BufferAttribute(this.ashPositions, 3));

    const ashMat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.18,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ashMesh = new THREE.Points(this.ashGeometry, ashMat);
    this.ashMesh.frustumCulled = false;
    scene.add(this.ashMesh);
  }

  public emit(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed: number,
    life: number,
    gravity: number = 9.8,
    spreadAngle: number = Math.PI * 2,
    baseDir?: THREE.Vector3
  ) {
    let emitted = 0;
    for (let i = 0; i < this.maxParticles && emitted < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.position.set(x, y, z);
        p.color.setHex(colorHex);
        p.life = 0;
        p.maxLife = life * (0.7 + Math.random() * 0.6);
        p.gravity = gravity;
        p.drag = 0.94 + Math.random() * 0.04;

        let vx = (Math.random() - 0.5) * 2;
        let vy = (Math.random() - 0.5) * 2;
        let vz = (Math.random() - 0.5) * 2;

        if (baseDir) {
          const angle = (Math.random() - 0.5) * spreadAngle;
          const rotated = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
          vx = rotated.x + (Math.random() - 0.5) * 0.4;
          vy = Math.random() * 0.8;
          vz = rotated.z + (Math.random() - 0.5) * 0.4;
        }

        const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
        const curSpeed = speed * (0.6 + Math.random() * 0.8);
        p.velocity.set((vx / len) * curSpeed, (vy / len) * curSpeed, (vz / len) * curSpeed);

        emitted++;
      }
    }
  }

  // Pre-configured triggers
  public emitBlood(x: number, y: number, z: number, count: number = 14) {
    this.emit(x, y, z, count, 0xaa1111, 4.5, 0.45, 12);
  }

  public emitAcid(x: number, y: number, z: number, count: number = 18) {
    this.emit(x, y, z, count, 0x55ff33, 5.0, 0.6, 10);
  }

  public emitSparks(x: number, y: number, z: number, dir?: THREE.Vector3, count: number = 8) {
    this.emit(x, y, z, count, 0xffbb33, 7.5, 0.25, 6, 0.6, dir);
  }

  public emitExplosion(x: number, y: number, z: number) {
    // Fire blast
    this.emit(x, y, z, 55, 0xff5511, 8.5, 0.7, 4);
    // Shockwave sparks
    this.emit(x, y, z, 30, 0xffdd44, 12.0, 0.4, 2);
    // Black smoke embers
    this.emit(x, y, z, 40, 0x332211, 4.0, 0.95, -1);
  }

  public emitLevelUp(x: number, y: number, z: number) {
    this.emit(x, y, z, 50, 0x38bdf8, 3.5, 0.9, -3);
  }

  public update(dt: number, playerPos?: THREE.Vector3) {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          p.position.set(0, -999, 0);
          this.positionsArray[i * 3 + 1] = -999;
          continue;
        }

        p.velocity.y -= p.gravity * dt;
        p.velocity.x *= p.drag;
        p.velocity.z *= p.drag;

        p.position.addScaledVector(p.velocity, dt);

        // Ground floor bounce / stick
        if (p.position.y < 0.05) {
          p.position.y = 0.05;
          p.velocity.y = -p.velocity.y * 0.2;
          p.velocity.x *= 0.6;
          p.velocity.z *= 0.6;
        }

        const fade = 1 - p.life / p.maxLife;

        this.positionsArray[i * 3] = p.position.x;
        this.positionsArray[i * 3 + 1] = p.position.y;
        this.positionsArray[i * 3 + 2] = p.position.z;

        this.colorsArray[i * 3] = p.color.r * fade;
        this.colorsArray[i * 3 + 1] = p.color.g * fade;
        this.colorsArray[i * 3 + 2] = p.color.b * fade;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Environmental Ash drift
    const ashAttr = this.ashGeometry.attributes.position as THREE.BufferAttribute;
    const center = playerPos || new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < this.ashCount; i++) {
      this.ashPositions[i * 3 + 1] -= dt * 1.8; // fall
      this.ashPositions[i * 3] += Math.sin(this.ashPositions[i * 3 + 1] * 0.5) * dt * 0.4; // sway

      // Reset when below floor or too far from player
      if (this.ashPositions[i * 3 + 1] < 0.1) {
        this.ashPositions[i * 3 + 1] = 16 + Math.random() * 4;
        this.ashPositions[i * 3] = center.x + (Math.random() - 0.5) * 60;
        this.ashPositions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 60;
      }
    }
    ashAttr.needsUpdate = true;
  }
}
