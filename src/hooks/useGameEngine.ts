import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tile,
  GameStatus,
  GameMode,
  ScoreFloatingText,
  SaaSProductId,
} from '../types/game';
import { RegistrationDetails } from '../types/registration';
import {
  createInitialBoard,
  swapTilesOnBoard,
  findMatches,
  applyGravityAndRefill,
  hasValidMoves,
  shuffleBoard,
  calculateMatchScore,
  getMotivationalMessage,
  areAdjacent,
} from '../utils/gameLogic';
import { audioEngine } from '../utils/audio';
import { calculateRankTier } from '../components/GameOverModal';

const TIMER_INITIAL = 60;

export function useGameEngine() {
  const [status, setStatus] = useState<GameStatus>('landing');
  const [mode, setMode] = useState<GameMode>('timed');
  const [board, setBoard] = useState<Tile[][]>([]);
  const [selectedTile, setSelectedTile] = useState<{ row: number; col: number } | null>(null);
  const [matchedTileIds, setMatchedTileIds] = useState<Set<string>>(new Set());
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [totalMatches, setTotalMatches] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(TIMER_INITIAL);
  const [timePlayed, setTimePlayed] = useState<number>(0);
  const [floatingScores, setFloatingScores] = useState<ScoreFloatingText[]>([]);
  const [educationalProductId, setEducationalProductId] = useState<SaaSProductId | null>(null);
  const [motivationalMessage, setMotivationalMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const boardRef = useRef<Tile[][]>([]);
  const scoreRef = useRef<number>(0);
  const statusRef = useRef<GameStatus>('landing');
  const isBusyRef = useRef<boolean>(false);
  const sessionRef = useRef<number>(0);
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Load high score on mount
  useEffect(() => {
    let isMounted = true;

    fetch('/api/leaderboard')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => {
        const topScore = Number(payload.entries?.[0]?.score);
        if (isMounted && Number.isFinite(topScore)) {
          setHighScore(topScore);
        }
      })
      .catch(() => {
        // Keep the local session high score if the API is unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const setBusyState = useCallback((nextBusy: boolean) => {
    isBusyRef.current = nextBusy;
    setIsBusy(nextBusy);
  }, []);

  const clearPendingTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutIdsRef.current.clear();
  }, []);

  const beginFreshSession = useCallback(() => {
    sessionRef.current += 1;
    clearPendingTimeouts();
    setBusyState(false);
  }, [clearPendingTimeouts, setBusyState]);

  const isSessionActive = useCallback((sessionId: number) => {
    return sessionRef.current === sessionId;
  }, []);

  const scheduleSessionTimeout = useCallback(
    (sessionId: number, fn: () => void, delay: number) => {
      const timeoutId = setTimeout(() => {
        timeoutIdsRef.current.delete(timeoutId);
        if (!isSessionActive(sessionId)) return;
        fn();
      }, delay);

      timeoutIdsRef.current.add(timeoutId);
      return timeoutId;
    },
    [isSessionActive]
  );

  const endGame = useCallback(() => {
    beginFreshSession();
    setSelectedTile(null);
    setMatchedTileIds(new Set());
    setMotivationalMessage(null);
    setEducationalProductId(null);
    setStatus('gameover');
    audioEngine.stopBGM();
    audioEngine.playGameOver();

    setHighScore((prev) => Math.max(prev, scoreRef.current));
  }, [beginFreshSession]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      clearPendingTimeouts();
    };
  }, [clearPendingTimeouts]);

  // Timer Tick
  useEffect(() => {
    if (status !== 'playing' || mode === 'zen') return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endGame();
          return 0;
        }
        if (prev <= 10) {
          audioEngine.playTick();
        }
        return prev - 1;
      });

      setTimePlayed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status, mode, endGame]);

  const startGame = (chosenMode: GameMode = 'timed') => {
    beginFreshSession();
    setMode(chosenMode);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTotalMatches(0);
    setTimeRemaining(TIMER_INITIAL);
    setTimePlayed(0);
    setSelectedTile(null);
    setMatchedTileIds(new Set());
    setFloatingScores([]);
    setEducationalProductId(null);
    setMotivationalMessage(null);

    const initialBoard = createInitialBoard();
    boardRef.current = initialBoard;
    setBoard(initialBoard);
    setStatus('playing');

    audioEngine.startBGM();
  };

  const togglePause = () => {
    if (status === 'playing') {
      setStatus('paused');
      audioEngine.stopBGM();
    } else if (status === 'paused') {
      setStatus('playing');
      audioEngine.startBGM();
    }
  };

  const toggleMute = () => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  };

  // Process recursive cascades
  const resolveCascades = useCallback(
    async (currentBoard: Tile[][], currentCombo: number, sessionId = sessionRef.current) => {
      if (!isSessionActive(sessionId)) return;
      const matchResult = findMatches(currentBoard);

      if (matchResult.matchedTileIds.size === 0) {
        // No more matches in cascade
        setCombo(0);
        setMatchedTileIds(new Set());

        // Check for valid moves
        if (!hasValidMoves(currentBoard)) {
          setMotivationalMessage('SHUFFLING BOARD!');
          scheduleSessionTimeout(sessionId, () => {
            const shuffled = shuffleBoard(currentBoard);
            setBoard(shuffled);
            setMotivationalMessage(null);
            setBusyState(false);
          }, 600);
        } else {
          setBusyState(false);
        }
        return;
      }

      // We have matches!
      const nextCombo = currentCombo + 1;
      setCombo(nextCombo);
      setMaxCombo((prev) => Math.max(prev, nextCombo));
      setTotalMatches((prev) => prev + 1);

      // Play match sound
      audioEngine.playMatch(nextCombo);

      // Highlight matched tile IDs
      setMatchedTileIds(matchResult.matchedTileIds);

      // Pick first matched product for educational popup
      const matchedProductsArr = Array.from(matchResult.matchedProducts.keys());
      if (matchedProductsArr.length > 0) {
        setEducationalProductId(matchedProductsArr[0]);
      }

      // Calculate Points
      const { points, label } = calculateMatchScore(
        matchResult.matchedTileIds.size,
        nextCombo
      );
      setScore((prev) => {
        const updated = prev + points;
        scoreRef.current = updated;
        setHighScore((h) => Math.max(h, updated));
        return updated;
      });

      // Check motivational message
      const msg = getMotivationalMessage(nextCombo, scoreRef.current + points);
      if (msg) {
        setMotivationalMessage(msg);
        scheduleSessionTimeout(sessionId, () => setMotivationalMessage(null), 2500);
      }

      // Spawn floating score text
      const firstMatchedId = Array.from(matchResult.matchedTileIds)[0];
      let matchRow = 4, matchCol = 4;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (currentBoard[r][c].id === firstMatchedId) {
            matchRow = r;
            matchCol = c;
          }
        }
      }

      const scoreId = `score-${Date.now()}`;
      setFloatingScores((prev) => [
        ...prev,
        {
          id: scoreId,
          score: points,
          row: matchRow,
          col: matchCol,
          combo: nextCombo,
          label,
        },
      ]);

      scheduleSessionTimeout(sessionId, () => {
        setFloatingScores((prev) => prev.filter((s) => s.id !== scoreId));
      }, 1200);

      // Keep cascades quick so mobile play feels responsive.
      await new Promise((res) => setTimeout(res, 150));
      if (!isSessionActive(sessionId)) return;

      // Apply Gravity and Refill
      const { newBoard } = applyGravityAndRefill(
        currentBoard,
        matchResult.matchedTileIds
      );
      boardRef.current = newBoard;
      setBoard(newBoard);
      setMatchedTileIds(new Set());

      await new Promise((res) => setTimeout(res, 120));
      if (!isSessionActive(sessionId)) return;

      // Continue cascade
      resolveCascades(newBoard, nextCombo, sessionId);
    },
    [isSessionActive, scheduleSessionTimeout, setBusyState]
  );

  const handleSwap = useCallback(
    async (r1: number, c1: number, r2: number, c2: number) => {
      if (isBusyRef.current || statusRef.current !== 'playing') return;
      if (!areAdjacent(r1, c1, r2, c2)) return;
      if (r1 === r2 && c1 === c2) return;

      setBusyState(true);
      setSelectedTile(null);

      audioEngine.playSwap();

      // Perform swap
      const sessionId = sessionRef.current;
      const originalBoard = boardRef.current;
      const swappedBoard = swapTilesOnBoard(originalBoard, r1, c1, r2, c2);
      boardRef.current = swappedBoard;
      setBoard(swappedBoard);

      // Check if valid match
      const initialMatches = findMatches(swappedBoard);

      if (initialMatches.matchedTileIds.size === 0) {
        // Invalid swap - bounce back after delay
        audioEngine.playInvalid();
        await new Promise((res) => setTimeout(res, 120));
        if (!isSessionActive(sessionId)) return;
        boardRef.current = originalBoard;
        setBoard(originalBoard); // Revert
        setBusyState(false);
      } else {
        // Valid swap! Start cascade loop
        resolveCascades(swappedBoard, 0, sessionId);
      }
    },
    [resolveCascades, isSessionActive, setBusyState]
  );

  const saveScoreToLeaderboard = async (
    playerName: string,
    registration?: RegistrationDetails | null
  ) => {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName,
        fullName: registration?.fullName || playerName,
        businessName: registration?.businessName,
        industry: registration?.industry,
        hasGst: registration?.hasGst,
        whatsappNumber: registration?.whatsappNumber,
        score,
        maxCombo,
        totalMatches,
        rank: calculateRankTier(score),
        date: new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date()),
        mode,
      }),
    });

    if (!response.ok) {
      throw new Error('Could not save score.');
    }
  };

  return {
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
  };
}
