/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export class TextureGenerator {
  private static cachedTextures = new Map<string, THREE.CanvasTexture>();

  public static getAsphaltTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
    if (this.cachedTextures.has('asphalt')) return this.cachedTextures.get('asphalt')!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Dark distressed asphalt base
    ctx.fillStyle = '#181b20';
    ctx.fillRect(0, 0, 512, 512);

    // Grain and pebble noise
    for (let i = 0; i < 25000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = Math.floor(20 + Math.random() * 25);
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Cracks in road
    ctx.strokeStyle = '#0a0c0e';
    ctx.lineWidth = 1.8;
    for (let c = 0; c < 8; c++) {
      ctx.beginPath();
      let cx = Math.random() * 512;
      let cy = Math.random() * 512;
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 6; s++) {
        cx += (Math.random() - 0.5) * 60;
        cy += (Math.random() - 0.5) * 60;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Faded yellow divider lines
    ctx.fillStyle = 'rgba(210, 160, 40, 0.45)';
    ctx.fillRect(246, 20, 20, 120);
    ctx.fillRect(246, 180, 20, 120);
    ctx.fillRect(246, 340, 20, 120);

    // Oil slick stains
    ctx.fillStyle = 'rgba(10, 10, 15, 0.6)';
    ctx.beginPath();
    ctx.ellipse(140, 260, 60, 35, 0.4, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.cachedTextures.set('asphalt', texture);
    return texture;
  }

  public static getConcreteTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
    if (this.cachedTextures.has('concrete')) return this.cachedTextures.get('concrete')!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2d333b';
    ctx.fillRect(0, 0, 256, 256);

    // Weathering & pockmarks
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const tone = Math.floor(35 + Math.random() * 30);
      ctx.fillStyle = `rgba(${tone},${tone},${tone}, 0.5)`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Dirt staining at bottom
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(15, 20, 25, 0.0)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.cachedTextures.set('concrete', texture);
    return texture;
  }

  public static getRustedMetalTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
    if (this.cachedTextures.has('rust')) return this.cachedTextures.get('rust')!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Steel base
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0, 0, 256, 256);

    // Rust patches
    for (let i = 0; i < 15; i++) {
      const rx = Math.random() * 256;
      const ry = Math.random() * 256;
      const rad = 15 + Math.random() * 40;
      const grad = ctx.createRadialGradient(rx, ry, 2, rx, ry, rad);
      grad.addColorStop(0, 'rgba(160, 60, 25, 0.8)');
      grad.addColorStop(0.6, 'rgba(110, 40, 15, 0.5)');
      grad.addColorStop(1, 'rgba(50, 40, 35, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rivet rivets
    ctx.fillStyle = '#22252a';
    for (let r = 10; r < 256; r += 40) {
      ctx.beginPath();
      ctx.arc(12, r, 3, 0, Math.PI * 2);
      ctx.arc(244, r, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.cachedTextures.set('rust', texture);
    return texture;
  }

  public static getHazardTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
    if (this.cachedTextures.has('hazard')) return this.cachedTextures.get('hazard')!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#f59e0b'; // Amber yellow
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = '#111827'; // Dark charcoal black stripes
    for (let x = -64; x < 256; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 20, 0);
      ctx.lineTo(x - 10, 64);
      ctx.lineTo(x - 30, 64);
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this.cachedTextures.set('hazard', texture);
    return texture;
  }

  public static getBloodSplatterTexture(): THREE.CanvasTexture {
    if (this.cachedTextures.has('blood')) return this.cachedTextures.get('blood')!;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Deep crimson blood core
    const cx = 64;
    const cy = 64;
    const rad = 25;

    ctx.fillStyle = 'rgba(140, 10, 15, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();

    // Radiating jagged splatters
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = rad + Math.random() * 32;
      const size = 2 + Math.random() * 5;
      const bx = cx + Math.cos(angle) * dist;
      const by = cy + Math.sin(angle) * dist;

      ctx.fillStyle = 'rgba(120, 8, 12, 0.75)';
      ctx.beginPath();
      ctx.arc(bx, by, size, 0, Math.PI * 2);
      ctx.fill();

      // Connecting trail
      ctx.strokeStyle = 'rgba(130, 10, 14, 0.6)';
      ctx.lineWidth = size * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cachedTextures.set('blood', texture);
    return texture;
  }

  public static getAcidTexture(): THREE.CanvasTexture {
    if (this.cachedTextures.has('acid')) return this.cachedTextures.get('acid')!;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(132, 245, 45, 0.9)');
    grad.addColorStop(0.5, 'rgba(74, 222, 128, 0.65)');
    grad.addColorStop(0.85, 'rgba(34, 197, 94, 0.3)');
    grad.addColorStop(1, 'rgba(20, 83, 45, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();

    // Floating toxic bubble dots
    ctx.fillStyle = '#bbf7d0';
    for (let b = 0; b < 10; b++) {
      const bx = 64 + (Math.random() - 0.5) * 50;
      const by = 64 + (Math.random() - 0.5) * 50;
      ctx.beginPath();
      ctx.arc(bx, by, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cachedTextures.set('acid', texture);
    return texture;
  }
}
