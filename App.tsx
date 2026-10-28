/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from "./GameEngine";
import { LEVELS, getUnlockedLevel } from "./missions";
import { TitleScreen } from "./TitleScreen";
import { HUD } from "./HUD";
import { PerkModal } from "./PerkModal";
import { HUD } from './components/HUD';
import { PerkModal } from './components/PerkModal';
import { GameOverModal } from './components/GameOverModal';
import { PauseModal } from './components/PauseModal';
import { ShopModal } from './components/ShopModal';
import { Minimap } from './components/Minimap';
import { TouchControls } from './components/TouchControls';
import { RotatePrompt } from './components/RotatePrompt';
import { ControllerHelp } from './components/ControllerHelp';
import { useGamepad } from './useGamepad';
import { MissionSelect } from './components/MissionSelect';
import { LevelCompleteModal } from './components/LevelCompleteModal';
import { FloatingTextOverlay } from './components/FloatingTextOverlay';

// Phones / tablets: the main pointer is a finger
const IS_TOUCH = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // High score and portable score history (kept locally in this browser).
  const [highscore, setHighscore] = useState<number>(() => {
    return parseInt(localStorage.getItem('outpost_zero_highscore') || '0', 10);
  });

  const exportScores = useCallback(() => {
    const payload = {
      format: 'zombie-apocalypse-scores',
      version: 1,
      exportedAt: new Date().toISOString(),
      highscore: Number(localStorage.getItem('outpost_zero_highscore') || highscore || 0),
      history: JSON.parse(localStorage.getItem('outpost_zero_score_history') || '[]'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zombie-apocalypse-scores.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [highscore]);

  const importScores = useCallback(async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.format !== 'zombie-apocalypse-scores' || !Array.isArray(data.history) || !Number.isFinite(Number(data.highscore))) {
        throw new Error('That file is not a valid Zombie Apocalypse score backup.');
      }
      const oldHistory = JSON.parse(localStorage.getItem('outpost_zero_score_history') || '[]');
      const combined = [...data.history, ...oldHistory].filter((entry: any) =>
        entry && Number.isFinite(Number(entry.score)) && Number.isFinite(Number(entry.wave))
      );
      const unique = Array.from(new Map(combined.map((entry: any) => [
        `${entry.date || ''}-${entry.score}-${entry.wave}-${entry.kills}`, entry
      ])).values()).slice(0, 500);
      const best = Math.max(Number(data.highscore) || 0, ...unique.map((entry: any) => Number(entry.score) || 0), Number(localStorage.getItem('outpost_zero_highscore') || 0));
      localStorage.setItem('outpost_zero_score_history', JSON.stringify(unique));
      localStorage.setItem('outpost_zero_highscore', String(best));
      setHighscore(best);
      window.alert(`Score backup imported! High score: ${best.toLocaleString()}\nSaved runs: ${unique.length}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not read that score backup.');
    }
  }, []);

  // Game UI States
  const [gameState, setGameState] = useState<GameState>('title');
  const [wave, setWave] = useState<number>(1);
  const [remainingZombies, setRemainingZombies] = useState<number>(0);
  const [totalWaveZombies, setTotalWaveZombies] = useState<number>(0);
  const [bossInfo, setBossInfo] = useState<BossInfo | null>(null);

  const [playerStats, setPlayerStats] = useState<PlayerStats>({
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
  });

  const [activeWeapon, setActiveWeapon] = useState<WeaponStats>({
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
    description: 'High rate-of-fire urban assault rifle.',
  });

  const [availablePerks, setAvailablePerks] = useState<Perk[]>([]);
  const [gameOverStats, setGameOverStats] = useState<{
    wave: number;
    kills: number;
    score: number;
    highscore: number;
  }>({ wave: 1, kills: 0, score: 0, highscore: 0 });

  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [cameraMode, setCameraMode] = useState<CameraMode>('third');

  // Missions: maps, levels, difficulty
  const [showSelect, setShowSelect] = useState(false);
  const [missionInfo, setMissionInfo] = useState<MissionInfo | null>(null);
  const [lastDifficulty, setLastDifficulty] = useState<DifficultyId>('normal');
  const [levelComplete, setLevelComplete] = useState<{
    levelId: number;
    levelName: string;
    kills: number;
    score: number;
    bonus: number;
    hasNext: boolean;
  } | null>(null);

  // Initialize GameEngine
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const engine = new GameEngine(containerRef.current, canvasRef.current, {
      onStateChange: (state) => {
        setGameState(state);
      },
      onPlayerUpdate: (stats, weapon) => {
        setPlayerStats({ ...stats });
        setActiveWeapon({ ...weapon });
      },
      onWaveUpdate: (w, rem, total, boss) => {
        setWave(w);
        setRemainingZombies(rem);
        setTotalWaveZombies(total);
        setBossInfo(boss);
      },
      onFloatingTextAdd: (text) => {
        setFloatingTexts((prev) => [...prev.slice(-3), text]);
      },
      onPerkSelectionRequired: (perks) => {
        setAvailablePerks(perks);
      },
      onCameraModeChange: (mode) => {
        setCameraMode(mode);
      },
      onMissionChange: (info) => {
        setMissionInfo(info);
      },
      onLevelComplete: (info) => {
        setLevelComplete(info);
      },
      onGameOver: (stats) => {
        setGameOverStats(stats);
        setHighscore(stats.highscore);
        const history = JSON.parse(localStorage.getItem('outpost_zero_score_history') || '[]');
        history.unshift({ ...stats, date: new Date().toISOString() });
        localStorage.setItem('outpost_zero_score_history', JSON.stringify(history.slice(0, 500)));
      },
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Age floating texts
  useEffect(() => {
    if (floatingTexts.length === 0) return;
    const interval = setInterval(() => {
      setFloatingTexts((prev) =>
        prev
          .map((t) => ({ ...t, age: t.age + 0.1 }))
          .filter((t) => t.age < t.life)
      );
    }, 100);
    return () => clearInterval(interval);
  }, [floatingTexts.length]);

  // Actions
  const handleOpenSelect = useCallback(() => {
    setShowSelect(true);
  }, []);

  const handleDeploy = useCallback((config: MissionConfig) => {
    setLastDifficulty(config.difficulty);
    setShowSelect(false);
    if (IS_TOUCH) {
      // Go fullscreen + landscape where the browser allows it (Android Chrome; iPhone Safari ignores this)
      try {
        const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
        if (!document.fullscreenElement) {
          const req = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
          Promise.resolve(req)
            .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
            .catch(() => {});
        }
      } catch {
        // not supported
      }
    }
    engineRef.current?.startMission(config);
  }, []);

  const handleNextLevel = useCallback(() => {
    if (!levelComplete) return;
    const next = LEVELS.find((l) => l.id === levelComplete.levelId + 1);
    if (!next) return;
    setLevelComplete(null);
    engineRef.current?.startMission({ levelId: next.id, map: next.map, difficulty: lastDifficulty });
  }, [levelComplete, lastDifficulty]);

  const handleReplayLevel = useCallback(() => {
    setLevelComplete(null);
    engineRef.current?.restartGame();
  }, []);

  const handleLevelMenu = useCallback(() => {
    setLevelComplete(null);
    engineRef.current?.setGameState('title');
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => engineRef.current?.setTouchMove(x, y), []);
  const handleTouchLook = useCallback((dx: number, dy: number) => engineRef.current?.touchLook(dx, dy), []);
  const handleTouchAim = useCallback(
    (x: number, y: number, shooting: boolean) => engineRef.current?.setTouchAim(x, y, shooting),
    []
  );
  const handleTouchFire = useCallback((active: boolean) => engineRef.current?.setTouchFire(active), []);
  const handleNextWeapon = useCallback(() => engineRef.current?.nextWeapon(), []);

  // No long-press context menu on phones
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', block);
    return () => window.removeEventListener('contextmenu', block);
  }, []);

  const { connected: padConnected } = useGamepad({ gameState, cameraMode, engineRef });

  const getMinimapData = useCallback(() => engineRef.current?.getMinimapData() ?? null, []);

  const handleRestart = useCallback(() => {
    engineRef.current?.restartGame();
  }, []);

  const handleReturnToTitle = useCallback(() => {
    engineRef.current?.setGameState('title');
  }, []);

  const handleSwitchWeapon = useCallback((id: WeaponId) => {
    engineRef.current?.switchWeapon(id);
  }, []);

  const handleReload = useCallback(() => {
    engineRef.current?.reloadCurrentWeapon();
  }, []);

  const handleCycleCamera = useCallback(() => {
    engineRef.current?.cycleCamera();
  }, []);

  const handleDash = useCallback(() => {
    engineRef.current?.performDash();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.setGameState('paused');
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setGameState('playing');
  }, []);

  const handleSelectPerk = useCallback((perkId: string) => {
    engineRef.current?.applyPerk(perkId);
  }, []);

  const handleBuyWeapon = useCallback((id: WeaponId) => {
    engineRef.current?.buyWeapon(id);
  }, []);

  const handleBuyAmmo = useCallback((id: WeaponId) => {
    engineRef.current?.buyAmmo(id);
  }, []);

  const handleBuyMedkit = useCallback(() => {
    engineRef.current?.buyMedkit();
  }, []);

  const handleLeaveShop = useCallback(() => {
    engineRef.current?.leaveShop();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none"
    >
      {/* 3D WebGL Canvas Viewport */}
      <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full block ${cameraMode === 'topdown' ? 'cursor-crosshair' : 'cursor-none'}`} />

      {/* Floating Announcements */}
      <FloatingTextOverlay texts={floatingTexts} />

      {/* Screen Modals & Overlays */}
      {gameState === 'title' && !showSelect && (
        <TitleScreen onStart={handleOpenSelect} highscore={highscore} onExportScores={exportScores} onImportScores={importScores} />
      )}

      {gameState === 'title' && showSelect && (
        <MissionSelect
          unlockedLevel={getUnlockedLevel()}
          initialDifficulty={lastDifficulty}
          onStart={handleDeploy}
          onBack={() => setShowSelect(false)}
        />
      )}

      {gameState === 'playing' && (
        <HUD
          playerStats={playerStats}
          activeWeapon={activeWeapon}
          wave={wave}
          remainingZombies={remainingZombies}
          totalWaveZombies={totalWaveZombies}
          bossInfo={bossInfo}
          onSwitchWeapon={handleSwitchWeapon}
          onReload={handleReload}
          onPause={handlePause}
          onDash={handleDash}
          onCycleCamera={handleCycleCamera}
          cameraMode={cameraMode}
          missionName={missionInfo ? `${missionInfo.levelId ? `LEVEL ${missionInfo.levelId} · ` : ''}${missionInfo.name} · ${missionInfo.difficultyName}` : undefined}
          waveGoal={missionInfo?.waveGoal ?? null}
          touchMode={IS_TOUCH}
        />
      )}

      {gameState === 'playing' && (
        <div
          className={`absolute z-10 pointer-events-none flex flex-col items-center gap-1 ${
            IS_TOUCH ? 'left-2 top-[116px]' : 'left-3 bottom-3 hidden sm:flex'
          }`}
        >
          <Minimap getData={getMinimapData} size={IS_TOUCH ? 92 : 150} />
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            {missionInfo?.mapName}
          </span>
        </div>
      )}

      {IS_TOUCH && gameState === 'playing' && (
        <TouchControls
          cameraMode={cameraMode}
          activeWeapon={activeWeapon}
          onMove={handleTouchMove}
          onLook={handleTouchLook}
          onAim={handleTouchAim}
          onFire={handleTouchFire}
          onDash={handleDash}
          onReload={handleReload}
          onNextWeapon={handleNextWeapon}
        />
      )}

      {IS_TOUCH && <RotatePrompt />}

      {padConnected && ((gameState === 'title' && !showSelect) || gameState === 'paused') && <ControllerHelp />}

      {gameState === 'level_complete' && levelComplete && (
        <LevelCompleteModal
          info={levelComplete}
          onNext={handleNextLevel}
          onReplay={handleReplayLevel}
          onMenu={handleLevelMenu}
        />
      )}

      {gameState === 'playing' && cameraMode !== 'topdown' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="relative w-6 h-6">
            <div className="absolute left-1/2 top-0 w-0.5 h-2 -translate-x-1/2 bg-white/90" />
            <div className="absolute left-1/2 bottom-0 w-0.5 h-2 -translate-x-1/2 bg-white/90" />
            <div className="absolute top-1/2 left-0 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
            <div className="absolute top-1/2 right-0 h-0.5 w-2 -translate-y-1/2 bg-white/90" />
            <div className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
          </div>
        </div>
      )}

      {gameState === 'perk_select' && (
        <PerkModal wave={wave} perks={availablePerks} onSelectPerk={handleSelectPerk} />
      )}

      {gameState === 'shop' && (
        <ShopModal
          wave={wave}
          credits={playerStats.credits}
          hp={playerStats.hp}
          maxHp={playerStats.maxHp}
          weapons={engineRef.current?.getShopItems() ?? []}
          onBuyWeapon={handleBuyWeapon}
          onBuyAmmo={handleBuyAmmo}
          onBuyMedkit={handleBuyMedkit}
          onContinue={handleLeaveShop}
        />
      )}

      {gameState === 'paused' && (
        <PauseModal onResume={handleResume} onRestart={handleRestart} onReturnToTitle={handleReturnToTitle} />
      )}

      {gameState === 'game_over' && (
        <GameOverModal
          stats={gameOverStats}
          onRestart={handleRestart}
          onReturnToTitle={handleReturnToTitle}
        />
      )}
    </div>
  );
}
