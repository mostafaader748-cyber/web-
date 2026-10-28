/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { GameEngine, CameraMode } from './game/GameEngine';
import type { GameState } from './game/types';
import { sound } from './audio/SoundSystem';

interface Options {
  gameState: GameState;
  cameraMode: CameraMode;
  engineRef: MutableRefObject<GameEngine | null>;
}

const DEADZONE = 0.18;
const FOCUS_CLASS = 'pad-focus';

function deadzone(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return (Math.sign(v) * (a - DEADZONE)) / (1 - DEADZONE);
}

/**
 * Standard-mapping gamepad support (Xbox, PlayStation, Switch Pro, most generic pads).
 *
 * Gameplay:  Left stick move · Right stick look/aim · RT fire · A / LT dash · X reload
 *            RB / LB next / previous weapon · Y change camera · Start pause
 * Menus:     D-pad or left stick to move focus · A select · B back · Start confirm
 */
export function useGamepad({ gameState, cameraMode, engineRef }: Options) {
  const [connected, setConnected] = useState(false);
  const stateRef = useRef(gameState);
  const modeRef = useRef(cameraMode);
  stateRef.current = gameState;
  modeRef.current = cameraMode;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let prev: boolean[] = [];
    let hadPad = false;
    let wasPlaying = false;

    // Last values sent to the engine (so we only send changes and never fight touch/mouse input)
    const sent = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
    let lastAim = { x: 0, y: 0 };

    // Menu navigation state
    const nav = { focus: null as HTMLElement | null, scope: null as Element | null, dir: '', nextAt: 0 };

    const getPad = (): Gamepad | null => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
      return null;
    };

    const setFocus = (el: HTMLElement | null) => {
      if (nav.focus && nav.focus !== el) nav.focus.classList.remove(FOCUS_CLASS);
      nav.focus = el;
      if (el) {
        el.classList.add(FOCUS_CLASS);
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };

    const clearFocus = () => {
      setFocus(null);
      nav.scope = null;
      nav.dir = '';
    };

    const focusable = (scope: Element): HTMLElement[] =>
      Array.from(scope.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(
        (el) => el.getClientRects().length > 0
      );

    const moveFocus = (scope: Element, dx: number, dy: number) => {
      const cur = nav.focus;
      const list = focusable(scope);
      if (!cur) {
        setFocus(list[0] ?? null);
        return;
      }
      const cr = cur.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const el of list) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect();
        const ex = r.left + r.width / 2 - cx;
        const ey = r.top + r.height / 2 - cy;
        const along = ex * dx + ey * dy;
        if (along <= 2) continue;
        const perp = Math.abs(ex * dy - ey * dx);
        const score = along + perp * 2.2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best) setFocus(best);
    };

    const releaseGameplay = (engine: GameEngine | null) => {
      if (!engine) return;
      if (sent.mx !== 0 || sent.my !== 0) engine.setTouchMove(0, 0);
      if (sent.ax !== 0 || sent.ay !== 0 || sent.fire) {
        engine.setTouchAim(0, 0, false);
        engine.setTouchFire(false);
      }
      sent.mx = sent.my = sent.ax = sent.ay = 0;
      sent.fire = false;
      lastAim = { x: 0, y: 0 };
    };

    // A real mouse movement means the player went back to mouse aiming
    const onMouse = (e: MouseEvent) => {
      if (lastAim.x !== 0 || lastAim.y !== 0) {
        lastAim = { x: 0, y: 0 };
        if (sent.ax !== 0 || sent.ay !== 0) {
          engineRef.current?.setTouchAim(0, 0, sent.fire);
          sent.ax = sent.ay = 0;
        }
      }
      void e;
    };
    window.addEventListener('mousemove', onMouse);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const pad = getPad();
      if (!!pad !== hadPad) {
        hadPad = !!pad;
        setConnected(!!pad);
        if (!pad) {
          clearFocus();
          releaseGameplay(engineRef.current);
          prev = [];
        }
      }
      if (!pad) return;

      const down = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
      const pressed = (i: number) => down(i) && !prev[i];
      const cur = pad.buttons.map((_, i) => down(i));
      const anyPress = cur.some((v, i) => v && !prev[i]);
      if (anyPress) sound.ensureContext();

      const lx = deadzone(pad.axes[0] ?? 0);
      const ly = deadzone(pad.axes[1] ?? 0);
      const rx = deadzone(pad.axes[2] ?? 0);
      const ry = deadzone(pad.axes[3] ?? 0);
      const fireHeld = (pad.buttons[7]?.value ?? 0) > 0.3 || down(7);

      const state = stateRef.current;
      const engine = engineRef.current;

      if (state === 'playing' && engine) {
        wasPlaying = true;
        const mode = modeRef.current;

        // Movement
        if (lx !== sent.mx || ly !== sent.my) {
          engine.setTouchMove(lx, ly);
          sent.mx = lx;
          sent.my = ly;
        }

        if (mode === 'topdown') {
          // Right stick aims; the character keeps facing the last direction when released
          if (rx !== 0 || ry !== 0) lastAim = { x: rx, y: ry };
          if (lastAim.x !== 0 || lastAim.y !== 0 || fireHeld !== sent.fire) {
            if (lastAim.x !== sent.ax || lastAim.y !== sent.ay || fireHeld !== sent.fire) {
              engine.setTouchAim(lastAim.x, lastAim.y, fireHeld);
              sent.ax = lastAim.x;
              sent.ay = lastAim.y;
              sent.fire = fireHeld;
            }
          }
        } else {
          if (rx !== 0 || ry !== 0) engine.lookRate(rx, ry, dt);
          if (sent.ax !== 0 || sent.ay !== 0) {
            engine.setTouchAim(0, 0, fireHeld);
            sent.ax = sent.ay = 0;
            lastAim = { x: 0, y: 0 };
          }
          if (fireHeld !== sent.fire) {
            engine.setTouchFire(fireHeld);
            sent.fire = fireHeld;
          }
        }

        // Actions
        if (pressed(0) || pressed(6)) engine.performDash();
        if (pressed(2)) engine.reloadCurrentWeapon();
        if (pressed(5) || pressed(15)) engine.nextWeapon();
        if (pressed(4) || pressed(14)) engine.prevWeapon();
        if (pressed(3)) engine.cycleCamera();
        if (pressed(9)) engine.setGameState('paused');
      } else {
        if (wasPlaying) {
          releaseGameplay(engine);
          wasPlaying = false;
        }

        // ---- Menu navigation ----
        const scopes = document.querySelectorAll('[data-pad-scope]');
        const scope = scopes.length ? (scopes[scopes.length - 1] as HTMLElement) : null;
        if (!scope) {
          clearFocus();
        } else {
          const stale =
            scope !== nav.scope ||
            !nav.focus ||
            !nav.focus.isConnected ||
            !scope.contains(nav.focus) ||
            (nav.focus as HTMLButtonElement).disabled;
          if (stale) {
            const primary = scope.querySelector<HTMLElement>('[data-pad-primary]:not([disabled])');
            setFocus(primary ?? focusable(scope)[0] ?? null);
            nav.scope = scope;
            nav.dir = '';
          }

          // Direction from D-pad or left stick
          let vx = (down(15) ? 1 : 0) - (down(14) ? 1 : 0);
          let vy = (down(13) ? 1 : 0) - (down(12) ? 1 : 0);
          if (vx === 0 && Math.abs(lx) > 0.5) vx = Math.sign(lx);
          if (vy === 0 && Math.abs(ly) > 0.5) vy = Math.sign(ly);
          if (vx !== 0 && vy !== 0) {
            if (Math.abs(ly) > Math.abs(lx)) vx = 0;
            else vy = 0;
          }
          const dir = vx || vy ? `${vx},${vy}` : '';
          if (dir) {
            if (dir !== nav.dir) {
              nav.dir = dir;
              nav.nextAt = now + 380;
              moveFocus(scope, vx, vy);
            } else if (now >= nav.nextAt) {
              nav.nextAt = now + 130;
              moveFocus(scope, vx, vy);
            }
          } else {
            nav.dir = '';
          }

          if (pressed(0) && nav.focus) nav.focus.click();
          if (pressed(1)) scope.querySelector<HTMLElement>('[data-pad-back]:not([disabled])')?.click();
          if (pressed(9)) {
            const primary = scope.querySelector<HTMLElement>('[data-pad-primary]:not([disabled])');
            (primary ?? nav.focus)?.click();
          }
        }
      }

      prev = cur;
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouse);
      nav.focus?.classList.remove(FOCUS_CLASS);
    };
  }, [engineRef]);

  return { connected };
}
