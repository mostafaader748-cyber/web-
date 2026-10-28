/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameState = 'title' | 'playing' | 'perk_select' | 'shop' | 'paused' | 'game_over' | 'level_complete';

export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'plasma' | 'grenade' | 'minigun';

export type ShopWeapon = WeaponStats & { ammoCost: number };

export interface WeaponStats {
  id: WeaponId;
  name: string;
  category: string;
  damage: number;
  fireRate: number; // shots per second
  magazineSize: number;
  currentAmmo: number;
  reserveAmmo: number;
  maxReserveAmmo: number;
  reloadTime: number; // in seconds
  isAutomatic: boolean;
  pellets?: number;
  spread: number; // in radians
  bulletSpeed: number;
  bulletColor: string;
  range: number;
  unlocked: boolean;
  price: number;
  upgradeLevel: number;
  description: string;
}

export type EnemyType = 'walker' | 'sprinter' | 'spitter' | 'exploder' | 'brute';

export interface EnemyStats {
  type: EnemyType;
  name: string;
  maxHp: number;
  hp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  scoreValue: number;
  telegraphTimer: number;
  isTelegraphing: boolean;
  scale: number;
  color: number;
}

export interface BossInfo {
  name: string;
  type: EnemyType;
  hp: number;
  maxHp: number;
}

export interface Perk {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon identifier
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  speed: number;
  dashCooldown: number;
  lastDashTime: number;
  isDashing: boolean;
  dashDuration: number;
  score: number;
  credits: number;
  combo: number;
  comboTimer: number;
  zombiesKilled: number;
  wavesCompleted: number;
  activePerks: string[];
  damageMultiplier: number;
  fireRateMultiplier: number;
  speedMultiplier: number;
  vampiricChance: number;
  hasKineticShockwave: boolean;
  hasNapalmRounds: boolean;
}

export interface DropItem {
  id: string;
  type: 'health' | 'ammo' | 'weapon_unlock' | 'nuke';
  x: number;
  z: number;
  weaponToUnlock?: WeaponId;
  amount: number;
}

export interface AcidPool {
  id: string;
  x: number;
  z: number;
  radius: number;
  duration: number; // remaining seconds
  damageRate: number; // per second
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  z: number;
  color: string;
  age: number;
  life: number;
  scale: number;
}
