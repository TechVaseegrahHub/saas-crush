import React, { useCallback, useEffect, useState } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { Navbar } from './components/Navbar';
import { LandingScreen } from './components/LandingScreen';
import { HUD } from './components/HUD';
import { GameBoard } from './components/GameBoard';
import { ProductPopup } from './components/ProductPopup';
import { ProductCodexModal } from './components/ProductCodex';
import { GameOverModal } from './components/GameOverModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { RegistrationDetails, RegistrationModal } from './components/RegistrationModal';
import { GameMode, SaaSProductId } from './types/game';
import { Play, RotateCcw, BookOpen } from 'lucide-react';

export default function App() {
  const {
    status,
    mode,
    board,
    selectedTile,
    setSelectedTile,
    matchedTileIds,
    score,
    highScore,
    combo,
    maxCombo,
    totalMatches,
    timeRemaining,
    timePlayed,
    floatingScores,
    educationalProductId,
    setEducationalProductId,
    motivationalMessage,
    isMuted,
    isBusy,
    startGame,
    togglePause,
    toggleMute,
    handleSwap,
    saveScoreToLeaderboard,
  } = useGameEngine();

  const [showCodex, setShowCodex] = useState<boolean>(false);
  const [codexInitialId, setCodexInitialId] = useState<SaaSProductId>(0);
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [showRegistration, setShowRegistration] = useState<boolean>(false);
  const [pendingGameMode, setPendingGameMode] = useState<GameMode>('timed');
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      const storedName = window.localStorage.getItem('tech-expo-player-name');
      return storedName === 'Guest Player' ? '' : storedName ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('tech-expo-player-name', playerName);
    } catch {
      // Keep the current name for this session when storage is unavailable.
    }
  }, [playerName]);

  const openCodexWithProduct = useCallback((id: SaaSProductId = 0) => {
    setCodexInitialId(id);
    setShowCodex(true);
  }, []);

  const closeEducationalProduct = useCallback(() => {
    setEducationalProductId(null);
  }, [setEducationalProductId]);

  const requestGameStart = useCallback((chosenMode: GameMode) => {
    setPendingGameMode(chosenMode);
    setShowRegistration(true);
  }, []);

  const handleRegistrationVerified = useCallback((details: RegistrationDetails) => {
    setPlayerName(details.fullName);
    setShowRegistration(false);
    startGame(pendingGameMode);
  }, [pendingGameMode, startGame]);

  const handleProductPreviewClick = useCallback((id: SaaSProductId) => {
    if (id === 2) {
      requestGameStart('timed');
      return;
    }

    openCodexWithProduct(id);
  }, [openCodexWithProduct, requestGameStart]);

  const isGameActive = status === 'playing' || status === 'paused';

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[#f5fff8] font-sans text-black selection:bg-[#1b9e4b] selection:text-black">
      {/* Background Ambient Glow Spots */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[#f5fff8]">
        <div className="absolute inset-x-0 top-0 h-px bg-[#d9e8df]" />
      </div>

      {/* Top Header Navbar */}
      <Navbar
        status={status}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onOpenCodex={() => openCodexWithProduct(0)}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onHome={() => window.location.reload()}
      />

      {/* Main Content View Switcher */}
      <main className={`relative flex min-h-0 w-full flex-1 flex-col items-center justify-start ${isGameActive ? 'overflow-x-hidden overflow-y-auto px-4 pb-6 pt-0 sm:p-4' : 'overflow-y-auto p-2 sm:p-4'}`}>
        {status === 'landing' && (
          <LandingScreen
            highScore={highScore}
            onStartGame={requestGameStart}
            onProductPreviewClick={handleProductPreviewClick}
            onOpenCodex={() => openCodexWithProduct(0)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
          />
        )}

        {(status === 'playing' || status === 'paused') && (
          <div className="relative mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col items-center justify-start gap-2 py-1 sm:justify-center sm:gap-3 sm:py-2">
            {/* Top HUD */}
            <HUD
              playerName={playerName}
              score={score}
              highScore={highScore}
              timeRemaining={timeRemaining}
              combo={combo}
              maxCombo={maxCombo}
              isPaused={status === 'paused'}
              isMuted={isMuted}
              onTogglePause={togglePause}
              onToggleMute={toggleMute}
              onOpenCodex={() => openCodexWithProduct(0)}
              onOpenLeaderboard={() => setShowLeaderboard(true)}
              isZenMode={mode === 'zen'}
            />

            {/* Central 8x8 Game Board */}
            <GameBoard
              board={board}
              selectedTile={selectedTile}
              onSelectTile={(r, c) => setSelectedTile(r < 0 ? null : { row: r, col: c })}
              onSwap={(r1, c1, r2, c2) => handleSwap(r1, c1, r2, c2)}
              matchedTileIds={matchedTileIds}
              floatingScores={floatingScores}
              motivationalMessage={motivationalMessage}
              isBusy={isBusy}
            />

            {/* Non-intrusive Educational Live Match Banner */}
            <ProductPopup
              productId={educationalProductId}
              onClose={closeEducationalProduct}
              onOpenFullCodex={(id) => openCodexWithProduct(id)}
              mode="banner"
            />
          </div>
        )}

        {/* Pause Modal Overlay */}
        {status === 'paused' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#f5fff8]/90 p-3 backdrop-blur-md sm:p-4">
            <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-sm space-y-4 overflow-y-auto rounded-3xl border border-[#d9e8df] bg-[#f5fff8] p-5 text-center shadow-2xl backdrop-blur-xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
              <h2 className="text-2xl font-bold uppercase tracking-tight text-black">Game Paused</h2>
              <p className="text-xs text-black/60">
                Take a breather! Explore our SaaS products or resume your streak.
              </p>

              <div className="space-y-2 pt-2">
                <button
                  onClick={togglePause}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1b9e4b] text-black font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-[#17903f] transition-colors shadow-lg"
                >
                  <Play className="w-4 h-4 fill-black" />
                  <span>Resume Game</span>
                </button>

                <button
                  onClick={() => openCodexWithProduct(0)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f5fff8] border border-[#d9e8df] text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-colors hover:bg-[#e6f8e6]"
                >
                  <BookOpen className="w-4 h-4 text-black" />
                  <span>Explore SaaS Codex</span>
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f5fff8] hover:bg-[#e6f8e6] text-black rounded-xl text-xs font-bold uppercase tracking-widest border border-[#d9e8df] transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Quit to Menu</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Over Modal */}
        {status === 'gameover' && (
          <GameOverModal
            score={score}
            totalMatches={totalMatches}
            maxCombo={maxCombo}
            timePlayed={timePlayed}
            mode={mode}
            onOpenCodex={() => openCodexWithProduct(0)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onSaveScore={saveScoreToLeaderboard}
            initialPlayerName={playerName}
          />
        )}

        {/* Full SaaS Product Gallery Modal */}
        {showCodex && (
          <ProductCodexModal
            initialProductId={codexInitialId}
            onClose={() => setShowCodex(false)}
          />
        )}

        {/* High Score Leaderboard Modal */}
        {showLeaderboard && (
          <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
        )}

        {showRegistration && (
          <RegistrationModal
            initialName={playerName}
            onClose={() => setShowRegistration(false)}
            onVerified={handleRegistrationVerified}
          />
        )}

      </main>


    </div>
  );
}
