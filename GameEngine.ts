/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sound } from '../audio/SoundSystem';
import { ModelFactory } from './models';
import { ParticleSystem } from './particles';
import { TextureGenerator } from './textures';
import {
  DIFFICULTIES,
  Difficulty,
  LEVELS,
  LevelDef,
  MAPS,
  MapId,
  MinimapData,
  MissionConfig,
  MissionInfo,
  unlockLevel,
} from './missions';
import {
  AcidPool,
  DropItem,
  BossInfo,
  EnemyStats,
  EnemyType,
  FloatingText,
  GameState,
  Perk,
  PlayerStats,
  WeaponId,
  WeaponStats,
} from './types';

// Pre-allocated math helpers to ensure ZERO Garbage Collection in render loop
const _vec1 = new THREE.Vector3();
const _vec2 = new THREE.Vector3();
const _vec3 = new THREE.Vector3();
const _targetDir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _camFwd = new THREE.Vector3();
const _camOrigin = new THREE.Vector3();
const _camToPlayer = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export type CameraMode = 'third' | 'first' | 'topdown';

export interface EngineCallbacks {
  onStateChange: (state: GameState) => void;
  onPlayerUpdate: (stats: PlayerStats, activeWeapon: WeaponStats) => void;
  onWaveUpdate: (
    wave: number,
    remainingZombies: number,
    totalInWave: number,
    bossInfo: BossInfo | null
  ) => void;
  onFloatingTextAdd: (text: FloatingText) => void;
  onPerkSelectionRequired: (perks: Perk[]) => void;
  onGameOver: (stats: { wave: number; kills: number; score: number; highscore: number }) => void;
  onCameraModeChange?: (mode: CameraMode) => void;
  onMissionChange?: (info: MissionInfo) => void;
  onLevelComplete?: (info: {
    levelId: number;
    levelName: string;
    kills: number;
    score: number;
    bonus: number;
    hasNext: boolean;
  }) => void;
}

export class GameEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private particles!: ParticleSystem;
  private callbacks: EngineCallbacks;

  private isSoftwareGl: boolean = false;
  private frameId: number = 0;
  private clock = new THREE.Clock();
  private gameState: GameState = 'title';

  // Player Entity
  private playerGroup!: THREE.Group;
  private playerPos = new THREE.Vector3(0, 0, 0);
  private playerVelocity = new THREE.Vector3(0, 0, 0);
  private playerRotation: number = 0;
  private aimTarget = new THREE.Vector3(0, 0, 1);
  private cameraOffset = new THREE.Vector3(0, 15, 11); // top-down mode offset
  private cameraMode: CameraMode = 'third';
  private cameraFov = 66;
  private pitch: number = 0; // look up (+) / down (-), radians
  private yaw: number = Math.PI; // facing -z (up the screen) like the classic view
  private viewGun: THREE.Object3D | null = null;
  private lastLockLossTime = 0;
  private tmpForward = new THREE.Vector3();
  private tmpTarget = new THREE.Vector3();
  private cameraCurrentPos = new THREE.Vector3(0, 25, 25);
  private cameraLookTarget = new THREE.Vector3(0, 0, 0);

  // Screen shake & Hitstop
  private screenShakeIntensity: number = 0;
  private hitstopTimer: number = 0;

  // Player Stats
  private playerStats: PlayerStats = {
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    speed: 8.5,
    dashCooldown: 1.2,
    lastDashTime: -99,
    isDashing: false,
    dashDuration: 0.18,
    score: 0,
    credits: 400,
    combo: 0,
    comboTimer: 0,
    zombiesKilled: 0,
    wavesCompleted: 0,
    activePerks: [],
    damageMultiplier: 1.0,
    fireRateMultiplier: 1.0,
    speedMultiplier: 1.0,
    vampiricChance: 0,
    hasKineticShockwave: false,
    hasNapalmRounds: false,
  };

  // Weapons Arsenal
  private weapons: Map<WeaponId, WeaponStats> = new Map();
  private currentWeaponId: WeaponId = 'pistol';
  private lastShootTime: number = 0;
  private isReloading: boolean = false;
  private reloadTimer: number = 0;

  // Active Game Entities
  private enemies: Array<{
    group: THREE.Group;
    stats: EnemyStats;
    velocity: THREE.Vector3;
    windupTimer: number;
    hitFlashTimer: number;
    acidSpitTimer: number;
    ignitedTimer: number;
  }> = [];

  private bullets: Array<{
    mesh: THREE.Mesh;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    damage: number;
    range: number;
    distanceTraveled: number;
    pierceCount: number;
    isRocket?: boolean;
    isAcid?: boolean;
  }> = [];

  private acidPools: AcidPool[] = [];
  private acidPoolMeshes: Map<string, THREE.Mesh> = new Map();

  private dropItems: DropItem[] = [];
  private dropMeshes: Map<string, THREE.Group> = new Map();

  private explosiveBarrels: Array<{
    group: THREE.Group;
    position: THREE.Vector3;
    radius: number;
    hp: number;
  }> = [];

  private obstacles: Array<{
    x: number;
    z: number;
    radius: number;
  }> = [];

  // Wave Manager
  private currentWave: number = 1;
  private waveTotalZombies: number = 0;
  private zombiesSpawnedSoFar: number = 0;
  private zombiesRemainingInWave: number = 0;
  private waveSpawnTimer: number = 0;
  private waveBreakTimer: number = 0;

  // Input State
  private keysHeld: { [key: string]: boolean } = {};
  private isPointerDown: boolean = false;
  private touchMoveVector = { x: 0, y: 0 };
  private touchAimVector = { x: 0, y: 0 };
  private isTouchDevice: boolean = false;

  // Environment & Lights
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  // Mission state (maps, levels, difficulty)
  private mission: MissionConfig = { levelId: 1, map: 'city', difficulty: 'normal' };
  private levelDef: LevelDef | null = LEVELS[0];
  private difficulty: Difficulty = DIFFICULTIES.normal;
  private currentMapId: MapId = 'city';
  private mapObjects: THREE.Object3D[] = [];
  private playerFlashlight!: THREE.SpotLight;
  private groundMesh!: THREE.Mesh;

  // Blood Decals (pooled)
  private decalMeshes: THREE.Mesh[] = [];
  private maxDecals = 60;
  private decalIndex = 0;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.initHardwareDetection();
    this.initWeapons();
    this.initThree();
    this.initWorld();
    this.initBloodDecals();
    this.initInputListeners();
    this.startLoop();
  }

  private initHardwareDetection() {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
  }

  private initWeapons() {
    this.weapons.set('pistol', {
      id: 'pistol',
      name: 'P250 Sidearm',
      category: 'Sidearm',
      damage: 26,
      fireRate: 3.8,
      magazineSize: 12,
      currentAmmo: 12,
      reserveAmmo: 999, // Infinite
      maxReserveAmmo: 999,
      reloadTime: 1.1,
      isAutomatic: false,
      spread: 0.04,
      bulletSpeed: 55,
      bulletColor: '#fbbf24',
      range: 35,
      unlocked: true,
      price: 0,
      upgradeLevel: 0,
      description: 'Reliable semi-auto sidearm with fast handling and unlimited reserves.',
    });

    this.weapons.set('rifle', {
      id: 'rifle',
      name: 'M4A1 Carbine',
      category: 'Assault Rifle',
      damage: 34,
      fireRate: 9.0,
      magazineSize: 30,
      currentAmmo: 30,
      reserveAmmo: 120,
      maxReserveAmmo: 240,
      reloadTime: 1.8,
      isAutomatic: true,
      spread: 0.07,
      bulletSpeed: 62,
      bulletColor: '#f59e0b',
      range: 40,
      unlocked: true,
      price: 650,
      upgradeLevel: 0,
      description: 'High rate-of-fire urban assault rifle. Decimates hordes quickly.',
    });

    this.weapons.set('shotgun', {
      id: 'shotgun',
      name: 'SPAS-12 Breacher',
      category: 'Shotgun',
      damage: 18, // x 8 pellets = 144 point-blank
      fireRate: 1.4,
      magazineSize: 8,
      currentAmmo: 8,
      reserveAmmo: 40,
      maxReserveAmmo: 80,
      reloadTime: 2.2,
      isAutomatic: false,
      pellets: 8,
      spread: 0.22,
      bulletSpeed: 48,
      bulletColor: '#ef4444',
      range: 22,
      unlocked: false,
      price: 1200,
      upgradeLevel: 0,
      description: 'Close-quarters heavyweight shotgun that tears through charging mutants.',
    });

    this.weapons.set('plasma', {
      id: 'plasma',
      name: 'Arc Cryo-Blaster',
      category: 'Heavy Energy',
      damage: 55,
      fireRate: 4.5,
      magazineSize: 24,
      currentAmmo: 24,
      reserveAmmo: 72,
      maxReserveAmmo: 144,
      reloadTime: 2.0,
      isAutomatic: true,
      spread: 0.02,
      bulletSpeed: 70,
      bulletColor: '#38bdf8',
      range: 45,
      unlocked: false,
      price: 2400,
      upgradeLevel: 0,
      description: 'Fires high-density ionized plasma bolts that pierce through multiple enemies.',
    });

    this.weapons.set('grenade', {
      id: 'grenade',
      name: 'M79 Thumper',
      category: 'Explosive',
      damage: 180,
      fireRate: 0.9,
      magazineSize: 1,
      currentAmmo: 1,
      reserveAmmo: 12,
      maxReserveAmmo: 20,
      reloadTime: 1.8,
      isAutomatic: false,
      spread: 0.02,
      bulletSpeed: 32,
      bulletColor: '#ea580c',
      range: 30,
      unlocked: false,
      price: 3600,
      upgradeLevel: 0,
      description: 'Launches high-explosive 40mm grenades with devastating area destruction.',
    });

    this.weapons.set('minigun', {
      id: 'minigun',
      name: 'GAU-19 Vulcan Minigun',
      category: 'Heavy Support',
      damage: 28,
      fireRate: 17.0,
      magazineSize: 100,
      currentAmmo: 100,
      reserveAmmo: 300,
      maxReserveAmmo: 600,
      reloadTime: 3.2,
      isAutomatic: true,
      spread: 0.11,
      bulletSpeed: 75,
      bulletColor: '#fbbf24',
      range: 42,
      unlocked: false,
      price: 5000,
      upgradeLevel: 0,
      description: 'Rotary multi-barrel heavy chaingun that suppresses entire zombie hordes with devastating lead.',
    });
  }

  private initThree() {
    this.isTouchDevice = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, this.isTouchDevice ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !this.isTouchDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080d); // Deep moody dystopian night
    this.scene.fog = new THREE.FogExp2(0x06080d, 0.024);

    // Studio Environment Reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 120);
    this.camera.position.set(0, 30, 35);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera); // needed so the first-person gun viewmodel renders

    // Particles system
    this.particles = new ParticleSystem(this.scene);

    // Lighting Rig
    // 1. Cool sky / warm ground hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 0.7);
    this.scene.add(this.hemiLight);

    // 2. Warm moonlight key light with soft shadow mapping
    this.dirLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    this.dirLight.position.set(25, 40, 20);
    this.dirLight.castShadow = !this.isSoftwareGl && !this.isTouchDevice;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 80;
    const d = 26;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    // Pre-warm shaders
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private initWorld() {
    // 1. Asphalt Road Ground
    const asphaltTex = TextureGenerator.getAsphaltTexture(this.renderer);
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.85,
      metalness: 0.15,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // 2. Map geometry (buildings, props, barrels) is built per mission
    this.buildMap('city');

    // 7. Player Character
    this.playerGroup = ModelFactory.createPlayer();
    this.playerGroup.position.set(0, 0, 0);
    this.scene.add(this.playerGroup);

    const fl = this.playerGroup.getObjectByName('flashlight');
    if (fl && fl instanceof THREE.SpotLight) {
      this.playerFlashlight = fl;
    }
  }

  private initBloodDecals() {
    const bloodTex = TextureGenerator.getBloodSplatterTexture();
    const decalGeo = new THREE.PlaneGeometry(1.4, 1.4);
    const decalMat = new THREE.MeshBasicMaterial({
      map: bloodTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    for (let i = 0; i < this.maxDecals; i++) {
      const decal = new THREE.Mesh(decalGeo, decalMat.clone());
      decal.rotation.x = -Math.PI / 2;
      decal.position.set(0, -999, 0);
      this.scene.add(decal);
      this.decalMeshes.push(decal);
    }
  }

  private spawnBloodDecal(x: number, z: number, scale: number = 1.0) {
    const decal = this.decalMeshes[this.decalIndex];
    this.decalIndex = (this.decalIndex + 1) % this.maxDecals;

    decal.position.set(x + (Math.random() - 0.5) * 0.4, 0.03, z + (Math.random() - 0.5) * 0.4);
    decal.rotation.z = Math.random() * Math.PI * 2;
    decal.scale.set(scale, scale, 1);
  }

  private spawnBarrels(barrelCoords: [number, number][]) {
    barrelCoords.forEach(([x, z]) => {
      const barrel = ModelFactory.createExplosiveBarrel();
      barrel.position.set(x, 0, z);
      this.scene.add(barrel);
      this.mapObjects.push(barrel);
      this.explosiveBarrels.push({
        group: barrel,
        position: new THREE.Vector3(x, 0, z),
        radius: 0.55,
        hp: 30,
      });
      this.obstacles.push({ x, z, radius: 0.65 });
    });
  }

  // Build (or rebuild) the arena for a map: visuals, buildings, props and barrels
  private buildMap(mapId: MapId) {
    // Clear previous map
    this.mapObjects.forEach((obj) => {
      this.scene.remove(obj);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
      });
    });
    this.mapObjects = [];
    this.obstacles = [];
    this.explosiveBarrels = [];

    const def = MAPS[mapId];
    this.currentMapId = mapId;

    // Atmosphere
    (this.scene.background as THREE.Color).setHex(def.background);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(def.background);
    fog.density = def.fogDensity;
    this.hemiLight.color.setHex(def.hemiSky);
    this.hemiLight.groundColor.setHex(def.hemiGround);
    this.dirLight.color.setHex(def.sunColor);
    this.dirLight.intensity = def.sunIntensity;
    (this.groundMesh.material as THREE.MeshStandardMaterial).color.setHex(def.groundTint);

    const L = def.layout;
    const add = (obj: THREE.Object3D) => {
      this.scene.add(obj);
      this.mapObjects.push(obj);
    };

    L.buildings.forEach((b) => {
      const building = ModelFactory.createBuildingBlock(b.w, b.h, b.d, this.renderer);
      building.position.set(b.x, 0, b.z);
      add(building);
      this.obstacles.push({ x: b.x, z: b.z, radius: Math.max(b.w, b.d) * 0.45 });
    });

    L.lamps.forEach(([x, z]) => {
      const { lampGroup } = ModelFactory.createStreetlamp();
      lampGroup.position.set(x, 0, z);
      add(lampGroup);
      this.obstacles.push({ x, z, radius: 0.8 });
    });

    L.cars.forEach((c) => {
      const car = ModelFactory.createWreckedCar(this.renderer);
      car.position.set(c.x, 0, c.z);
      car.rotation.y = c.rot;
      add(car);
      this.obstacles.push({ x: c.x, z: c.z, radius: 2.2 });
    });

    L.barricades.forEach((b) => {
      const barricade = ModelFactory.createBarricade(this.renderer);
      barricade.position.set(b.x, 0, b.z);
      barricade.rotation.y = b.rot;
      add(barricade);
      this.obstacles.push({ x: b.x, z: b.z, radius: 1.5 });
    });

    this.spawnBarrels(L.barrels);
  }

  // --- MISSIONS (maps, levels, difficulty) ---

  public startMission(config: MissionConfig) {
    this.mission = config;
    this.startGame();
  }

  private applyMission() {
    this.levelDef = this.mission.levelId ? LEVELS.find((l) => l.id === this.mission.levelId) ?? null : null;
    this.difficulty = DIFFICULTIES[this.mission.difficulty];
    const mapId = this.levelDef ? this.levelDef.map : this.mission.map;
    this.buildMap(mapId);
    this.callbacks.onMissionChange?.({
      levelId: this.levelDef ? this.levelDef.id : null,
      name: this.levelDef ? this.levelDef.name : 'Endless Survival',
      mapName: MAPS[mapId].name,
      waveGoal: this.levelDef ? this.levelDef.waves : null,
      difficultyName: this.difficulty.name,
    });
  }

  // Wave number used to scale enemy mix and strength (later levels start tougher)
  private get effWave(): number {
    return this.currentWave + (this.levelDef ? this.levelDef.waveOffset : 0);
  }

  private completeLevel() {
    const level = this.levelDef!;
    const bonus = 500 * level.id;
    this.playerStats.score += bonus;
    unlockLevel(level.id + 1);

    const currentHigh = parseInt(localStorage.getItem('outpost_zero_highscore') || '0', 10);
    if (this.playerStats.score > currentHigh) {
      localStorage.setItem('outpost_zero_highscore', this.playerStats.score.toString());
    }

    sound.setHeartbeat(false);
    sound.playLevelUp();
    this.setGameState('level_complete');
    this.callbacks.onLevelComplete?.({
      levelId: level.id,
      levelName: level.name,
      kills: this.playerStats.zombiesKilled,
      score: this.playerStats.score,
      bonus,
      hasNext: level.id < LEVELS.length,
    });
  }

  // Data for the minimap component (read every frame by the UI, no React state)
  public getMinimapData(): MinimapData {
    return {
      px: this.playerPos.x,
      pz: this.playerPos.z,
      rotation: this.playerRotation,
      headingUp: this.cameraMode !== 'topdown',
      arenaHalf: 45,
      accent: MAPS[this.currentMapId].minimapColor,
      mapName: MAPS[this.currentMapId].name,
      obstacles: this.obstacles,
      enemies: this.enemies.map((e) => ({ x: e.group.position.x, z: e.group.position.z, type: e.stats.type })),
      drops: this.dropItems.map((d) => ({ x: d.x, z: d.z, type: d.type })),
    };
  }

  private initInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keysHeld[e.code] = true;

      // Quick audio context activation
      sound.ensureContext();

      if (e.code === 'KeyR' && this.gameState === 'playing') {
        this.reloadCurrentWeapon();
      }

      if (e.code === 'KeyC' && this.gameState === 'playing') {
        this.cycleCamera();
      }

      if (e.code === 'Space' && this.gameState === 'playing') {
        this.performDash();
      }

      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
        const idMap: { [k: string]: WeaponId } = {
          Digit1: 'pistol',
          Digit2: 'rifle',
          Digit3: 'shotgun',
          Digit4: 'plasma',
          Digit5: 'grenade',
          Digit6: 'minigun',
        };
        const targetId = idMap[e.code];
        if (this.gameState === 'playing' && this.weapons.get(targetId)?.unlocked) {
          this.switchWeapon(targetId);
        }
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        // Browsers release pointer lock on Esc; avoid double-toggling pause
        if (e.code === 'Escape' && performance.now() - this.lastLockLossTime < 250) return;
        if (this.gameState === 'playing') {
          this.setGameState('paused');
        } else if (this.gameState === 'paused') {
          this.setGameState('playing');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysHeld[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keysHeld = {};
      this.isPointerDown = false;
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const rect = this.canvas.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.gameState === 'playing' && this.cameraMode !== 'topdown') {
        this.yaw -= e.movementX * 0.0024;
        this.pitch -= e.movementY * 0.0024;
        this.clampPitch();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.gameState === 'playing' && this.cameraMode !== 'topdown') {
        // Player pressed Esc (or the browser released the mouse): pause
        this.lastLockLossTime = performance.now();
        this.setGameState('paused');
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        sound.ensureContext(); // unlock audio on first touch
        return;
      }
      if (e.button === 0) {
        sound.ensureContext();
        this.isPointerDown = true;
        if (this.gameState === 'playing' && this.cameraMode !== 'topdown') this.tryLockPointer();
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.isPointerDown = false;
    });

    // Auto-pause when the app/tab goes to the background (calls, app switching on phones)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.gameState === 'playing') this.setGameState('paused');
    });

    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  private handleResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // --- GAMEPLAY LIFECYCLE ---

  public startGame() {
    sound.ensureContext();
    this.setGameState('playing');
    this.resetGame();
    this.startWave(1);
  }

  public restartGame() {
    this.resetGame();
    this.setGameState('playing');
    this.startWave(1);
  }

  public resetGame() {
    this.applyMission();
    // Reset player position & stats
    this.playerPos.set(0, 0, 0);
    this.playerVelocity.set(0, 0, 0);
    this.pitch = 0;
    this.playerStats.hp = 100;
    this.playerStats.maxHp = 100;
    this.playerStats.stamina = 100;
    this.playerStats.score = 0;
    this.playerStats.credits = (this.levelDef ? this.levelDef.startCredits : 400) + this.difficulty.bonusCredits;
    this.playerStats.combo = 0;
    this.playerStats.comboTimer = 0;
    this.playerStats.zombiesKilled = 0;
    this.playerStats.wavesCompleted = 0;
    this.playerStats.activePerks = [];
    this.playerStats.damageMultiplier = 1.0;
    this.playerStats.fireRateMultiplier = 1.0;
    this.playerStats.speedMultiplier = 1.0;
    this.playerStats.vampiricChance = 0;
    this.playerStats.hasKineticShockwave = false;
    this.playerStats.hasNapalmRounds = false;

    // Reset weapons
    this.weapons.forEach((w) => {
      w.currentAmmo = w.magazineSize;
      w.reserveAmmo = Math.round(w.maxReserveAmmo / 2);
      if (w.id === 'pistol' || w.id === 'rifle') {
        w.unlocked = true;
      } else {
        w.unlocked = false;
      }
    });
    this.currentWeaponId = 'rifle';
    this.isReloading = false;
    this.updatePlayerGunModel();

    // Clear enemies
    this.enemies.forEach((e) => this.scene.remove(e.group));
    this.enemies = [];

    // Clear bullets
    this.bullets.forEach((b) => this.scene.remove(b.mesh));
    this.bullets = [];

    // Clear acid pools
    this.acidPoolMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.acidPoolMeshes.clear();
    this.acidPools = [];

    // Clear crates
    this.dropMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.dropMeshes.clear();
    this.dropItems = [];

    this.currentWave = 1;
    this.waveSpawnTimer = 0;
  }

  public setGameState(state: GameState) {
    this.gameState = state;
    this.callbacks.onStateChange(state);

    if (state === 'playing') {
      if (this.cameraMode !== 'topdown') this.tryLockPointer();
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    if (state === 'title') {
      sound.setHeartbeat(false);
    }
  }

  public switchWeapon(id: WeaponId) {
    const target = this.weapons.get(id);
    if (!target || !target.unlocked) return;
    this.currentWeaponId = id;
    this.isReloading = false;
    this.updatePlayerGunModel();
  }

  private updatePlayerGunModel() {
    const arms = this.playerGroup.getObjectByName('arms');
    if (!arms) return;
    const oldGun = arms.getObjectByName('weaponMesh');
    if (oldGun) arms.remove(oldGun);

    const newGun = ModelFactory.createGunMesh(this.currentWeaponId);
    newGun.name = 'weaponMesh';
    newGun.position.set(0.16, 0.05, 0.45);
    arms.add(newGun);
    this.updateViewGun();
  }

  // First-person gun attached to the camera
  private updateViewGun() {
    if (this.viewGun) {
      this.camera.remove(this.viewGun);
      this.viewGun = null;
    }
    if (this.cameraMode !== 'first') return;
    const gun = ModelFactory.createGunMesh(this.currentWeaponId);
    gun.rotation.y = Math.PI;
    gun.scale.setScalar(0.8);
    gun.position.set(0.26, -0.26, -0.7);
    this.camera.add(gun);
    this.viewGun = gun;
  }

  public reloadCurrentWeapon() {
    const weapon = this.weapons.get(this.currentWeaponId);
    if (!weapon || this.isReloading) return;
    if (weapon.currentAmmo >= weapon.magazineSize) return;
    if (weapon.reserveAmmo <= 0) {
      sound.playEmptyClick();
      return;
    }

    this.isReloading = true;
    this.reloadTimer = weapon.reloadTime;
    sound.playReload();
  }

  public performDash() {
    const now = this.clock.getElapsedTime();
    if (now - this.playerStats.lastDashTime < this.playerStats.dashCooldown) return;
    if (this.playerStats.stamina < 30) return;

    this.playerStats.stamina -= 30;
    this.playerStats.lastDashTime = now;
    this.playerStats.isDashing = true;

    sound.playDash();

    // Dash burst vector
    const dashInput = this.getMoveInput();
    let dx = dashInput.x;
    let dz = dashInput.z;

    if (dx === 0 && dz === 0) {
      // Dash in aim direction
      dx = Math.sin(this.playerRotation);
      dz = Math.cos(this.playerRotation);
    }

    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    this.playerVelocity.set((dx / len) * 24, 0, (dz / len) * 24);

    // Shockwave perk check
    if (this.playerStats.hasKineticShockwave) {
      this.triggerShockwave(this.playerPos.x, this.playerPos.z);
    }
  }

  private triggerShockwave(x: number, z: number) {
    this.particles.emit(x, 0.5, z, 35, 0x06b6d4, 8, 0.4, 0);
    sound.playExplosion(false);

    // Push & damage nearby zombies
    this.enemies.forEach((e) => {
      const dist = e.group.position.distanceTo(this.playerPos);
      if (dist < 5.5) {
        e.stats.hp -= 40;
        e.hitFlashTimer = 0.12;
        const pushDir = _vec1.subVectors(e.group.position, this.playerPos).normalize();
        e.velocity.addScaledVector(pushDir, 16);
      }
    });
  }

  // Wave Spawning System
  private startWave(waveNum: number) {
    this.currentWave = waveNum;
    this.zombiesSpawnedSoFar = 0;
    // Wave formula
    const ew = this.effWave;
    this.waveTotalZombies = Math.max(4, Math.round((10 + ew * 6 + (ew >= 5 ? 10 : 0)) * this.difficulty.enemyCount));
    this.zombiesRemainingInWave = this.waveTotalZombies;

    // Drop supply crates around the map
    this.spawnWaveSupplyDrops(waveNum);

    sound.playLevelUp();
    this.callbacks.onFloatingTextAdd({
      id: Math.random().toString(),
      text: `WAVE ${waveNum}: MUTANT OUTBREAK`,
      x: this.playerPos.x,
      y: 3.5,
      z: this.playerPos.z,
      color: '#ef4444',
      age: 0,
      life: 2.2,
      scale: 1.5,
    });
  }

  private spawnWaveSupplyDrops(waveNum: number) {
    // Health crate
    this.spawnDrop(
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
      'health',
      40
    );

    // Ammo crate
    this.spawnDrop(
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
      'ammo',
      1
    );

    // Weapon unlock drops on specific waves!
    if (waveNum === 2 && !this.weapons.get('shotgun')?.unlocked) {
      this.spawnDrop((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 'weapon_unlock', 1, 'shotgun');
    } else if (waveNum === 4 && !this.weapons.get('plasma')?.unlocked) {
      this.spawnDrop((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 'weapon_unlock', 1, 'plasma');
    } else if (waveNum === 6 && !this.weapons.get('grenade')?.unlocked) {
      this.spawnDrop((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 'weapon_unlock', 1, 'grenade');
    }
  }

  private spawnDrop(x: number, z: number, type: 'health' | 'ammo' | 'weapon_unlock', amount: number, weaponToUnlock?: WeaponId) {
    const id = Math.random().toString();
    const dropMesh = ModelFactory.createCrate(type);
    dropMesh.position.set(x, 0, z);
    this.scene.add(dropMesh);

    this.dropMeshes.set(id, dropMesh);
    this.dropItems.push({ id, type, x, z, amount, weaponToUnlock });
  }

  private spawnNextEnemyInWave() {
    if (this.zombiesSpawnedSoFar >= this.waveTotalZombies) return;

    // Pick spawn archetype based on wave
    let type: EnemyType = 'walker';
    const rand = Math.random();

    const ew = this.effWave;
    if (ew >= 5 && this.zombiesSpawnedSoFar === 0) {
      type = 'brute'; // Wave boss
    } else if (ew >= 4 && rand < 0.22) {
      type = 'exploder';
    } else if (ew >= 3 && rand < 0.35) {
      type = 'spitter';
    } else if (ew >= 2 && rand < 0.45) {
      type = 'sprinter';
    } else {
      type = 'walker';
    }

    // Spawn around outer rim
    const angle = Math.random() * Math.PI * 2;
    const distance = 28 + Math.random() * 8;
    const sx = this.playerPos.x + Math.cos(angle) * distance;
    const sz = this.playerPos.z + Math.sin(angle) * distance;

    const group = ModelFactory.createZombie(type);
    group.position.set(sx, 0, sz);
    this.scene.add(group);

    // Enemy Stats
    let maxHp = 40;
    let speed = 2.2;
    let damage = 12;
    let scoreVal = 15;

    if (type === 'sprinter') {
      maxHp = 25;
      speed = 4.8;
      damage = 14;
      scoreVal = 25;
      sound.playSprinterScreech();
    } else if (type === 'spitter') {
      maxHp = 50;
      speed = 2.4;
      damage = 22;
      scoreVal = 35;
    } else if (type === 'exploder') {
      maxHp = 35;
      speed = 3.0;
      damage = 45;
      scoreVal = 30;
    } else if (type === 'brute') {
      maxHp = 360 + ew * 40;
      speed = 1.4;
      damage = 38;
      scoreVal = 200;
      sound.playBruteRoar();
      this.addScreenShake(0.4);
    } else {
      sound.playZombieGroan();
    }

    maxHp = Math.round(maxHp * this.difficulty.enemyHp);
    speed *= this.difficulty.enemySpeed;
    damage = Math.round(damage * this.difficulty.enemyDamage);

    this.enemies.push({
      group,
      stats: {
        type,
        name: type.toUpperCase(),
        maxHp,
        hp: maxHp,
        speed: speed * (0.9 + Math.random() * 0.2),
        damage,
        attackRange: type === 'spitter' ? 12 : type === 'brute' ? 2.5 : 1.4,
        attackCooldown: 1.0,
        scoreValue: scoreVal,
        telegraphTimer: 0,
        isTelegraphing: false,
        scale: 1,
        color: 0xffffff,
      },
      velocity: new THREE.Vector3(),
      windupTimer: 0,
      hitFlashTimer: 0,
      acidSpitTimer: 2.0 + Math.random() * 2,
      ignitedTimer: 0,
    });

    this.zombiesSpawnedSoFar++;
  }

  // --- WEAPON SHOOTING ---

  private tryShoot() {
    if (this.isReloading) return;
    const weapon = this.weapons.get(this.currentWeaponId);
    if (!weapon) return;

    const now = this.clock.getElapsedTime();
    const interval = 1 / (weapon.fireRate * this.playerStats.fireRateMultiplier);
    if (now - this.lastShootTime < interval) return;

    if (weapon.currentAmmo <= 0) {
      sound.playEmptyClick();
      this.reloadCurrentWeapon();
      this.lastShootTime = now;
      return;
    }

    weapon.currentAmmo--;
    this.lastShootTime = now;

    // Gun audio
    if (weapon.id === 'shotgun') sound.playShotgun();
    else if (weapon.id === 'plasma') sound.playPlasma();
    else if (weapon.id === 'grenade') sound.playGrenadeLaunch();
    else if (weapon.id === 'rifle' || weapon.id === 'minigun') sound.playAssaultRifle();
    else sound.playPistol();

    // Where bullets leave from: the crosshair line in 1st/3rd person, the gun muzzle in top-down
    const useCrosshair = this.cameraMode !== 'topdown';
    let origin: THREE.Vector3;
    if (useCrosshair) {
      this.camera.getWorldDirection(_camFwd);
      _camToPlayer.subVectors(this.playerPos, this.camera.position);
      const d = Math.max(0.5, _camToPlayer.dot(_camFwd) + 0.7);
      origin = _camOrigin.copy(this.camera.position).addScaledVector(_camFwd, d);
    } else {
      const muzzle = this.playerGroup.getObjectByName('muzzlePoint');
      origin = _vec1;
      if (muzzle) muzzle.getWorldPosition(origin);
      else origin.copy(this.playerPos).add(new THREE.Vector3(0, 0.9, 0));
    }

    this.particles.emitSparks(origin.x, origin.y, origin.z, useCrosshair ? _camFwd : _targetDir, 6);

    // Screen kick
    this.addScreenShake(weapon.id === 'shotgun' || weapon.id === 'grenade' ? 0.25 : 0.08);

    // Spawn Projectiles
    const pellets = weapon.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const spread = (Math.random() - 0.5) * weapon.spread;
      const baseDir = useCrosshair ? _camFwd : _targetDir;
      const bulletDir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);

      const bulletGeo =
        weapon.id === 'plasma'
          ? new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6)
          : weapon.id === 'grenade'
          ? new THREE.SphereGeometry(0.14, 8, 8)
          : new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6);

      bulletGeo.rotateX(Math.PI / 2);

      const bulletMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(weapon.bulletColor),
      });

      const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);
      bulletMesh.position.copy(origin);
      bulletMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), bulletDir);
      this.scene.add(bulletMesh);

      this.bullets.push({
        mesh: bulletMesh,
        position: bulletMesh.position,
        velocity: bulletDir.multiplyScalar(weapon.bulletSpeed),
        damage: weapon.damage * this.playerStats.damageMultiplier,
        range: weapon.range,
        distanceTraveled: 0,
        pierceCount: weapon.id === 'plasma' ? 3 : 1,
        isRocket: weapon.id === 'grenade',
      });
    }
  }

  public addScreenShake(amount: number) {
    this.screenShakeIntensity = Math.min(this.screenShakeIntensity + amount, 0.8);
  }

  // --- MAIN LOOP ---

  private startLoop() {
    const tick = () => {
      const rawDt = this.clock.getDelta();
      // Clamp dt to prevent physics tunneling
      const dt = Math.min(rawDt, 0.05);

      if (this.gameState === 'playing') {
        this.updateGame(dt);
      } else if (this.gameState === 'title') {
        this.updateTitleWorld(dt);
      }

      this.render();

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  // Software WebGL pacing helper from Three.js skill
  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 60);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateTitleWorld(dt: number) {
    // Gentle cinematic camera orbit around city center
    const elapsed = this.clock.getElapsedTime();
    const orbitRadius = 26;
    this.camera.position.x = Math.sin(elapsed * 0.15) * orbitRadius;
    this.camera.position.z = Math.cos(elapsed * 0.15) * orbitRadius;
    this.camera.position.y = 12 + Math.sin(elapsed * 0.1) * 3;
    this.camera.lookAt(0, 1.5, 0);

    this.particles.update(dt, new THREE.Vector3(0, 0, 0));
  }

  private updateGame(dt: number) {
    // Hitstop frame freeze logic
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateAcidPools(dt);
    this.updateDrops(dt);
    this.updateWaveManager(dt);
    this.updateCamera(dt);
    this.particles.update(dt, this.playerPos);

    // Check for active boss
    const bruteEnemy = this.enemies.find((e) => e.stats.type === 'brute');
    const bossInfo: BossInfo | null = bruteEnemy
      ? {
          name: 'MUTANT BRUTE // APOCALYPSE JUGGERNAUT',
          type: 'brute',
          hp: Math.max(0, Math.ceil(bruteEnemy.stats.hp)),
          maxHp: bruteEnemy.stats.maxHp,
        }
      : null;

    // Callbacks to UI
    const activeWeapon = this.weapons.get(this.currentWeaponId)!;
    this.callbacks.onPlayerUpdate(this.playerStats, activeWeapon);
    this.callbacks.onWaveUpdate(
      this.currentWave,
      this.zombiesRemainingInWave,
      this.waveTotalZombies,
      bossInfo
    );
  }

  private updatePlayer(dt: number) {
    // 1. Movement Inputs
    const move = this.getMoveInput();
    const mx = move.x;
    const mz = move.z;

    const isMoving = mx !== 0 || mz !== 0;
    if (isMoving && !this.playerStats.isDashing) {
      const len = Math.sqrt(mx * mx + mz * mz) || 1;
      const targetSpeed = this.playerStats.speed * this.playerStats.speedMultiplier;
      this.playerVelocity.x = THREE.MathUtils.damp(this.playerVelocity.x, (mx / len) * targetSpeed, 14, dt);
      this.playerVelocity.z = THREE.MathUtils.damp(this.playerVelocity.z, (mz / len) * targetSpeed, 14, dt);
    } else if (!this.playerStats.isDashing) {
      this.playerVelocity.x = THREE.MathUtils.damp(this.playerVelocity.x, 0, 16, dt);
      this.playerVelocity.z = THREE.MathUtils.damp(this.playerVelocity.z, 0, 16, dt);
    }

    // Dash duration check
    const now = this.clock.getElapsedTime();
    if (this.playerStats.isDashing && now - this.playerStats.lastDashTime > this.playerStats.dashDuration) {
      this.playerStats.isDashing = false;
    }

    // Stamina recovery
    if (this.playerStats.stamina < this.playerStats.maxStamina) {
      this.playerStats.stamina = Math.min(this.playerStats.maxStamina, this.playerStats.stamina + dt * 25);
    }

    // Apply movement with obstacle collision
    const nextX = this.playerPos.x + this.playerVelocity.x * dt;
    const nextZ = this.playerPos.z + this.playerVelocity.z * dt;

    if (!this.checkObstacleCollision(nextX, this.playerPos.z, 0.5)) {
      this.playerPos.x = nextX;
    }
    if (!this.checkObstacleCollision(this.playerPos.x, nextZ, 0.5)) {
      this.playerPos.z = nextZ;
    }

    // Arena boundary clamp (-45 to 45)
    this.playerPos.x = Math.max(-45, Math.min(45, this.playerPos.x));
    this.playerPos.z = Math.max(-45, Math.min(45, this.playerPos.z));

    this.playerGroup.position.copy(this.playerPos);

    // 2. Aim: mouse-look yaw in 1st/3rd person, ground raycast in top-down
    if (this.cameraMode === 'topdown') {
      _raycaster.setFromCamera(_mouse, this.camera);
      const hitPoint = _vec2;
      if (_raycaster.ray.intersectPlane(_groundPlane, hitPoint)) {
        this.aimTarget.copy(hitPoint);
      }

      if (this.touchAimVector.x !== 0 || this.touchAimVector.y !== 0) {
        this.aimTarget.set(
          this.playerPos.x + this.touchAimVector.x * 10,
          0,
          this.playerPos.z + this.touchAimVector.y * 10
        );
      }
    } else {
      if (this.touchAimVector.x !== 0 || this.touchAimVector.y !== 0) {
        this.yaw = Math.atan2(this.touchAimVector.x, this.touchAimVector.y);
      }
      this.aimTarget.set(
        this.playerPos.x + Math.sin(this.yaw) * 10,
        0,
        this.playerPos.z + Math.cos(this.yaw) * 10
      );
    }

    // Calculate rotation angle
    _targetDir.subVectors(this.aimTarget, this.playerPos);
    _targetDir.y = 0;
    _targetDir.normalize();

    this.playerRotation = Math.atan2(_targetDir.x, _targetDir.z);
    this.playerGroup.rotation.y = this.playerRotation;

    // Leg walk cycle animation
    const legs = this.playerGroup.getObjectByName('legs');
    if (legs && isMoving) {
      legs.rotation.x = Math.sin(this.clock.getElapsedTime() * 14) * 0.35;
    } else if (legs) {
      legs.rotation.x = 0;
    }

    // Heartbeat audio when under 30 HP
    sound.setHeartbeat(this.playerStats.hp < 30);
  }

  private checkObstacleCollision(x: number, z: number, radius: number): boolean {
    for (const obs of this.obstacles) {
      const dx = x - obs.x;
      const dz = z - obs.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < obs.radius + radius) return true;
    }
    return false;
  }

  private updateWeapons(dt: number) {
    const weapon = this.weapons.get(this.currentWeaponId);
    if (!weapon) return;

    // Reloading countdown
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const needed = weapon.magazineSize - weapon.currentAmmo;
        const refill = Math.min(needed, weapon.reserveAmmo);
        weapon.currentAmmo += refill;
        if (weapon.id !== 'pistol') {
          weapon.reserveAmmo -= refill;
        }
      }
    }

    // Auto-fire or semi-fire
    if (this.isPointerDown) {
      this.tryShoot();
    }

    // Combo timer
    if (this.playerStats.comboTimer > 0) {
      this.playerStats.comboTimer -= dt;
      if (this.playerStats.comboTimer <= 0) {
        this.playerStats.combo = 0;
      }
    }
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const moveStep = _vec3.copy(b.velocity).multiplyScalar(dt);
      b.position.add(moveStep);
      b.distanceTraveled += moveStep.length();

      // Check distance range
      if (b.distanceTraveled >= b.range) {
        if (b.isRocket) this.explodeRocket(b.position.x, b.position.z, b.damage);
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      // Shots aimed down hit the ground; shots aimed far up leave the arena
      if (!b.isAcid && (b.position.y < 0.05 || b.position.y > 14)) {
        if (b.isRocket) this.explodeRocket(b.position.x, b.position.z, b.damage);
        else if (b.position.y < 0.05) this.particles.emitSparks(b.position.x, 0.05, b.position.z, undefined, 4);
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      // Check obstacles
      if (this.checkObstacleCollision(b.position.x, b.position.z, 0.2)) {
        if (b.isRocket) this.explodeRocket(b.position.x, b.position.z, b.damage);
        else this.particles.emitSparks(b.position.x, b.position.y, b.position.z, undefined, 4);
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      // Check explosive barrels
      let barrelHit = false;
      for (const barrel of this.explosiveBarrels) {
        if (barrel.hp > 0) {
          const bdx = barrel.position.x - b.position.x;
          const bdz = barrel.position.z - b.position.z;
          const barrelDist = Math.sqrt(bdx * bdx + bdz * bdz);
          if (barrelDist < barrel.radius + 0.4 && b.position.y <= 1.9 && b.position.y >= -0.2) {
            barrel.hp -= b.damage;
            this.particles.emitSparks(b.position.x, b.position.y, b.position.z, undefined, 5);
            if (barrel.hp <= 0) {
              this.detonateBarrel(barrel);
            }
            barrelHit = true;
            break;
          }
        }
      }
      if (barrelHit) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      // Check acid projectiles from spitters hitting player
      if (b.isAcid) {
        const pdx = this.playerPos.x - b.position.x;
        const pdz = this.playerPos.z - b.position.z;
        const pDist = Math.sqrt(pdx * pdx + pdz * pdz);
        if (pDist < 1.0 && b.position.y <= 2.2 && b.position.y >= -0.2) {
          this.damagePlayer(b.damage);
          this.particles.emitAcid(b.position.x, b.position.y, b.position.z, 12);
          this.spawnAcidPool(b.position.x, b.position.z, 2.5, 4);
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }
        if (b.position.y <= 0.15) {
          this.spawnAcidPool(b.position.x, b.position.z, 2.5, 4);
          this.particles.emitAcid(b.position.x, 0.1, b.position.z, 8);
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }
        continue; // Acid projectiles do not collide with zombies
      }

      // Check Zombie Collisions (Horizontal 2D distance so bullet Y ~1.0 matches zombie Y 0.0 with body up to 2.5m)
      let bulletConsumed = false;
      for (let zIdx = this.enemies.length - 1; zIdx >= 0; zIdx--) {
        const enemy = this.enemies[zIdx];
        const hitRadius = enemy.stats.type === 'brute' ? 1.7 : enemy.stats.type === 'exploder' ? 1.1 : 0.95;
        const zMaxY = enemy.stats.type === 'brute' ? 3.6 : 2.7;

        const dx = enemy.group.position.x - b.position.x;
        const dz = enemy.group.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < hitRadius && b.position.y <= zMaxY && b.position.y >= -0.2) {
          // Direct hit!
          sound.playHitFlesh();
          this.particles.emitBlood(b.position.x, b.position.y, b.position.z);
          this.spawnBloodDecal(b.position.x, b.position.z, 0.8);

          enemy.stats.hp -= b.damage;
          enemy.hitFlashTimer = 0.18; // Flash white on damage

          // Napalm perk
          if (this.playerStats.hasNapalmRounds) {
            enemy.ignitedTimer = 3.0;
          }

          // Floating damage number
          this.callbacks.onFloatingTextAdd({
            id: Math.random().toString(),
            text: Math.round(b.damage).toString(),
            x: enemy.group.position.x,
            y: 2.1,
            z: enemy.group.position.z,
            color: '#f87171',
            age: 0,
            life: 0.8,
            scale: 1.1,
          });

          // Knockback
          const knockDir = b.velocity.clone().normalize();
          enemy.velocity.addScaledVector(knockDir, 4.5);

          if (b.isRocket) {
            this.explodeRocket(b.position.x, b.position.z, b.damage);
            bulletConsumed = true;
            break;
          }

          b.pierceCount--;
          if (b.pierceCount <= 0) {
            bulletConsumed = true;
            break;
          }
        }
      }

      if (bulletConsumed) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }
  }

  private explodeRocket(x: number, z: number, baseDmg: number) {
    this.particles.emitExplosion(x, 0.5, z);
    sound.playExplosion(true);
    this.addScreenShake(0.6);
    this.hitstopTimer = 0.05;

    // AoE damage
    this.enemies.forEach((e) => {
      const dist = e.group.position.distanceTo(_vec1.set(x, 0, z));
      if (dist < 6.5) {
        const falloff = 1 - dist / 6.5;
        e.stats.hp -= baseDmg * falloff;
        e.hitFlashTimer = 0.15;
        const push = _vec2.subVectors(e.group.position, _vec1).normalize();
        e.velocity.addScaledVector(push, 20 * falloff);
      }
    });
  }

  private detonateBarrel(barrel: { group: THREE.Group; position: THREE.Vector3; radius: number; hp: number }) {
    this.scene.remove(barrel.group);
    const idx = this.explosiveBarrels.indexOf(barrel);
    if (idx !== -1) this.explosiveBarrels.splice(idx, 1);

    this.particles.emitExplosion(barrel.position.x, 0.5, barrel.position.z);
    sound.playExplosion(true);
    this.addScreenShake(0.5);

    // Large splash damage
    this.enemies.forEach((e) => {
      const dist = e.group.position.distanceTo(barrel.position);
      if (dist < 7.0) {
        e.stats.hp -= 140;
        e.hitFlashTimer = 0.2;
        const push = _vec1.subVectors(e.group.position, barrel.position).normalize();
        e.velocity.addScaledVector(push, 22);
      }
    });

    // Check player proximity
    const playerDist = this.playerPos.distanceTo(barrel.position);
    if (playerDist < 6.0) {
      const dmg = Math.round(45 * (1 - playerDist / 6.0));
      this.damagePlayer(dmg);
    }
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Ignited damage over time
      if (e.ignitedTimer > 0) {
        e.ignitedTimer -= dt;
        e.stats.hp -= 15 * dt;
        this.particles.emit(e.group.position.x, 0.8, e.group.position.z, 2, 0xf97316, 2, 0.3, -1);
      }

      // Death check
      if (e.stats.hp <= 0) {
        this.handleEnemyDeath(e);
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
        continue;
      }

      // Hit flash visual recovery
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
      }

      const distToPlayer = e.group.position.distanceTo(this.playerPos);

      // AI Archetype Behaviors
      if (e.stats.type === 'spitter') {
        // Acid Spitter tries to maintain 9m distance and shoot
        if (distToPlayer > 11) {
          const toPlayer = _vec1.subVectors(this.playerPos, e.group.position).normalize();
          e.velocity.x = toPlayer.x * e.stats.speed;
          e.velocity.z = toPlayer.z * e.stats.speed;
        } else if (distToPlayer < 7) {
          // Back up
          const away = _vec1.subVectors(e.group.position, this.playerPos).normalize();
          e.velocity.x = away.x * e.stats.speed * 0.8;
          e.velocity.z = away.z * e.stats.speed * 0.8;
        } else {
          e.velocity.set(0, 0, 0);
        }

        // Spit attack timer
        e.acidSpitTimer -= dt;
        if (e.acidSpitTimer <= 0) {
          this.spitAcid(e);
          e.acidSpitTimer = 3.5 + Math.random() * 1.5;
        }
      } else if (e.stats.type === 'brute') {
        // Heavy charging tank
        const toPlayer = _vec1.subVectors(this.playerPos, e.group.position).normalize();
        const currentSpeed = distToPlayer < 9 ? e.stats.speed * 2.2 : e.stats.speed;
        e.velocity.x = toPlayer.x * currentSpeed;
        e.velocity.z = toPlayer.z * currentSpeed;

        // Ground stomp shake
        if (Math.random() < 0.05 && distToPlayer < 12) {
          this.addScreenShake(0.04);
        }
      } else {
        // Walker / Sprinter / Exploder: Chase player
        const toPlayer = _vec1.subVectors(this.playerPos, e.group.position).normalize();
        e.velocity.x = toPlayer.x * e.stats.speed;
        e.velocity.z = toPlayer.z * e.stats.speed;
      }

      // Flocking / Zombie separation
      for (let j = 0; j < this.enemies.length; j++) {
        if (i !== j) {
          const other = this.enemies[j];
          const sepDist = e.group.position.distanceTo(other.group.position);
          if (sepDist < 1.2 && sepDist > 0.01) {
            const push = _vec1.subVectors(e.group.position, other.group.position).normalize();
            e.velocity.addScaledVector(push, 2.5);
          }
        }
      }

      // Move zombie
      e.group.position.x += e.velocity.x * dt;
      e.group.position.z += e.velocity.z * dt;

      // Face player
      const angle = Math.atan2(this.playerPos.x - e.group.position.x, this.playerPos.z - e.group.position.z);
      e.group.rotation.y = angle;

      // Update Overhead 3D Billboard Health Bar
      const healthBar = e.group.getObjectByName('healthBarGroup');
      if (healthBar) {
        _quat.copy(e.group.quaternion).invert().multiply(this.camera.quaternion);
        healthBar.quaternion.copy(_quat);

        const hpRatio = Math.max(0, Math.min(1, e.stats.hp / e.stats.maxHp));
        const barWidth = e.stats.type === 'brute' ? 1.6 : e.stats.type === 'exploder' ? 1.1 : 0.85;
        const hpFill = healthBar.getObjectByName('hpFill') as THREE.Mesh;
        if (hpFill) {
          hpFill.scale.x = Math.max(0.001, hpRatio);
          hpFill.position.x = -((1 - hpRatio) * barWidth) / 2;

          const fillMat = hpFill.material as THREE.MeshBasicMaterial;
          if (e.hitFlashTimer > 0) {
            fillMat.color.setHex(0xffffff); // White hit flash
          } else if (hpRatio > 0.5) {
            fillMat.color.setHex(e.stats.type === 'spitter' ? 0x84cc16 : 0x22c55e); // Green / Lime
          } else if (hpRatio > 0.25) {
            fillMat.color.setHex(0xf59e0b); // Amber
          } else {
            fillMat.color.setHex(0xef4444); // Red
          }
        }
      }

      // Attack player if within range
      if (distToPlayer <= e.stats.attackRange && !this.playerStats.isDashing) {
        if (e.stats.type === 'exploder') {
          // Exploder suicide bomb
          this.explodeBoamer(e.group.position.x, e.group.position.z);
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
          continue;
        }

        e.windupTimer += dt;
        if (e.windupTimer >= e.stats.attackCooldown) {
          e.windupTimer = 0;
          this.damagePlayer(e.stats.damage);

          if (e.stats.type === 'brute') {
            // Heavy slam knockback
            const slamDir = _vec1.subVectors(this.playerPos, e.group.position).normalize();
            this.playerVelocity.addScaledVector(slamDir, 16);
            this.addScreenShake(0.4);
          }
        }
      } else {
        e.windupTimer = 0;
      }
    }
  }

  private spitAcid(enemy: { group: THREE.Group }) {
    sound.playAcidSpit();
    const spawnPos = enemy.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const target = this.playerPos.clone();
    const dir = _vec1.subVectors(target, spawnPos).normalize();

    // Spawn green acid projectile
    const geo = new THREE.SphereGeometry(0.25, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x84cc16 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(spawnPos);
    this.scene.add(mesh);

    this.bullets.push({
      mesh,
      position: mesh.position,
      velocity: dir.multiplyScalar(22),
      damage: 18 * this.difficulty.enemyDamage,
      range: 25,
      distanceTraveled: 0,
      pierceCount: 1,
      isAcid: true,
    });
  }

  private explodeBoamer(x: number, z: number) {
    this.particles.emitExplosion(x, 0.5, z);
    sound.playExplosion(true);
    this.addScreenShake(0.5);

    // Create acid pool at explosion center
    this.spawnAcidPool(x, z, 3.5, 6);

    // Damage nearby
    this.enemies.forEach((e) => {
      const dist = e.group.position.distanceTo(_vec1.set(x, 0, z));
      if (dist < 5.0) {
        e.stats.hp -= 80;
        e.hitFlashTimer = 0.15;
      }
    });

    const playerDist = this.playerPos.distanceTo(_vec1.set(x, 0, z));
    if (playerDist < 4.5) {
      this.damagePlayer(35);
    }
  }

  private spawnAcidPool(x: number, z: number, radius: number, duration: number) {
    const id = Math.random().toString();
    const acidTex = TextureGenerator.getAcidTexture();
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const mat = new THREE.MeshBasicMaterial({
      map: acidTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    this.scene.add(mesh);

    this.acidPoolMeshes.set(id, mesh);
    this.acidPools.push({
      id,
      x,
      z,
      radius,
      duration,
      damageRate: 20,
    });
  }

  private updateAcidPools(dt: number) {
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      const pool = this.acidPools[i];
      pool.duration -= dt;

      // Check if player stands in acid
      const dist = Math.sqrt(
        (this.playerPos.x - pool.x) * (this.playerPos.x - pool.x) +
          (this.playerPos.z - pool.z) * (this.playerPos.z - pool.z)
      );
      if (dist < pool.radius) {
        this.damagePlayer(pool.damageRate * dt);
        this.particles.emitAcid(this.playerPos.x, 0.1, this.playerPos.z, 2);
      }

      if (pool.duration <= 0) {
        const mesh = this.acidPoolMeshes.get(pool.id);
        if (mesh) {
          this.scene.remove(mesh);
          this.acidPoolMeshes.delete(pool.id);
        }
        this.acidPools.splice(i, 1);
      }
    }
  }

  private updateDrops(dt: number) {
    for (let i = this.dropItems.length - 1; i >= 0; i--) {
      const drop = this.dropItems[i];
      const mesh = this.dropMeshes.get(drop.id);
      if (mesh) {
        mesh.rotation.y += dt * 1.5;
        mesh.position.y = 0.1 + Math.sin(this.clock.getElapsedTime() * 3) * 0.1;
      }

      // Check pickup
      const dist = this.playerPos.distanceTo(_vec1.set(drop.x, 0, drop.z));
      if (dist < 1.4) {
        sound.playPickup();

        if (drop.type === 'health') {
          this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + drop.amount);
          this.callbacks.onFloatingTextAdd({
            id: Math.random().toString(),
            text: `+${drop.amount} HP`,
            x: this.playerPos.x,
            y: 2.2,
            z: this.playerPos.z,
            color: '#22c55e',
            age: 0,
            life: 1.2,
            scale: 1.2,
          });
        } else if (drop.type === 'ammo') {
          this.weapons.forEach((w) => {
            w.reserveAmmo = w.maxReserveAmmo;
          });
          this.callbacks.onFloatingTextAdd({
            id: Math.random().toString(),
            text: 'AMMO REFILLED',
            x: this.playerPos.x,
            y: 2.2,
            z: this.playerPos.z,
            color: '#eab308',
            age: 0,
            life: 1.2,
            scale: 1.2,
          });
        } else if (drop.type === 'weapon_unlock' && drop.weaponToUnlock) {
          const w = this.weapons.get(drop.weaponToUnlock);
          if (w) {
            w.unlocked = true;
            this.switchWeapon(drop.weaponToUnlock);
            this.callbacks.onFloatingTextAdd({
              id: Math.random().toString(),
              text: `UNLOCKED: ${w.name}!`,
              x: this.playerPos.x,
              y: 2.5,
              z: this.playerPos.z,
              color: '#a855f7',
              age: 0,
              life: 2.0,
              scale: 1.4,
            });
          }
        }

        if (mesh) {
          this.scene.remove(mesh);
          this.dropMeshes.delete(drop.id);
        }
        this.dropItems.splice(i, 1);
      }
    }
  }

  private handleEnemyDeath(enemy: { group: THREE.Group; stats: EnemyStats }) {
    this.particles.emitBlood(enemy.group.position.x, 0.6, enemy.group.position.z, 20);
    this.spawnBloodDecal(enemy.group.position.x, enemy.group.position.z, 1.4);

    if (enemy.stats.type === 'exploder') {
      this.explodeBoamer(enemy.group.position.x, enemy.group.position.z);
    }

    // Combo system
    this.playerStats.combo++;
    this.playerStats.comboTimer = 3.5;
    const comboMultiplier = Math.min(5, 1 + Math.floor(this.playerStats.combo / 4));
    const earned = enemy.stats.scoreValue * comboMultiplier;

    this.playerStats.score += Math.round(earned * this.difficulty.scoreMult);
    this.playerStats.credits += Math.round(earned * this.difficulty.creditMult);
    this.playerStats.zombiesKilled++;
    this.zombiesRemainingInWave--;

    // Vampiric Perk
    if (this.playerStats.vampiricChance > 0 && Math.random() < this.playerStats.vampiricChance) {
      this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 6);
    }

    // Occasional Health/Ammo Drop on kill (12% chance)
    if (Math.random() < 0.12) {
      const type = Math.random() < 0.5 ? 'health' : 'ammo';
      this.spawnDrop(enemy.group.position.x, enemy.group.position.z, type, 30);
    }
  }

  private damagePlayer(amount: number) {
    if (this.playerStats.isDashing) return; // Invulnerability frames on dodge
    this.playerStats.hp -= amount;
    this.addScreenShake(0.3);
    sound.playPlayerHurt();

    if (this.playerStats.hp <= 0) {
      this.playerStats.hp = 0;
      this.triggerGameOver();
    }
  }

  private triggerGameOver() {
    this.setGameState('game_over');
    sound.playGameOver();

    // High score check
    const currentHigh = parseInt(localStorage.getItem('outpost_zero_highscore') || '0', 10);
    const isNewHigh = this.playerStats.score > currentHigh;
    if (isNewHigh) {
      localStorage.setItem('outpost_zero_highscore', this.playerStats.score.toString());
    }

    this.callbacks.onGameOver({
      wave: this.currentWave,
      kills: this.playerStats.zombiesKilled,
      score: this.playerStats.score,
      highscore: Math.max(currentHigh, this.playerStats.score),
    });
  }

  private updateWaveManager(dt: number) {
    // Spawn pacing
    this.waveSpawnTimer -= dt;
    if (this.waveSpawnTimer <= 0 && this.zombiesSpawnedSoFar < this.waveTotalZombies) {
      this.spawnNextEnemyInWave();
      // Wave spawn rate speeds up on higher waves
      this.waveSpawnTimer = Math.max(0.6, 2.2 - this.effWave * 0.15);
    }

    // Check if wave cleared
    if (this.zombiesRemainingInWave <= 0 && this.zombiesSpawnedSoFar >= this.waveTotalZombies) {
      this.waveBreakTimer += dt;
      if (this.waveBreakTimer >= 1.2) {
        this.waveBreakTimer = 0;
        this.playerStats.wavesCompleted++;
        this.playerStats.credits += Math.round((100 + this.currentWave * 25) * this.difficulty.creditMult);
        if (this.levelDef && this.currentWave >= this.levelDef.waves) {
          this.completeLevel();
        } else {
          this.presentPerkSelection();
        }
      }
    }
  }

  private presentPerkSelection() {
    this.setGameState('perk_select');
    sound.playLevelUp();

    const allPerks: Perk[] = [
      {
        id: 'hollow_point',
        name: 'Hollow Point Ammo',
        description: '+25% Bullet Damage across all weapons',
        icon: 'Target',
        rarity: 'rare',
      },
      {
        id: 'combat_medic',
        name: 'Combat Medic Nanites',
        description: '+40 Max HP and instantly restore 60 HP',
        icon: 'HeartPulse',
        rarity: 'common',
      },
      {
        id: 'adrenaline',
        name: 'Adrenaline Surge',
        description: '+20% Sprint Speed and +35% Dash Recharge',
        icon: 'Zap',
        rarity: 'rare',
      },
      {
        id: 'extended_mags',
        name: 'Drum Magazines',
        description: '+50% Ammo Magazine Size on all guns',
        icon: 'Box',
        rarity: 'common',
      },
      {
        id: 'bullet_storm',
        name: 'Rapid Cycle Receiver',
        description: '+30% Faster Fire Rate on all weapons',
        icon: 'Flame',
        rarity: 'epic',
      },
      {
        id: 'kinetic_shockwave',
        name: 'Kinetic Shockwave',
        description: 'Dashing releases a blast that knocks back and damages zombies',
        icon: 'Radio',
        rarity: 'legendary',
      },
      {
        id: 'vampiric_strikes',
        name: 'Vampiric Leech',
        description: '20% chance on zombie kill to siphon +6 HP',
        icon: 'Shield',
        rarity: 'rare',
      },
      {
        id: 'napalm_rounds',
        name: 'Napalm Infusion',
        description: 'Bullets ignite enemies, burning them over 3 seconds',
        icon: 'Sparkles',
        rarity: 'epic',
      },
    ];

    // Filter out already chosen single-tier perks
    const available = allPerks.filter((p) => !this.playerStats.activePerks.includes(p.id));
    // Pick 3 random
    const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 3);
    this.callbacks.onPerkSelectionRequired(shuffled.length > 0 ? shuffled : allPerks.slice(0, 3));
  }

  public applyPerk(perkId: string) {
    this.playerStats.activePerks.push(perkId);

    if (perkId === 'hollow_point') {
      this.playerStats.damageMultiplier += 0.25;
    } else if (perkId === 'combat_medic') {
      this.playerStats.maxHp += 40;
      this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 60);
    } else if (perkId === 'adrenaline') {
      this.playerStats.speedMultiplier += 0.2;
      this.playerStats.dashCooldown *= 0.75;
    } else if (perkId === 'extended_mags') {
      this.weapons.forEach((w) => {
        w.magazineSize = Math.round(w.magazineSize * 1.5);
      });
    } else if (perkId === 'bullet_storm') {
      this.playerStats.fireRateMultiplier += 0.3;
    } else if (perkId === 'kinetic_shockwave') {
      this.playerStats.hasKineticShockwave = true;
    } else if (perkId === 'vampiric_strikes') {
      this.playerStats.vampiricChance += 0.2;
    } else if (perkId === 'napalm_rounds') {
      this.playerStats.hasNapalmRounds = true;
    }

    // Open the store between waves
    this.setGameState('shop');
    this.callbacks.onPlayerUpdate(this.playerStats, this.weapons.get(this.currentWeaponId)!);
  }

  // --- STORE ---

  public getShopItems(): Array<WeaponStats & { ammoCost: number }> {
    return Array.from(this.weapons.values()).map((w) => ({ ...w, ammoCost: this.ammoPrice(w.id) }));
  }

  private pushShopUpdate() {
    this.callbacks.onPlayerUpdate(this.playerStats, this.weapons.get(this.currentWeaponId)!);
  }

  public buyWeapon(id: WeaponId): boolean {
    if (this.gameState !== 'shop') return false;
    const w = this.weapons.get(id);
    if (!w || w.unlocked || this.playerStats.credits < w.price) return false;
    this.playerStats.credits -= w.price;
    w.unlocked = true;
    w.currentAmmo = w.magazineSize;
    w.reserveAmmo = w.maxReserveAmmo;
    this.switchWeapon(id);
    this.pushShopUpdate();
    return true;
  }

  public ammoPrice(id: WeaponId): number {
    const w = this.weapons.get(id);
    if (!w) return 0;
    return Math.max(50, Math.round(w.price * 0.1));
  }

  public buyAmmo(id: WeaponId): boolean {
    if (this.gameState !== 'shop') return false;
    const w = this.weapons.get(id);
    if (!w || !w.unlocked || id === 'pistol') return false;
    const cost = this.ammoPrice(id);
    if (w.reserveAmmo >= w.maxReserveAmmo || this.playerStats.credits < cost) return false;
    this.playerStats.credits -= cost;
    w.reserveAmmo = w.maxReserveAmmo;
    this.pushShopUpdate();
    return true;
  }

  public buyMedkit(): boolean {
    if (this.gameState !== 'shop') return false;
    const cost = 150;
    if (this.playerStats.hp >= this.playerStats.maxHp || this.playerStats.credits < cost) return false;
    this.playerStats.credits -= cost;
    this.playerStats.hp = this.playerStats.maxHp;
    this.pushShopUpdate();
    return true;
  }

  public leaveShop() {
    if (this.gameState !== 'shop') return;
    this.setGameState('playing');
    this.startWave(this.currentWave + 1);
  }

  private updateCamera(dt: number) {
    // Smoothly blend field of view between modes
    const fov = THREE.MathUtils.damp(this.camera.fov, this.cameraFov, 8, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Screen shake amount
    let shakeX = 0;
    let shakeZ = 0;
    if (this.screenShakeIntensity > 0) {
      this.screenShakeIntensity = THREE.MathUtils.damp(this.screenShakeIntensity, 0, 8, dt);
      shakeX = (Math.random() - 0.5) * this.screenShakeIntensity * 1.8;
      shakeZ = (Math.random() - 0.5) * this.screenShakeIntensity * 1.8;
    }

    if (this.cameraMode === 'topdown') {
      this.cameraCurrentPos.x = THREE.MathUtils.damp(this.cameraCurrentPos.x, this.playerPos.x + this.cameraOffset.x, 10, dt);
      this.cameraCurrentPos.y = THREE.MathUtils.damp(this.cameraCurrentPos.y, this.cameraOffset.y, 10, dt);
      this.cameraCurrentPos.z = THREE.MathUtils.damp(this.cameraCurrentPos.z, this.playerPos.z + this.cameraOffset.z, 10, dt);
      this.camera.position.set(this.cameraCurrentPos.x + shakeX, this.cameraCurrentPos.y, this.cameraCurrentPos.z + shakeZ);

      this.cameraLookTarget.x = THREE.MathUtils.damp(this.cameraLookTarget.x, this.playerPos.x, 12, dt);
      this.cameraLookTarget.z = THREE.MathUtils.damp(this.cameraLookTarget.z, this.playerPos.z, 12, dt);
      this.camera.lookAt(this.cameraLookTarget.x, 1.2, this.cameraLookTarget.z);
      return;
    }

    // Facing direction from mouse-look yaw
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);

    if (this.cameraMode === 'first') {
      // Eyes of the survivor
      this.camera.position.set(
        this.playerPos.x + fx * 0.15 + shakeX * 0.4,
        1.6,
        this.playerPos.z + fz * 0.15 + shakeZ * 0.4
      );
      const cpF = Math.cos(this.pitch);
      this.tmpTarget.set(
        this.camera.position.x + fx * cpF * 20,
        this.camera.position.y + Math.sin(this.pitch) * 20,
        this.camera.position.z + fz * cpF * 20
      );
    } else {
      // Over-the-shoulder third person: camera orbits a pivot at head height
      const rx = -fz; // right-hand vector (-cos, sin) in x/z
      const rz = fx;
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      const pivotY = 1.6;
      const camY = Math.max(0.5, pivotY - sp * 4.4 + 0.9);
      this.camera.position.set(
        this.playerPos.x - fx * cp * 4.4 + rx * 0.9 + shakeX * 0.5,
        camY,
        this.playerPos.z - fz * cp * 4.4 + rz * 0.9 + shakeZ * 0.5
      );
      this.tmpTarget.set(
        this.playerPos.x + fx * cp * 14 + rx * 0.9,
        pivotY + sp * 14,
        this.playerPos.z + fz * cp * 14 + rz * 0.9
      );
    }
    this.camera.lookAt(this.tmpTarget);
  }

  // Movement input converted to world space for the active camera mode
  private getMoveInput(): { x: number; z: number } {
    let mx = 0;
    let mz = 0;
    if (this.keysHeld['KeyW'] || this.keysHeld['ArrowUp']) mz -= 1;
    if (this.keysHeld['KeyS'] || this.keysHeld['ArrowDown']) mz += 1;
    if (this.keysHeld['KeyA'] || this.keysHeld['ArrowLeft']) mx -= 1;
    if (this.keysHeld['KeyD'] || this.keysHeld['ArrowRight']) mx += 1;

    if (this.touchMoveVector.x !== 0 || this.touchMoveVector.y !== 0) {
      mx = this.touchMoveVector.x;
      mz = this.touchMoveVector.y;
    }

    if (this.cameraMode === 'topdown' || (mx === 0 && mz === 0)) {
      return { x: mx, z: mz };
    }

    // Relative to facing: forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
    const forward = -mz;
    const strafe = mx;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    return {
      x: fx * forward + -fz * strafe,
      z: fz * forward + fx * strafe,
    };
  }

  private tryLockPointer() {
    if (this.isTouchDevice) return; // no mouse capture on phones/tablets
    if (document.pointerLockElement === this.canvas) return;
    try {
      const result = (this.canvas as HTMLCanvasElement).requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      // Pointer lock unavailable (e.g. no user gesture); mouse-look still works while the cursor moves
    }
  }

  private clampPitch() {
    // Third person needs a smaller range so the camera never dips below the ground
    const min = this.cameraMode === 'third' ? -0.9 : -1.3;
    const max = this.cameraMode === 'third' ? 0.45 : 1.3;
    this.pitch = Math.max(min, Math.min(max, this.pitch));
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public setCameraMode(mode: CameraMode) {
    if (mode === 'third' && this.cameraMode === 'topdown') {
      // Start facing wherever the player was aiming
      this.yaw = this.playerRotation;
    } else if (mode === 'topdown') {
      this.cameraCurrentPos.copy(this.camera.position);
    }
    this.cameraMode = mode;
    this.clampPitch();
    this.cameraFov = mode === 'first' ? 78 : mode === 'third' ? 66 : 46;
    this.playerGroup.visible = mode !== 'first';
    this.updateViewGun();

    if (mode === 'topdown') {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (this.gameState === 'playing') {
      this.tryLockPointer();
    }

    this.callbacks.onCameraModeChange?.(mode);
  }

  public cycleCamera() {
    const order: CameraMode[] = ['third', 'first', 'topdown'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.setCameraMode(next);
    const label = next === 'third' ? 'THIRD PERSON' : next === 'first' ? 'FIRST PERSON' : 'TOP-DOWN';
    this.callbacks.onFloatingTextAdd({
      id: Math.random().toString(),
      text: `CAMERA: ${label}`,
      x: this.playerPos.x,
      y: 2.5,
      z: this.playerPos.z,
      color: '#38bdf8',
      age: 0,
      life: 1.4,
      scale: 1.1,
    });
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  // Touch controls helpers for mobile/tablet
  public setTouchMove(x: number, y: number) {
    this.touchMoveVector.x = x;
    this.touchMoveVector.y = y;
  }

  // Look around by dragging a finger (first/third person)
  public touchLook(dx: number, dy: number) {
    if (this.gameState !== 'playing' || this.cameraMode === 'topdown') return;
    this.yaw -= dx * 0.0055;
    this.pitch -= dy * 0.0055;
    this.clampPitch();
  }

  // Controller right stick: continuous look (rate based, so it needs the frame time)
  public lookRate(x: number, y: number, dt: number) {
    if (this.gameState !== 'playing' || this.cameraMode === 'topdown') return;
    const curve = (v: number) => Math.sign(v) * v * v * 0.45 + v * 0.55; // finer control near the centre
    this.yaw -= curve(x) * 3.4 * dt;
    this.pitch -= curve(y) * 2.4 * dt;
    this.clampPitch();
  }

  public prevWeapon() {
    if (this.gameState !== 'playing') return;
    const order: WeaponId[] = ['pistol', 'rifle', 'shotgun', 'plasma', 'grenade', 'minigun'];
    const start = order.indexOf(this.currentWeaponId);
    for (let i = 1; i <= order.length; i++) {
      const id = order[(start - i + order.length * 2) % order.length];
      if (this.weapons.get(id)?.unlocked) {
        this.switchWeapon(id);
        return;
      }
    }
  }

  public setTouchFire(active: boolean) {
    this.isPointerDown = active;
  }

  public nextWeapon() {
    if (this.gameState !== 'playing') return;
    const order: WeaponId[] = ['pistol', 'rifle', 'shotgun', 'plasma', 'grenade', 'minigun'];
    const start = order.indexOf(this.currentWeaponId);
    for (let i = 1; i <= order.length; i++) {
      const id = order[(start + i) % order.length];
      if (this.weapons.get(id)?.unlocked) {
        this.switchWeapon(id);
        return;
      }
    }
  }

  public setTouchAim(x: number, y: number, isShooting: boolean) {
    this.touchAimVector.x = x;
    this.touchAimVector.y = y;
    this.isPointerDown = isShooting;
  }

  public dispose() {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.renderer.dispose();
  }
}
