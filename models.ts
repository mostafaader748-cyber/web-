/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { TextureGenerator } from './textures';
import { EnemyType, WeaponId } from './types';

// Reusable shared materials and geometries for optimal performance
export class ModelFactory {
  private static shadowGeo = new THREE.CircleGeometry(0.7, 16);
  private static shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  // --- PLAYER MODEL ---
  public static createPlayer(): THREE.Group {
    const playerGroup = new THREE.Group();
    playerGroup.name = 'player';

    // 1. Contact shadow (flush with floor Y = 0.02)
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    playerGroup.add(shadow);

    // 2. Legs (Group for walking animation)
    const legsGroup = new THREE.Group();
    legsGroup.name = 'legs';
    legsGroup.position.y = 0.4;

    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85, metalness: 0.1 });
    const pantMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9, metalness: 0.05 });

    const legGeo = new THREE.BoxGeometry(0.2, 0.45, 0.22);
    const bootGeo = new THREE.BoxGeometry(0.22, 0.2, 0.32);

    const leftLeg = new THREE.Mesh(legGeo, pantMat);
    leftLeg.position.set(-0.16, 0.15, 0);
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(-0.16, -0.15, 0.04);
    legsGroup.add(leftLeg, leftBoot);

    const rightLeg = new THREE.Mesh(legGeo, pantMat);
    rightLeg.position.set(0.16, 0.15, 0);
    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0.16, -0.15, 0.04);
    legsGroup.add(rightLeg, rightBoot);

    playerGroup.add(legsGroup);

    // 3. Upper Body & Torso
    const upperBody = new THREE.Group();
    upperBody.name = 'upperBody';
    upperBody.position.y = 0.85;

    // Tactical vest & chest rig
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.2 });
    const torsoGeo = new THREE.BoxGeometry(0.55, 0.55, 0.36);
    const torso = new THREE.Mesh(torsoGeo, vestMat);
    torso.position.y = 0.1;
    torso.castShadow = true;
    upperBody.add(torso);

    // Pouches & armor plates (accents)
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.6 });
    const pouchGeo = new THREE.BoxGeometry(0.14, 0.16, 0.08);
    const p1 = new THREE.Mesh(pouchGeo, plateMat);
    p1.position.set(-0.14, 0.05, 0.2);
    const p2 = new THREE.Mesh(pouchGeo, plateMat);
    p2.position.set(0.14, 0.05, 0.2);
    upperBody.add(p1, p2);

    // Backpack & Tactical Radio
    const packMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.1 });
    const packGeo = new THREE.BoxGeometry(0.38, 0.45, 0.2);
    const backpack = new THREE.Mesh(packGeo, packMat);
    backpack.position.set(0, 0.12, -0.24);
    upperBody.add(backpack);

    // Radio antenna
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45);
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.2 });
    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.set(-0.14, 0.4, -0.28);
    upperBody.add(antenna);

    // 4. Head & Helmet with glowing visor
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.52, 0);

    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.3 });
    const helmetGeo = new THREE.SphereGeometry(0.24, 16, 12);
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.scale.set(1, 1.1, 1.05);
    headGroup.add(helmet);

    // Cyan glowing night-vision visor
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.8,
    });
    const visorGeo = new THREE.BoxGeometry(0.28, 0.1, 0.12);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.02, 0.2);
    headGroup.add(visor);

    upperBody.add(headGroup);

    // 5. Arms & Weapon
    const armsGroup = new THREE.Group();
    armsGroup.name = 'arms';

    const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const armGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.4);

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.rotation.x = Math.PI / 2.8;
    leftArm.rotation.z = -0.3;
    leftArm.position.set(-0.32, 0.1, 0.22);
    armsGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.rotation.x = Math.PI / 2.5;
    rightArm.rotation.z = 0.2;
    rightArm.position.set(0.32, 0.1, 0.22);
    armsGroup.add(rightArm);

    // Weapon Group
    const weaponMesh = this.createGunMesh('rifle');
    weaponMesh.name = 'weaponMesh';
    weaponMesh.position.set(0.16, 0.05, 0.45);
    armsGroup.add(weaponMesh);

    // Muzzle flash point
    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.name = 'muzzlePoint';
    muzzlePoint.position.set(0.16, 0.05, 1.05);
    armsGroup.add(muzzlePoint);

    // Flashlight beam (Tactical light)
    const flashlight = new THREE.SpotLight(0xfff7ed, 4.5, 28, Math.PI / 6, 0.45, 1.2);
    flashlight.name = 'flashlight';
    flashlight.position.set(0.16, 0.1, 0.5);
    flashlight.target = muzzlePoint;
    armsGroup.add(flashlight);
    armsGroup.add(flashlight.target);

    upperBody.add(armsGroup);
    playerGroup.add(upperBody);

    return playerGroup;
  }

  // Gun models attached to hands
  public static createGunMesh(type: WeaponId): THREE.Group {
    const gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.85 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.8, metalness: 0.1 });

    if (type === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.32), gunMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), gripMat);
      grip.position.set(0, -0.1, -0.06);
      grip.rotation.x = -0.2;
      gun.add(slide, grip);
    } else if (type === 'shotgun') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8), gunMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.2;
      const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), gunMat);
      magTube.rotation.x = Math.PI / 2;
      magTube.position.set(0, -0.05, 0.15);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.35), gripMat);
      stock.position.set(0, -0.04, -0.25);
      gun.add(barrel, magTube, stock);
    } else if (type === 'plasma') {
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 2.0,
      });
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.65), gunMat);
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8), coreMat);
      cell.rotation.x = Math.PI / 2;
      cell.position.set(0, 0.06, 0.05);
      const emitter = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), gunMat);
      emitter.rotation.x = -Math.PI / 2;
      emitter.position.set(0, 0, 0.38);
      gun.add(frame, cell, emitter);
    } else if (type === 'grenade') {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), gunMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = 0.15;
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), gunMat);
      sight.position.set(0, 0.12, 0.2);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.3), gripMat);
      stock.position.set(0, -0.08, -0.2);
      gun.add(tube, sight, stock);
    } else if (type === 'minigun') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.45, 8), gunMat);
      body.rotation.x = Math.PI / 2;
      body.position.z = 0.1;
      const barrelCluster = new THREE.Group();
      barrelCluster.position.z = 0.45;
      for (let b = 0; b < 6; b++) {
        const angle = (b * Math.PI) / 3;
        const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), gunMat);
        bMesh.rotation.x = Math.PI / 2;
        bMesh.position.set(Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0);
        barrelCluster.add(bMesh);
      }
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 12), gripMat);
      drum.position.set(0, -0.16, -0.05);
      gun.add(body, barrelCluster, drum);
    } else {
      // Rifle default
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.55), gunMat);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), gunMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, 0.4);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), gunMat);
      mag.position.set(0, -0.14, 0.05);
      mag.rotation.x = 0.25;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.25), gripMat);
      stock.position.set(0, -0.02, -0.32);
      gun.add(body, barrel, mag, stock);
    }

    return gun;
  }

  // --- ZOMBIE MODELS ---
  public static createZombie(type: EnemyType): THREE.Group {
    const zombieGroup = new THREE.Group();
    zombieGroup.name = `zombie_${type}`;

    // Shadow
    const shadowScale = type === 'brute' ? 1.8 : type === 'exploder' ? 1.3 : 1.0;
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.set(shadowScale, shadowScale, shadowScale);
    zombieGroup.add(shadow);

    // Overhead Billboard Health Bar
    const healthBarGroup = new THREE.Group();
    healthBarGroup.name = 'healthBarGroup';

    const barWidth = type === 'brute' ? 1.6 : type === 'exploder' ? 1.1 : 0.85;
    const barHeight = type === 'brute' ? 0.14 : 0.085;
    const barY = type === 'brute' ? 3.0 : type === 'exploder' ? 1.95 : 1.75;
    healthBarGroup.position.set(0, barY, 0);

    // Border / Outline background
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x030712,
      depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(barWidth + 0.06, barHeight + 0.04), bgMat);
    bgMesh.name = 'hpBg';
    healthBarGroup.add(bgMesh);

    // Depleted dark red track
    const trackMat = new THREE.MeshBasicMaterial({
      color: 0x450a0a,
      depthWrite: false,
    });
    const trackMesh = new THREE.Mesh(new THREE.PlaneGeometry(barWidth, barHeight), trackMat);
    trackMesh.position.z = 0.001;
    healthBarGroup.add(trackMesh);

    // Active HP Fill
    const fillMat = new THREE.MeshBasicMaterial({
      color: type === 'spitter' ? 0x84cc16 : type === 'brute' ? 0xdc2626 : 0xef4444,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(barWidth, barHeight), fillMat);
    fillMesh.name = 'hpFill';
    fillMesh.position.z = 0.002;
    healthBarGroup.add(fillMesh);

    // Boss Skull indicator for Brute
    if (type === 'brute') {
      const bossIconMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthWrite: false });
      const bossIcon = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2), bossIconMat);
      bossIcon.position.set(0, 0.22, 0.002);
      healthBarGroup.add(bossIcon);
    }

    zombieGroup.add(healthBarGroup);

    if (type === 'brute') {
      return this.buildBruteZombie(zombieGroup);
    } else if (type === 'sprinter') {
      return this.buildSprinterZombie(zombieGroup);
    } else if (type === 'spitter') {
      return this.buildSpitterZombie(zombieGroup);
    } else if (type === 'exploder') {
      return this.buildExploderZombie(zombieGroup);
    } else {
      return this.buildWalkerZombie(zombieGroup);
    }
  }

  // 1. Shambler / Walker
  private static buildWalkerZombie(group: THREE.Group): THREE.Group {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 });
    const ragMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'body';
    bodyGroup.position.y = 0.8;

    // Torso with hunch
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.32), ragMat);
    torso.rotation.x = 0.15;
    bodyGroup.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skinMat);
    head.position.set(0, 0.45, 0.12);
    head.rotation.z = 0.15;

    // Glowing eyes
    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eye1.position.set(-0.08, 0.04, 0.2);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
    eye2.position.set(0.08, 0.04, 0.2);
    head.add(eye1, eye2);
    bodyGroup.add(head);

    // Outstretched grabbing arms
    const armMat = skinMat;
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5), armMat);
    leftArm.rotation.x = Math.PI / 2.2;
    leftArm.rotation.z = -0.2;
    leftArm.position.set(-0.32, 0.12, 0.25);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5), armMat);
    rightArm.rotation.x = Math.PI / 2.0;
    rightArm.rotation.z = 0.15;
    rightArm.position.set(0.32, 0.12, 0.28);
    bodyGroup.add(leftArm, rightArm);

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65), ragMat);
    leftLeg.position.set(-0.16, -0.45, 0);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65), ragMat);
    rightLeg.position.set(0.16, -0.45, 0);
    bodyGroup.add(leftLeg, rightLeg);

    group.add(bodyGroup);
    return group;
  }

  // 2. Sprinter
  private static buildSprinterZombie(group: THREE.Group): THREE.Group {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    const bloodMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    const body = new THREE.Group();
    body.name = 'body';
    body.position.y = 0.65;
    body.rotation.x = 0.45; // Aggressive forward tilt

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), skinMat);
    body.add(torso);

    // Head angled up snarling
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
    head.position.set(0, 0.4, 0.16);
    head.rotation.x = -0.3;

    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    e1.position.set(-0.07, 0.02, 0.17);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    e2.position.set(0.07, 0.02, 0.17);
    head.add(e1, e2);
    body.add(head);

    // Sharp claws / arms
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55), bloodMat);
    lArm.rotation.x = Math.PI / 2.3;
    lArm.position.set(-0.28, 0.1, 0.3);
    const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55), bloodMat);
    rArm.rotation.x = Math.PI / 2.3;
    rArm.position.set(0.28, 0.1, 0.3);
    body.add(lArm, rArm);

    // Legs
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6), skinMat);
    lLeg.position.set(-0.14, -0.4, 0);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6), skinMat);
    rLeg.position.set(0.14, -0.4, 0);
    body.add(lLeg, rLeg);

    group.add(body);
    return group;
  }

  // 3. Acid Spitter
  private static buildSpitterZombie(group: THREE.Group): THREE.Group {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.9 });
    const toxicMat = new THREE.MeshStandardMaterial({
      color: 0x84cc16,
      emissive: 0x4d7c0f,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    });

    const body = new THREE.Group();
    body.name = 'body';
    body.position.y = 0.75;

    // Body
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.34), skinMat);
    body.add(torso);

    // Glowing pulsating toxic throat sac
    const throatSac = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), toxicMat);
    throatSac.name = 'throatSac';
    throatSac.position.set(0, 0.28, 0.22);
    throatSac.scale.set(1.1, 0.9, 1.2);
    body.add(throatSac);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
    head.position.set(0, 0.48, 0.14);
    body.add(head);

    // Spines on back
    for (let s = 0; s < 4; s++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), toxicMat);
      spine.rotation.x = -Math.PI / 2.5;
      spine.position.set(0, 0.25 - s * 0.14, -0.22);
      body.add(spine);
    }

    // Legs
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), skinMat);
    lLeg.position.set(-0.16, -0.45, 0);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), skinMat);
    rLeg.position.set(0.16, -0.45, 0);
    body.add(lLeg, rLeg);

    group.add(body);
    return group;
  }

  // 4. Exploder / Boamer
  private static buildExploderZombie(group: THREE.Group): THREE.Group {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.95 });
    const pustuleMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    });

    const body = new THREE.Group();
    body.name = 'body';
    body.position.y = 0.8;

    // Massive bloated sphere belly
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 12), skinMat);
    belly.scale.set(1.2, 1.1, 1.3);
    belly.position.y = 0.1;
    body.add(belly);

    // Glowing pustules
    const p1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), pustuleMat);
    p1.position.set(-0.22, 0.2, 0.38);
    const p2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), pustuleMat);
    p2.position.set(0.18, 0.05, 0.42);
    const p3 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), pustuleMat);
    p3.position.set(0, 0.3, -0.36);
    body.add(p1, p2, p3);

    // Tiny head on top
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skinMat);
    head.position.set(0, 0.58, 0.1);
    body.add(head);

    // Short stout legs
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5), skinMat);
    lLeg.position.set(-0.25, -0.45, 0);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5), skinMat);
    rLeg.position.set(0.25, -0.45, 0);
    body.add(lLeg, rLeg);

    group.add(body);
    return group;
  }

  // 5. Brute / Tank Boss
  private static buildBruteZombie(group: THREE.Group): THREE.Group {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6, metalness: 0.4 });
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7, metalness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });

    const body = new THREE.Group();
    body.name = 'body';
    body.scale.set(1.65, 1.65, 1.65);
    body.position.y = 1.1;

    // Colossal Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.6), skinMat);
    torso.position.y = 0.2;
    body.add(torso);

    // Bone / metal shoulder armor plate
    const shoulderPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.45), armorMat);
    shoulderPlate.position.set(-0.55, 0.55, 0);
    shoulderPlate.rotation.z = -0.2;
    body.add(shoulderPlate);

    // Sunken head with glowing red eyes
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
    head.position.set(0, 0.6, 0.2);

    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eye1.position.set(-0.09, 0.05, 0.24);
    const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eye2.position.set(0.09, 0.05, 0.24);
    head.add(eye1, eye2);
    body.add(head);

    // Normal arm
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.8), skinMat);
    lArm.position.set(-0.55, 0.05, 0.1);
    lArm.rotation.x = 0.4;
    body.add(lArm);

    // MUTATED GIANT SMASH ARM with embedded rebar club
    const giantArmGroup = new THREE.Group();
    giantArmGroup.name = 'smashArm';
    giantArmGroup.position.set(0.55, 0.2, 0.1);

    const rBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6), skinMat);
    rBicep.position.y = -0.2;
    const rForearm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), skinMat);
    rForearm.position.set(0, -0.65, 0.15);

    // Twisted concrete rebar club
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), rebarMat);
    rebar.position.set(0, -0.7, 0.35);
    rebar.rotation.x = Math.PI / 2.5;

    giantArmGroup.add(rBicep, rForearm, rebar);
    body.add(giantArmGroup);

    // Thick legs
    const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.8), skinMat);
    lLeg.position.set(-0.28, -0.55, 0);
    const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.8), skinMat);
    rLeg.position.set(0.28, -0.55, 0);
    body.add(lLeg, rLeg);

    group.add(body);
    return group;
  }

  // --- ENVIRONMENT MODELS ---

  // Abandoned rusted car
  public static createWreckedCar(renderer?: THREE.WebGLRenderer): THREE.Group {
    const car = new THREE.Group();
    const rustTex = TextureGenerator.getRustedMetalTexture(renderer);
    const bodyMat = new THREE.MeshStandardMaterial({
      map: rustTex,
      roughness: 0.75,
      metalness: 0.5,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.9,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });

    // Chassis base
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 4.4), bodyMat);
    base.position.y = 0.55;
    base.castShadow = true;
    base.receiveShadow = true;
    car.add(base);

    // Cabin roof
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
    cabin.position.set(0, 1.05, -0.2);
    cabin.castShadow = true;
    car.add(cabin);

    // Hood hoodline
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 1.2), bodyMat);
    hood.position.set(0, 0.7, 1.4);
    hood.rotation.x = 0.08;
    car.add(hood);

    // 4 Wheels
    const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
    tireGeo.rotateZ(Math.PI / 2);

    const positions = [
      [-1.05, 0.38, 1.3],
      [1.05, 0.38, 1.3],
      [-1.05, 0.38, -1.3],
      [1.05, 0.38, -1.3],
    ];

    positions.forEach(([x, y, z]) => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(x, y, z);
      car.add(tire);
    });

    // Contact shadow
    const carShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 5.0),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
    );
    carShadow.rotation.x = -Math.PI / 2;
    carShadow.position.y = 0.02;
    car.add(carShadow);

    return car;
  }

  // Explosive Fuel Barrel
  public static createExplosiveBarrel(): THREE.Group {
    const barrel = new THREE.Group();
    barrel.name = 'explosiveBarrel';

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.45,
      metalness: 0.6,
    });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.5 });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.5,
    });

    // Drum cylinder
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), redMat);
    drum.position.y = 0.55;
    drum.castShadow = true;
    drum.receiveShadow = true;
    barrel.add(drum);

    // Metal ribs
    const rib1 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.03, 6, 16), rimMat);
    rib1.rotation.x = Math.PI / 2;
    rib1.position.y = 0.3;
    const rib2 = rib1.clone();
    rib2.position.y = 0.8;
    barrel.add(rib1, rib2);

    // Flammable warning stripe band
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.2, 14), hazardMat);
    stripe.position.y = 0.55;
    barrel.add(stripe);

    // Contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    barrel.add(shadow);

    return barrel;
  }

  // Military Barricade
  public static createBarricade(renderer?: THREE.WebGLRenderer): THREE.Group {
    const barricade = new THREE.Group();
    const hazardTex = TextureGenerator.getHazardTexture(renderer);
    const hazardMat = new THREE.MeshStandardMaterial({
      map: hazardTex,
      roughness: 0.6,
      metalness: 0.2,
    });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.8 });
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.95 });

    // Diagonal A-frame legs
    const legGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    const l1 = new THREE.Mesh(legGeo, metalMat);
    l1.position.set(-1.2, 0.55, 0.2);
    l1.rotation.x = 0.25;
    const l2 = new THREE.Mesh(legGeo, metalMat);
    l2.position.set(-1.2, 0.55, -0.2);
    l2.rotation.x = -0.25;

    const r1 = new THREE.Mesh(legGeo, metalMat);
    r1.position.set(1.2, 0.55, 0.2);
    r1.rotation.x = 0.25;
    const r2 = new THREE.Mesh(legGeo, metalMat);
    r2.position.set(1.2, 0.55, -0.2);
    r2.rotation.x = -0.25;
    barricade.add(l1, l2, r1, r2);

    // Hazard cross beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.08), hazardMat);
    beam.position.set(0, 0.75, 0);
    beam.castShadow = true;
    barricade.add(beam);

    // Sandbags piled at base
    const bagGeo = new THREE.BoxGeometry(0.65, 0.22, 0.35);
    const bag1 = new THREE.Mesh(bagGeo, sandbagMat);
    bag1.position.set(-0.6, 0.12, 0);
    const bag2 = new THREE.Mesh(bagGeo, sandbagMat);
    bag2.position.set(0.6, 0.12, 0);
    const bag3 = new THREE.Mesh(bagGeo, sandbagMat);
    bag3.position.set(0, 0.28, 0);
    barricade.add(bag1, bag2, bag3);

    return barricade;
  }

  // Streetlamp with glowing amber cone
  public static createStreetlamp(): { lampGroup: THREE.Group; light: THREE.SpotLight } {
    const lampGroup = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.8 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    // Vertical pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5.5, 8), metalMat);
    pole.position.y = 2.75;
    pole.castShadow = true;
    lampGroup.add(pole);

    // Curved arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), metalMat);
    arm.position.set(0.6, 5.4, 0);
    lampGroup.add(arm);

    // Lamp shade
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 8), metalMat);
    shade.position.set(1.2, 5.3, 0);
    lampGroup.add(shade);

    // Glowing bulb
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bulbMat);
    bulb.position.set(1.2, 5.18, 0);
    lampGroup.add(bulb);

    // Downward warm streetlight
    const spot = new THREE.SpotLight(0xfef08a, 4.0, 18, Math.PI / 4, 0.5, 1.2);
    spot.position.set(1.2, 5.15, 0);
    const target = new THREE.Object3D();
    target.position.set(1.2, 0, 0);
    spot.target = target;
    lampGroup.add(spot);
    lampGroup.add(target);

    return { lampGroup, light: spot };
  }

  // Ruined skyscraper tower
  public static createBuildingBlock(width: number, height: number, depth: number, renderer?: THREE.WebGLRenderer): THREE.Group {
    const building = new THREE.Group();
    const concreteTex = TextureGenerator.getConcreteTexture(renderer);
    const wallMat = new THREE.MeshStandardMaterial({
      map: concreteTex,
      roughness: 0.9,
      metalness: 0.1,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.4 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.2, metalness: 0.8 });

    // Main tower block
    const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    tower.position.y = height / 2;
    tower.castShadow = true;
    tower.receiveShadow = true;
    building.add(tower);

    // Window bands
    const floors = Math.floor(height / 3);
    for (let f = 1; f < floors; f++) {
      const fy = f * 3;
      const winFront = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 1.2, 0.05), windowMat);
      winFront.position.set(0, fy, depth / 2 + 0.02);
      const winBack = winFront.clone();
      winBack.position.z = -depth / 2 - 0.02;
      building.add(winFront, winBack);
    }

    // Rooftop HVAC box
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(width * 0.35, 1.2, depth * 0.35), trimMat);
    hvac.position.set(0, height + 0.6, 0);
    building.add(hvac);

    return building;
  }

  // Supply Drop Crate
  public static createCrate(type: 'health' | 'ammo' | 'weapon_unlock'): THREE.Group {
    const crate = new THREE.Group();
    crate.name = `crate_${type}`;

    let beaconColor = 0x22c55e; // Green for health
    if (type === 'ammo') beaconColor = 0xeab308; // Yellow for ammo
    if (type === 'weapon_unlock') beaconColor = 0xa855f7; // Purple for weapon

    const boxMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.7 });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: beaconColor,
      emissive: beaconColor,
      emissiveIntensity: 2.5,
    });

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), boxMat);
    box.position.y = 0.3;
    box.castShadow = true;
    crate.add(box);

    // Glowing status beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), beaconMat);
    beacon.position.y = 0.68;
    crate.add(beacon);

    // Vertical indicator ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), beaconMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.68;
    crate.add(ring);

    // Contact shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    crate.add(shadow);

    return crate;
  }
}
