'use client';

/**
 * =====================================================================
 * 刹那ノ見切 (Setsuna no Mikiri) - 燃えよ剣士 移植版
 * =====================================================================
 * テーマ: 熱血ダーク和風（漆黒 × 臙脂 × ゴールド）
 * 用途: 門下生（生徒）が遊べるボーナスXP獲得用ミニゲーム
 *
 * ★ lucide-react を使わず、アイコンを自前のインラインSVGで定義
 *
 * ステートマシン:
 *   waiting (READY/構え) → pre_okori (静寂・間合い)
 *   → okori (起こり) ★計測開始 → strike (打突) → result
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  fetchMinigameStatus,
  saveMinigameResult,
  type MinigameRank,
  type MinigameSaveResult,
  type MinigameStatus,
} from '@/lib/api';

// =====================================================================
// アイコン（lucide-react の代替・自前インラインSVG）
// =====================================================================
interface IconProps {
  size?:      number;
  className?: string;
}

function ArrowLeft({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function AlertTriangle({ size = 16, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function Loader2({ size = 20, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function Trophy({ size = 14, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function BookOpen({ size = 16, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function Swords({ size = 16, className = '' }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" y1="14" x2="9" y2="18" />
      <line x1="7" y1="17" x2="4" y2="20" />
      <line x1="3" y1="19" x2="5" y2="21" />
    </svg>
  );
}

// =====================================================================
// 型定義
// =====================================================================
type HitPart = 'men' | 'kote' | 'do';
type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

type ViewState = 'menu' | 'playing' | 'records';

/**
 * waiting:   構え（READY表示中）
 * pre_okori: 間合い（無の静寂）
 * okori:     起こり ★ここで計測スタート
 * strike:    打突
 */
type GamePhase =
  | 'loading'
  | 'idle'
  | 'waiting'
  | 'pre_okori'
  | 'okori'
  | 'strike'
  | 'result'
  | 'matchEnd'
  | 'submitting'
  | 'locked'
  | 'error';

interface Pattern {
  id:             PatternId;
  successName:    string;
  correctPart:    HitPart;
  strikeDuration: number;
  category:       'oji' | 'shikake';
  failLabel:      'HIT' | 'MISS' | 'EARLY';
  animClass:      string;
  glowPart:       HitPart;
}

type HitTiming = 'okori' | 'strike' | 'late' | 'wrongPart' | 'tooEarly' | 'timeout';

interface RoundResult {
  patternId:   PatternId;
  success:     boolean;
  reactionMs:  number | null;
  successName: string;
  failLabel:   string;
  timing:      HitTiming;
  cutinText:   string;
  rank:        'S' | 'A' | 'B' | 'C' | 'F';
}

// =====================================================================
// 8パターン定義
// =====================================================================
const PATTERNS: Pattern[] = [
  { id: 'A', successName: '出端小手',     correctPart: 'kote', glowPart: 'kote', strikeDuration: 800, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-A' },
  { id: 'B', successName: '面返し胴',     correctPart: 'do',   glowPart: 'do',   strikeDuration: 380, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-B' },
  { id: 'C', successName: '出端面',       correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-C' },
  { id: 'D', successName: '小手返し面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 400, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-D' },
  { id: 'E', successName: '小手抜き面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-E' },
  { id: 'F', successName: '合い小手面',   correctPart: 'kote', glowPart: 'kote', strikeDuration: 300, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-F' },
  { id: 'G', successName: '飛び込み面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 500, category: 'shikake', failLabel: 'MISS', animClass: 'anim-G' },
  { id: 'H', successName: '飛び込み小手', correctPart: 'kote', glowPart: 'kote', strikeDuration: 500, category: 'shikake', failLabel: 'MISS', animClass: 'anim-H' },
];

const ROUNDS_PER_MATCH = 3;
const MAX_MATCHES_PER_DAY = 3;

// =====================================================================
// カットイン用：タイミング別のテキストプール（熱血和風）
// =====================================================================
const CUTIN_S = [
  '一本!',
  '喪神無想',
  '心眼開眼!',
  '神速の見切り!',
  '会心の一撃!',
];
const CUTIN_A = [
  '見事!',
  '応じ技決まる!',
  '一本!',
  'そこだ!',
  'くらえ!',
  '冴え渡る太刀!',
];
const CUTIN_BC = [
  '辛うじて!',
  '危機一髪!',
  '間一髪の見切り...',
  '何とか凌いだ...',
  'ギリギリ...',
];
const CUTIN_FAIL = [
  '撃たれた...',
  '読み負け!',
  '無念...',
];
const CUTIN_TOO_EARLY = [
  'お手付き!',
  '気が早い!',
  '慌てるべからず!',
];

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// =====================================================================
// ユーティリティ
// =====================================================================
const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const pickRandomPattern = (): Pattern => PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

const formatTime = (ms: number | null): string => {
  if (ms === null || ms === undefined) return '---.---';
  return `${(ms / 1000).toFixed(3)}秒`;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

function calcOverallRank(roundResults: RoundResult[]): MinigameRank {
  if (roundResults.length === 0) return 'F';
  const successes = roundResults.filter(r => r.success);
  if (successes.length === 0) return 'F';
  const sCount = roundResults.filter(r => r.rank === 'S').length;
  if (sCount === ROUNDS_PER_MATCH) return 'S';
  if (successes.length === ROUNDS_PER_MATCH && sCount >= 1) return 'A';
  if (successes.length === ROUNDS_PER_MATCH) return 'B';
  return 'C';
}

// =====================================================================
// メインコンポーネント
// =====================================================================
export default function StudentMiniGamePage() {
  const [viewState, setViewState] = useState<ViewState>('menu');

  const [phase, setPhase]                   = useState<GamePhase>('loading');
  const [matchCount, setMatchCount]         = useState(0);
  const [roundIdx, setRoundIdx]             = useState(0);
  const [currentPattern, setCurrentPattern] = useState<Pattern | null>(null);
  const [results, setResults]               = useState<RoundResult[]>([]);
  const [lastResult, setLastResult]         = useState<RoundResult | null>(null);

  const [flashType, setFlashType]           = useState<'none' | 'success' | 'fail' | 'okori'>('none');
  const [cutinText, setCutinText]           = useState<string>('');
  const [shakeKey, setShakeKey]             = useState<number>(0);
  const [slashKey, setSlashKey]             = useState<number>(0);

  const [bestTimeMs, setBestTimeMs]         = useState<number | null>(null);
  const [statusInfo, setStatusInfo]         = useState<MinigameStatus | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<MinigameSaveResult | null>(null);
  const [errorMessage, setErrorMessage]     = useState<string>('');

  const okoriStartRef    = useRef<number | null>(null);
  const strikeStartRef   = useRef<number | null>(null);
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundIdxRef      = useRef(0);
  const matchCountRef    = useRef(0);
  const isInitializedRef = useRef(false);
  const isSubmittingRef  = useRef(false);

  useEffect(() => { roundIdxRef.current   = roundIdx;   }, [roundIdx]);
  useEffect(() => { matchCountRef.current = matchCount; }, [matchCount]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    (async () => {
      try {
        const status = await fetchMinigameStatus();
        setStatusInfo(status);
        setMatchCount(status.todayPlayed);
        matchCountRef.current = status.todayPlayed;
        setBestTimeMs(status.bestTimeMs);
        if (status.locked) setPhase('locked');
        else setPhase('idle');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setPhase('error');
      }
    })();
  }, []);

  const finishRound = useCallback((result: RoundResult) => {
    setLastResult(result);
    setResults(prev => [...prev, result]);
    setCutinText(result.cutinText);
    setShakeKey(k => k + 1);
    if (result.success) {
      setFlashType('success');
      setSlashKey(k => k + 1);
    } else {
      setFlashType('fail');
    }
    setPhase('result');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFlashType('none');
      setCutinText('');
      setCurrentPattern(null);

      const nextIdx = roundIdxRef.current + 1;
      if (nextIdx >= ROUNDS_PER_MATCH) {
        setPhase('matchEnd');
      } else {
        setRoundIdx(nextIdx);
        roundIdxRef.current = nextIdx;
        setPhase('waiting');
        scheduleNextRound();
      }
    }, 1700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeout = useCallback((pattern: Pattern) => {
    finishRound({
      patternId:   pattern.id,
      success:     false,
      reactionMs:  null,
      successName: pattern.successName,
      failLabel:   pattern.failLabel,
      timing:      'timeout',
      cutinText:   pickRandom(CUTIN_FAIL),
      rank:        'F',
    });
  }, [finishRound]);

  // ===================================================================
  // 4段階タイマー
  //   waiting (構え 1.0〜2.0s)
  //   → pre_okori (間合い 1.5〜3.0s)
  //   → okori (起こり 0.4〜1.0s) ★ここで計測スタート
  //   → strike (打突 pattern.strikeDuration)
  // ===================================================================
  const scheduleNextRound = useCallback(() => {
    const waitMs = randomBetween(1000, 2000);
    if (timerRef.current) clearTimeout(timerRef.current);

    // [1] waiting フェーズ（構え）
    timerRef.current = setTimeout(() => {
      setPhase('pre_okori');

      // [2] pre_okori フェーズ（間合い）
      const preOkoriMs = randomBetween(1500, 3000);
      timerRef.current = setTimeout(() => {
        const pattern = pickRandomPattern();
        setCurrentPattern(pattern);
        okoriStartRef.current = performance.now();
        setPhase('okori');
        setFlashType('okori');
        setTimeout(() => setFlashType('none'), 120);

        // [3] okori フェーズ
        const okoriMs = randomBetween(400, 1000);
        timerRef.current = setTimeout(() => {
          strikeStartRef.current = performance.now();
          setPhase('strike');

          // [4] strike フェーズ
          timerRef.current = setTimeout(() => {
            handleTimeout(pattern);
          }, pattern.strikeDuration);
        }, okoriMs);
      }, preOkoriMs);
    }, waitMs);
  }, [handleTimeout]);

  const startMatch = useCallback(() => {
    if (matchCountRef.current >= MAX_MATCHES_PER_DAY) {
      setPhase('locked');
      return;
    }
    setRoundIdx(0);
    roundIdxRef.current = 0;
    setResults([]);
    setLastResult(null);
    setLastSaveResult(null);
    setViewState('playing');
    setPhase('waiting');
    scheduleNextRound();
  }, [scheduleNextRound]);

  // ===================================================================
  // タップハンドラ
  // ===================================================================
  const handleTap = (part: HitPart) => {
    // waiting / pre_okori 中のタップ → お手付き
    if (phase === 'waiting' || phase === 'pre_okori') {
      if (timerRef.current) clearTimeout(timerRef.current);
      const dummyPattern = pickRandomPattern();
      finishRound({
        patternId:   dummyPattern.id,
        success:     false,
        reactionMs:  null,
        successName: dummyPattern.successName,
        failLabel:   'EARLY',
        timing:      'tooEarly',
        cutinText:   pickRandom(CUTIN_TOO_EARLY),
        rank:        'F',
      });
      return;
    }

    if (!currentPattern) return;
    if (phase !== 'okori' && phase !== 'strike') return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const isCorrectPart = part === currentPattern.correctPart;

    // 部位ミス
    if (!isCorrectPart) {
      finishRound({
        patternId:   currentPattern.id,
        success:     false,
        reactionMs:  null,
        successName: currentPattern.successName,
        failLabel:   'MISS',
        timing:      'wrongPart',
        cutinText:   pickRandom(CUTIN_FAIL),
        rank:        'F',
      });
      return;
    }

    // ── 正しい部位タップ ──
    const totalReactionMs = okoriStartRef.current
      ? performance.now() - okoriStartRef.current
      : 0;

    if (phase === 'okori') {
      // Sランク: 起こりを捉えた大成功
      finishRound({
        patternId:   currentPattern.id,
        success:     true,
        reactionMs:  Math.round(totalReactionMs),
        successName: currentPattern.successName,
        failLabel:   '',
        timing:      'okori',
        cutinText:   pickRandom(CUTIN_S),
        rank:        'S',
      });
      return;
    }

    // strike フェーズ
    const delayFromStrike = strikeStartRef.current
      ? performance.now() - strikeStartRef.current
      : 0;

    let rank: 'A' | 'B' | 'C';
    let cutinPool: string[];
    if (delayFromStrike < 200) {
      rank = 'A';
      cutinPool = CUTIN_A;
    } else if (delayFromStrike < 400) {
      rank = 'B';
      cutinPool = CUTIN_BC;
    } else {
      rank = 'C';
      cutinPool = CUTIN_BC;
    }

    finishRound({
      patternId:   currentPattern.id,
      success:     true,
      reactionMs:  Math.round(totalReactionMs),
      successName: currentPattern.successName,
      failLabel:   '',
      timing:      'strike',
      cutinText:   pickRandom(cutinPool),
      rank,
    });
  };

  const averageReaction = useMemo(() => {
    const successes = results.filter(r => r.success && r.reactionMs !== null);
    if (successes.length === 0) return null;
    const sum = successes.reduce((acc, r) => acc + (r.reactionMs ?? 0), 0);
    return sum / successes.length;
  }, [results]);

  const successCount = results.filter(r => r.success).length;
  const overallRank  = useMemo<MinigameRank>(() => calcOverallRank(results), [results]);

  useEffect(() => {
    if (phase !== 'matchEnd') return;
    if (results.length !== ROUNDS_PER_MATCH) return;
    if (lastSaveResult !== null) return;
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setPhase('submitting');

    (async () => {
      try {
        const avgMs = averageReaction !== null ? Math.round(averageReaction) : 0;
        const rank  = calcOverallRank(results);
        const res   = await saveMinigameResult({ averageTime: avgMs, rank });
        setLastSaveResult(res);
        setMatchCount(res.todayPlayed);
        matchCountRef.current = res.todayPlayed;
        if (avgMs > 0 && (bestTimeMs === null || avgMs < bestTimeMs)) {
          setBestTimeMs(avgMs);
        }
        setPhase('matchEnd');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setPhase('matchEnd');
      } finally {
        isSubmittingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleBackToMenu = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setViewState('menu');
    setPhase('idle');
    setResults([]);
    setLastResult(null);
    setLastSaveResult(null);
    setCurrentPattern(null);
    setRoundIdx(0);
    roundIdxRef.current = 0;
    setFlashType('none');
    setCutinText('');
  }, []);

  const glowState = useMemo<{ part: HitPart | null; intensity: 'okori' | 'strike' | null }>(() => {
    if (!currentPattern) return { part: null, intensity: null };
    if (phase === 'okori')  return { part: currentPattern.glowPart, intensity: 'okori' };
    if (phase === 'strike') return { part: currentPattern.glowPart, intensity: 'strike' };
    return { part: null, intensity: null };
  }, [phase, currentPattern]);

  const remainingQuota = Math.max(0, MAX_MATCHES_PER_DAY - matchCount);

  return (
    <div className="mikiri-root" key={shakeKey} data-shake={shakeKey > 0 ? 'on' : 'off'}>
      <div className="mikiri-bg" aria-hidden="true">
        <div className="mikiri-grid" />
        <div className="mikiri-scan" />
        <div className="mikiri-vignette" />
      </div>

      <header className="mikiri-header">
        {viewState === 'playing' || viewState === 'records' ? (
          <button onClick={handleBackToMenu} className="mikiri-back" aria-label="戻る" type="button">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link href="/student" className="mikiri-back" aria-label="戻る">
            <ArrowLeft size={20} />
          </Link>
        )}
        <h1 className="mikiri-title">
          <span className="mikiri-title-main">刹那ノ見切</span>
          <span className="mikiri-title-sub">― 心眼を以て起こりを断つ ―</span>
        </h1>
        <div className="mikiri-counter" aria-label="本日の対戦数">
          <span className="counter-num">{pad2(matchCount)}</span>
          <span className="counter-sep">/</span>
          <span className="counter-max">{pad2(MAX_MATCHES_PER_DAY)}</span>
        </div>
      </header>

      <main className="mikiri-stage">
        {flashType === 'success' && <div className="flash-success" aria-hidden="true" />}
        {flashType === 'fail'    && <div className="flash-fail"    aria-hidden="true" />}
        {flashType === 'okori'   && <div className="flash-okori"   aria-hidden="true" />}
        {slashKey > 0 && phase === 'result' && lastResult?.success && (
          <div className="slash-fx" key={`slash-${slashKey}`} aria-hidden="true" />
        )}

        {cutinText && phase === 'result' && (
          <div className={`cutin cutin-${lastResult?.rank ?? 'F'}`} key={`cut-${shakeKey}`}>
            <span className="cutin-text">{cutinText}</span>
          </div>
        )}

        {viewState === 'playing' && (
          <div
            className={[
              'kenshi-wrap',
              currentPattern && phase === 'strike' ? currentPattern.animClass : '',
              phase === 'okori'  ? 'anim-okori is-active' : '',
              phase === 'strike' ? 'is-active' : '',
            ].filter(Boolean).join(' ')}
          >
            <KenshiSVG
              glowPart={glowState.part}
              intensity={glowState.intensity}
              active={phase === 'okori' || phase === 'strike'}
              onTap={handleTap}
            />
          </div>
        )}

        {/* ============ loading / error ============ */}
        {phase === 'loading' && (
          <div className="overlay">
            <div className="console-box">
              <div className="console-prompt">
                <Swords size={14} />
                <span>精神統一</span>
              </div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">気を練っております<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">
                <AlertTriangle size={14} />
                <span>不覚</span>
              </div>
              <p className="console-msg">{errorMessage || '道場との縁が結べませんでした'}</p>
              <button className="cyber-btn cyber-btn--danger" onClick={() => window.location.reload()} type="button">
                <span className="cyber-btn-bracket">【</span>
                <span className="cyber-btn-label">再び挑む</span>
                <span className="cyber-btn-bracket">】</span>
              </button>
            </div>
          </div>
        )}

        {/* ============ メニュー画面 ============ */}
        {viewState === 'menu' && phase !== 'loading' && phase !== 'error' && (
          <div className="overlay">
            <div className="console-box console-box--menu">
              <div className="kanji-watermark" aria-hidden="true">見切</div>

              <div className="console-prompt">
                <Swords size={14} />
                <span>道場 ・ 修練の間</span>
                <span className="prompt-blink">_</span>
              </div>

              <div className="menu-header">
                <h2 className="menu-title-jp-main">刹那ノ見切</h2>
                <p className="menu-title-jp-sub">― 起こりを見切り、一本を取れ ―</p>
              </div>

              <div className="menu-sep" />

              {phase === 'locked' ? (
                <div className="menu-locked">
                  <AlertTriangle size={16} />
                  <span>本日の修練は終了 ・ 明日また参られよ</span>
                </div>
              ) : (
                <button
                  className="cyber-btn cyber-btn--primary"
                  onClick={startMatch}
                  type="button"
                  disabled={matchCount >= MAX_MATCHES_PER_DAY}
                >
                  <span className="cyber-btn-icon"><Swords size={16} /></span>
                  <span className="cyber-btn-bracket">【</span>
                  <span className="cyber-btn-label">立ち合い開始</span>
                  <span className="cyber-btn-bracket">】</span>
                </button>
              )}

              <button
                className="cyber-btn cyber-btn--secondary"
                onClick={() => setViewState('records')}
                type="button"
              >
                <span className="cyber-btn-icon"><BookOpen size={16} /></span>
                <span className="cyber-btn-bracket">【</span>
                <span className="cyber-btn-label">修練の記録</span>
                <span className="cyber-btn-bracket">】</span>
              </button>

              <div className="menu-stat-line">
                <span className="stat-key">残りの立ち合い</span>
                <span className="stat-sep">：</span>
                <span className="stat-val">{pad2(remainingQuota)} 本</span>
              </div>
            </div>
          </div>
        )}

        {/* ============ 記録画面 ============ */}
        {viewState === 'records' && (
          <div className="overlay">
            <div className="console-box console-box--records">
              <div className="kanji-watermark" aria-hidden="true">記録</div>

              <div className="console-prompt">
                <BookOpen size={14} />
                <span>修練の記録</span>
                <span className="prompt-blink">_</span>
              </div>

              <div className="menu-header menu-header--records">
                <h2 className="menu-title-jp-main">修練の記録</h2>
                <p className="menu-title-jp-sub">― これまでの歩み ―</p>
              </div>

              <div className="menu-sep" />

              <div className="data-row">
                <span className="data-key">{'》'} 最速の見切り</span>
                <span className="data-val">
                  <Trophy size={14} />
                  {bestTimeMs !== null ? formatTime(bestTimeMs) : '---.---'}
                </span>
              </div>

              <div className="data-row">
                <span className="data-key">{'》'} 本日の立ち合い</span>
                <span className="data-val">{pad2(matchCount)} / {pad2(MAX_MATCHES_PER_DAY)}</span>
              </div>

              <div className="data-row">
                <span className="data-key">{'》'} 残りの立ち合い</span>
                <span className="data-val">{pad2(remainingQuota)} 本</span>
              </div>

              {statusInfo?.locked && (
                <div className="locked-bar">
                  <AlertTriangle size={14} />
                  <span>本日の修練は終了 ・ 明日また参られよ</span>
                </div>
              )}

              <div className="menu-sep" />

              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                <span className="cyber-btn-icon"><ArrowLeft size={16} /></span>
                <span className="cyber-btn-bracket">【</span>
                <span className="cyber-btn-label">道場へ戻る</span>
                <span className="cyber-btn-bracket">】</span>
              </button>
            </div>
          </div>
        )}

        {/* ============ プレイ画面 ============ */}
        {viewState === 'playing' && phase === 'waiting' && (
          <div className="overlay overlay--passive">
            <p className="overlay-msg">― 構 え ―</p>
            <p className="overlay-round">第 {pad2(roundIdx + 1)} 本 / 全 {pad2(ROUNDS_PER_MATCH)} 本</p>
          </div>
        )}

        {/* pre_okori（間合い）は意図的に何も表示せず、剣士の佇まいで静寂を演出 */}

        {viewState === 'playing' && phase === 'okori' && (
          <div className="overlay overlay--passive overlay--okori">
            <p className="overlay-okori-msg">― 来 る ―</p>
          </div>
        )}

        {phase === 'submitting' && (
          <div className="overlay">
            <div className="console-box">
              <div className="console-prompt">
                <Swords size={14} />
                <span>奉納</span>
              </div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">戦果を記しております<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'matchEnd' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--result">
              <div className="kanji-watermark" aria-hidden="true">結果</div>

              <div className="console-prompt">
                <Swords size={14} />
                <span>立ち合いの結果</span>
              </div>

              <h2 className="result-title">― 勝 負 あ り ―</h2>

              <div className={`rank-display rank-${overallRank}`}>
                <span className="rank-label">技 の 位</span>
                <span className="rank-value">{overallRank}</span>
              </div>

              <div className="data-row">
                <span className="data-key">{'》'} 一本数</span>
                <span className="data-val">{successCount} / {ROUNDS_PER_MATCH}</span>
              </div>
              <div className="data-row">
                <span className="data-key">{'》'} 平均見切り</span>
                <span className="data-val">{formatTime(averageReaction)}</span>
              </div>

              {lastSaveResult && (
                <div className="data-row data-row--xp">
                  <span className="data-key">{'》'} 獲得XP</span>
                  <span className="data-val xp-val">+{lastSaveResult.earnedXp}</span>
                </div>
              )}
              {!lastSaveResult && errorMessage && (
                <p className="summary-error">※ 記録に失敗: {errorMessage}</p>
              )}

              <div className="summary-rounds">
                {results.map((r, i) => (
                  <div key={i} className={`summary-round ${r.success ? 'ok' : 'ng'}`}>
                    <span>第{i + 1}本</span>
                    <span className="round-name">{r.success ? r.cutinText.replace('!', '').replace('...', '') : r.failLabel}</span>
                    <span className={`summary-rank rank-${r.rank}-tag`}>{r.rank}</span>
                    <span>{formatTime(r.reactionMs)}</span>
                  </div>
                ))}
              </div>

              {matchCount < MAX_MATCHES_PER_DAY ? (
                <>
                  <button className="cyber-btn cyber-btn--primary" onClick={startMatch} type="button">
                    <span className="cyber-btn-icon"><Swords size={16} /></span>
                    <span className="cyber-btn-bracket">【</span>
                    <span className="cyber-btn-label">次の立ち合い（{pad2(matchCount)}/{pad2(MAX_MATCHES_PER_DAY)}）</span>
                    <span className="cyber-btn-bracket">】</span>
                  </button>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    <span className="cyber-btn-bracket">【</span>
                    <span className="cyber-btn-label">道場へ戻る</span>
                    <span className="cyber-btn-bracket">】</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="locked-bar">
                    <AlertTriangle size={14} />
                    <span>本日の修練は終了</span>
                  </div>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    <span className="cyber-btn-bracket">【</span>
                    <span className="cyber-btn-label">道場へ戻る</span>
                    <span className="cyber-btn-bracket">】</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'locked' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">
                <AlertTriangle size={14} />
                <span>修練終了</span>
              </div>
              <h2 className="result-title">― 本日 ・ 打ち止め ―</h2>
              <p className="console-msg">一日 三本 までと定めあり ・ 明日また参られよ</p>
              {bestTimeMs !== null && (
                <div className="data-row" style={{ marginTop: 12 }}>
                  <span className="data-key">{'》'} 最速の見切り</span>
                  <span className="data-val"><Trophy size={14} /> {formatTime(bestTimeMs)}</span>
                </div>
              )}
              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 14 }}>
                <span className="cyber-btn-bracket">【</span>
                <span className="cyber-btn-label">道場へ戻る</span>
                <span className="cyber-btn-bracket">】</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================
          styled-jsx: 熱血ダーク和風（漆黒 × 臙脂 × ゴールド）
          基調色:
            #000000 / #1a1a1a (漆黒・墨)
            #2a1a1a (赤みを帯びた黒)
            #8B0000 (暗い臙脂)
            #B22222 (臙脂・ファイアブリック)
            #FFD700 (黄金)
            #fbbf24 (明るい金・ハイライト)
            #f5e6c8 (生成り・テキスト)
            #c9a96a (古びた金・サブテキスト)
      =================================================================== */}
      <style jsx>{`
        .mikiri-root {
          position: fixed; inset: 0;
          background: #0a0606;
          color: #f5e6c8;
          overflow: hidden;
          font-family: 'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif;
          display: flex; flex-direction: column;
        }
        .mikiri-root[data-shake='on'] {
          animation: rootShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        @keyframes rootShake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 2px); }
          20% { transform: translate(4px, -3px); }
          30% { transform: translate(-3px, 3px); }
          40% { transform: translate(3px, -2px); }
          50% { transform: translate(-2px, 2px); }
          60% { transform: translate(2px, -1px); }
          70% { transform: translate(-1px, 1px); }
          80% { transform: translate(1px, 0); }
          90% { transform: translate(-1px, 0); }
        }

        /* ★ Loader2 の回転（Tailwind 非依存） */
        :global(.animate-spin) {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .mikiri-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
        .mikiri-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(178, 34, 34, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(178, 34, 34, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at center, black 35%, transparent 78%);
        }
        .mikiri-scan {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 0%, rgba(178, 34, 34, 0.04) 50%, transparent 100%);
          background-size: 100% 10px;
          animation: scanMove 7s linear infinite;
          opacity: 0.55;
        }
        @keyframes scanMove {
          from { background-position: 0 0; }
          to   { background-position: 0 100%; }
        }
        .mikiri-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7) 100%);
        }

        /* ===== ヘッダー ===== */
        .mikiri-header {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px 10px;
          border-bottom: 1px solid rgba(178, 34, 34, 0.35);
          backdrop-filter: blur(6px);
          background: linear-gradient(180deg, rgba(26, 10, 10, 0.7), rgba(10, 6, 6, 0.5));
        }
        .mikiri-back {
          color: #FFD700; padding: 6px;
          background: transparent; border: 1px solid rgba(255, 215, 0, 0.3);
          cursor: pointer; transition: all 0.2s;
          display: inline-flex; align-items: center;
          border-radius: 0;
        }
        .mikiri-back:hover {
          background: rgba(178, 34, 34, 0.18);
          border-color: #FFD700;
          box-shadow: 0 0 12px rgba(255, 215, 0, 0.4);
        }
        .mikiri-title { text-align: center; line-height: 1; margin: 0; }
        .mikiri-title-main {
          display: block;
          font-size: 17px; font-weight: 700;
          letter-spacing: 0.28em;
          color: #f5e6c8;
          text-shadow: 0 0 14px rgba(255, 215, 0, 0.5), 0 1px 2px #000;
        }
        .mikiri-title-sub {
          display: block; font-size: 9px;
          letter-spacing: 0.22em;
          color: #c9a96a; margin-top: 6px;
          opacity: 0.85;
        }
        .mikiri-counter {
          font-family: 'Noto Serif JP', monospace;
          font-size: 15px;
          color: #FFD700;
          background: rgba(178, 34, 34, 0.12);
          border: 1px solid rgba(255, 215, 0, 0.35);
          border-radius: 0;
          padding: 4px 12px;
          letter-spacing: 0.1em;
        }
        .counter-num { color: #fbbf24; font-weight: 700; }
        .counter-sep { color: #8B0000; margin: 0 3px; }
        .counter-max { color: #c9a96a; }

        .mikiri-stage {
          position: relative; z-index: 1; flex: 1;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .kenshi-wrap {
          position: relative;
          width: min(80vw, 360px);
          aspect-ratio: 3 / 5;
          transform-origin: center center;
          filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.35));
        }

        /* =====================================================================
           okori 予備動作アニメ
        ===================================================================== */
        :global(.kenshi-wrap.anim-okori) {
          animation: kenshiOkori 0.7s cubic-bezier(0.55, 0, 0.6, 0.7) forwards;
        }
        @keyframes kenshiOkori {
          0% {
            transform: translateY(0) scale(1);
            filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.35));
          }
          40% {
            transform: translateY(1.5px) scale(1.005);
            filter: drop-shadow(0 0 16px rgba(178, 34, 34, 0.5));
          }
          100% {
            transform: translateY(3px) scale(1.015);
            filter: drop-shadow(0 0 22px rgba(220, 40, 40, 0.65));
          }
        }
        :global(.kenshi-wrap.anim-okori .sword) {
          animation: swordOkori 0.7s cubic-bezier(0.55, 0, 0.6, 0.7) forwards;
        }
        @keyframes swordOkori {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(-2px) scale(1.02); }
        }

        /* ===== 8パターンアニメ（strike時のみ発火） ===== */
        :global(.anim-A .sword) { transform-origin: 50% 100%; animation: swordMenSlow 0.8s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        :global(.anim-A) { animation: bodyMenAdvanceSlow 0.8s cubic-bezier(0.6, 0, 1, 0.5) forwards; }
        @keyframes swordMenSlow { 0% { transform: translateY(0) scale(1); } 50% { transform: translateY(-22px) scale(1.05); } 100% { transform: translateY(18px) scale(1.35); } }
        @keyframes bodyMenAdvanceSlow { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1.10); } }

        :global(.anim-B .sword) { transform-origin: 50% 100%; animation: swordMenFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        :global(.anim-B) { animation: bodyMenAdvanceFast 0.38s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        @keyframes swordMenFast { 0% { transform: translateY(0) scale(1); } 45% { transform: translateY(-30px) scale(1.10); } 100% { transform: translateY(28px) scale(1.50); } }
        @keyframes bodyMenAdvanceFast { 0% { transform: scale(1); } 45% { transform: scale(1.04); } 100% { transform: scale(1.18); } }

        :global(.anim-C) { animation: zoomIn 0.5s cubic-bezier(0.55, 0, 1, 0.45) forwards; }
        @keyframes zoomIn { 0% { transform: scale(1); } 100% { transform: scale(1.18); } }

        :global(.anim-D .sword) { transform-origin: 50% 100%; animation: swordKoteD 0.4s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        @keyframes swordKoteD { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 100% { transform: translate(38px, 22px) rotate(18deg) scale(0.95); } }

        :global(.anim-E) { animation: sinkZoom 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        :global(.anim-E .sword) { transform-origin: 50% 100%; animation: swordKoteE 0.5s cubic-bezier(0.6, 0, 1, 0.45) forwards; }
        @keyframes sinkZoom { 0% { transform: scale(1) translateY(0); } 100% { transform: scale(1.12) translateY(8px); } }
        @keyframes swordKoteE { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 100% { transform: translate(28px, 18px) rotate(14deg) scale(0.96); } }

        :global(.anim-F .sword) { transform-origin: 50% 100%; animation: swordKoteF 0.3s cubic-bezier(0.7, 0, 1, 0.4) forwards; }
        @keyframes swordKoteF { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 45% { transform: translate(8px, -6px) rotate(-4deg) scale(1.02); } 100% { transform: translate(32px, 20px) rotate(20deg) scale(0.94); } }

        :global(.anim-G) { animation: shrinkFreeze 0.5s cubic-bezier(0.6, 0, 1, 0.5) forwards; }
        @keyframes shrinkFreeze { 0% { transform: scale(1); } 50% { transform: scale(0.95) translateY(4px); } 100% { transform: scale(0.95) translateY(4px); } }

        :global(.anim-H .sword) { transform-origin: 50% 100%; animation: swordHandsUp 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards; }
        :global(.anim-H) { animation: bodyLeanBack 0.5s cubic-bezier(0.55, 0, 1, 0.5) forwards; }
        @keyframes swordHandsUp { 0% { transform: translate(0, 0) rotate(0deg) scale(1); } 60% { transform: translate(-12px, -20px) rotate(-6deg) scale(1.02); } 100% { transform: translate(-15px, -25px) rotate(-8deg) scale(1.04); } }
        @keyframes bodyLeanBack { 0% { transform: scale(1) translate(0, 0); } 60% { transform: scale(0.99) translate(-2px, -3px); } 100% { transform: scale(0.98) translate(-3px, -4px); } }

        /* ===== オーバーレイ ===== */
        .overlay {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 10px; z-index: 5;
          background: radial-gradient(ellipse at center, rgba(10, 6, 6, 0.55) 0%, rgba(0, 0, 0, 0.88) 100%);
          backdrop-filter: blur(3px);
          padding: 16px;
        }
        .overlay--passive {
          background: transparent; backdrop-filter: none; pointer-events: none;
        }
        .overlay--okori {
          background: radial-gradient(ellipse at center, rgba(178, 34, 34, 0.22) 0%, transparent 70%);
        }
        .overlay-msg {
          font-size: 18px; letter-spacing: 0.4em; color: #FFD700; margin: 0;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.5), 0 1px 2px #000;
          font-weight: 700;
        }
        .overlay-round {
          font-size: 12px; color: #c9a96a; margin: 0;
          letter-spacing: 0.2em;
        }
        .overlay-okori-msg {
          font-size: 26px; letter-spacing: 0.5em;
          color: #ff5544; margin: 0; font-weight: 900;
          text-shadow: 0 0 16px rgba(220, 40, 40, 0.7), 0 2px 3px #000;
          animation: okoriPulse 0.8s ease-in-out infinite;
        }
        @keyframes okoriPulse {
          0%, 100% { opacity: 0.75; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.06); }
        }

        /* =====================================================================
           木札風コンソールボックス（墨×臙脂ガラス）
        ====================================================================== */
        .console-box {
          position: relative;
          background:
            linear-gradient(135deg, rgba(40, 18, 18, 0.86) 0%, rgba(12, 6, 6, 0.92) 100%);
          border: 1px solid rgba(255, 215, 0, 0.32);
          padding: 24px 26px;
          width: min(92vw, 420px);
          backdrop-filter: blur(14px) saturate(130%);
          -webkit-backdrop-filter: blur(14px) saturate(130%);
          box-shadow:
            0 0 40px rgba(178, 34, 34, 0.2),
            0 0 80px rgba(0, 0, 0, 0.6),
            inset 0 0 60px rgba(80, 20, 20, 0.18),
            inset 0 1px 0 rgba(245, 230, 200, 0.06);
          overflow: hidden;
        }
        .console-box::before,
        .console-box::after {
          content: '';
          position: absolute;
          width: 16px; height: 16px;
          border: 1px solid #FFD700;
          opacity: 0.9;
        }
        .console-box::before {
          top: -1px; left: -1px;
          border-right: none; border-bottom: none;
        }
        .console-box::after {
          bottom: -1px; right: -1px;
          border-left: none; border-top: none;
        }

        .console-box--menu, .console-box--records, .console-box--result {
          min-width: 300px;
        }
        .console-box--error {
          border-color: rgba(220, 60, 60, 0.5);
          box-shadow:
            0 0 40px rgba(178, 34, 34, 0.3),
            inset 0 0 60px rgba(120, 20, 20, 0.14);
        }
        .console-box--error::before, .console-box--error::after {
          border-color: #ff7b6b;
        }

        .kanji-watermark {
          position: absolute;
          right: -10px;
          bottom: -30px;
          font-size: 140px;
          font-weight: 900;
          color: rgba(178, 34, 34, 0.1);
          letter-spacing: -0.05em;
          line-height: 0.85;
          font-family: 'Noto Serif JP', serif;
          pointer-events: none;
          user-select: none;
          writing-mode: vertical-rl;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.05);
        }

        .console-prompt {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px;
          color: #FFD700;
          letter-spacing: 0.2em;
          padding: 3px 10px;
          background: rgba(178, 34, 34, 0.14);
          border-left: 3px solid #B22222;
          margin-bottom: 14px;
          font-weight: 700;
        }
        .console-prompt--error {
          color: #ff9b8b;
          background: rgba(220, 60, 60, 0.12);
          border-left-color: #ff7b6b;
        }
        .prompt-blink {
          color: #FFD700;
          animation: cursorBlink 1s step-end infinite;
        }
        @keyframes cursorBlink {
          50% { opacity: 0; }
        }

        /* ===== タイポグラフィ ===== */
        .menu-header {
          margin: 4px 0 18px;
          position: relative; z-index: 1;
        }
        .menu-header--records { margin-bottom: 14px; }
        .menu-title-jp-main {
          display: block;
          margin: 0;
          font-size: clamp(30px, 8vw, 42px);
          font-weight: 900;
          letter-spacing: 0.12em;
          color: #f5e6c8;
          line-height: 1.1;
          text-shadow:
            0 0 18px rgba(255, 215, 0, 0.35),
            0 0 36px rgba(178, 34, 34, 0.4),
            0 2px 4px #000;
        }
        .menu-title-jp-sub {
          margin: 12px 0 0;
          font-size: 11px;
          letter-spacing: 0.32em;
          color: #c9a96a;
          opacity: 0.85;
        }

        .menu-sep {
          height: 1px;
          background: linear-gradient(90deg,
            transparent,
            rgba(255, 215, 0, 0.5) 20%,
            rgba(178, 34, 34, 0.6) 50%,
            rgba(255, 215, 0, 0.5) 80%,
            transparent);
          margin: 14px 0 16px;
          position: relative; z-index: 1;
        }

        .menu-stat-line {
          margin-top: 16px;
          padding: 8px 12px;
          background: rgba(60, 20, 20, 0.5);
          border-left: 3px solid #c9a96a;
          display: flex; align-items: center; gap: 8px;
          font-size: 12px;
          letter-spacing: 0.15em;
          position: relative; z-index: 1;
        }
        .stat-key { color: #c9a96a; }
        .stat-sep { color: #8B0000; }
        .stat-val { color: #fbbf24; font-weight: 700; }

        .menu-locked {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          color: #ffb04a;
          font-size: 12px;
          letter-spacing: 0.12em;
          padding: 12px;
          background: rgba(255, 176, 74, 0.08);
          border: 1px solid rgba(255, 176, 74, 0.32);
          border-left: 3px solid #ffb04a;
          margin: 4px 0;
          position: relative; z-index: 1;
        }

        /* ===== データ行 ===== */
        .data-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 12px;
          margin: 4px 0;
          background: rgba(60, 20, 20, 0.42);
          border-left: 3px solid rgba(255, 215, 0, 0.45);
          font-size: 13px;
          letter-spacing: 0.08em;
          position: relative; z-index: 1;
          transition: all 0.2s;
        }
        .data-row:hover {
          background: rgba(90, 28, 28, 0.5);
          border-left-color: #FFD700;
        }
        .data-key {
          color: #FFD700;
        }
        .data-val {
          display: inline-flex; align-items: center; gap: 6px;
          color: #fff; font-weight: 700;
        }
        .data-row--xp {
          background: rgba(255, 215, 0, 0.1);
          border-left-color: #fbbf24;
          margin-top: 10px;
        }
        .data-row--xp .data-key { color: #fbbf24; }
        .xp-val {
          color: #fbbf24 !important;
          font-size: 20px !important;
          text-shadow: 0 0 12px rgba(251, 191, 36, 0.7);
        }

        .locked-bar {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin: 12px 0 0; padding: 8px 12px;
          color: #ffb04a;
          font-size: 11px; letter-spacing: 0.15em;
          background: rgba(255, 176, 74, 0.08);
          border: 1px solid rgba(255, 176, 74, 0.32);
          border-left: 3px solid #ffb04a;
        }

        /* =====================================================================
           和風ボタン（臙脂×ゴールド版）
        ====================================================================== */
        .cyber-btn {
          position: relative;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%;
          padding: 14px 18px;
          background: rgba(60, 20, 20, 0.6);
          color: #FFD700;
          border: 1px solid rgba(255, 215, 0, 0.38);
          border-radius: 0;
          font-family: 'Noto Serif JP', serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.16em;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.4, 1);
          margin-top: 8px;
          overflow: hidden;
          z-index: 1;
        }

        .cyber-btn::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 0;
          background: linear-gradient(180deg, #fbbf24, #B22222);
          transition: width 0.25s cubic-bezier(0.2, 0.8, 0.4, 1);
          z-index: -1;
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
        }

        .cyber-btn::after {
          content: '';
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 1px;
          background: rgba(255, 215, 0, 0.4);
          transition: all 0.25s;
        }

        .cyber-btn:hover {
          color: #fff;
          border-color: #fbbf24;
          background: rgba(90, 28, 28, 0.65);
          padding-left: 28px;
          box-shadow:
            0 0 22px rgba(178, 34, 34, 0.4),
            inset 0 0 20px rgba(255, 215, 0, 0.08);
        }
        .cyber-btn:hover::before {
          width: 6px;
        }
        .cyber-btn:hover::after {
          width: 3px;
          background: #fbbf24;
          box-shadow: 0 0 12px #fbbf24;
        }
        .cyber-btn:active {
          transform: translateX(2px);
        }
        .cyber-btn:disabled {
          background: rgba(40, 30, 30, 0.4);
          color: #6b5b4b;
          border-color: rgba(100, 80, 70, 0.4);
          cursor: not-allowed;
          opacity: 0.5;
        }
        .cyber-btn:disabled:hover {
          padding-left: 18px;
          box-shadow: none;
        }
        .cyber-btn:disabled::before { width: 0; }

        .cyber-btn--primary {
          background: linear-gradient(135deg, rgba(139, 0, 0, 0.7), rgba(178, 34, 34, 0.6));
          color: #fbbf24;
          border-color: rgba(251, 191, 36, 0.55);
          box-shadow: 0 0 18px rgba(178, 34, 34, 0.3);
        }
        .cyber-btn--primary::before {
          background: linear-gradient(180deg, #fbbf24, #FFD700);
        }
        .cyber-btn--primary:hover {
          color: #fff;
          background: linear-gradient(135deg, rgba(178, 34, 34, 0.8), rgba(210, 50, 50, 0.7));
          border-color: #fbbf24;
        }

        .cyber-btn--secondary {
          background: rgba(30, 14, 14, 0.55);
          color: #c9a96a;
          border-color: rgba(201, 169, 106, 0.38);
        }
        .cyber-btn--secondary::before {
          background: linear-gradient(180deg, #c9a96a, #8a6f3a);
        }
        .cyber-btn--secondary:hover {
          color: #fff;
          border-color: #c9a96a;
        }

        .cyber-btn--danger {
          color: #ff9b8b;
          border-color: rgba(220, 60, 60, 0.5);
        }
        .cyber-btn--danger::before {
          background: linear-gradient(180deg, #ff5544, #8B0000);
        }
        .cyber-btn--danger:hover {
          color: #fff;
          border-color: #ff7b6b;
          background: rgba(120, 25, 25, 0.5);
        }

        .cyber-btn-bracket {
          color: rgba(255, 215, 0, 0.55);
          font-weight: 400;
        }
        .cyber-btn--primary .cyber-btn-bracket {
          color: rgba(251, 191, 36, 0.7);
        }
        .cyber-btn--secondary .cyber-btn-bracket {
          color: rgba(201, 169, 106, 0.55);
        }
        .cyber-btn--danger .cyber-btn-bracket {
          color: rgba(255, 155, 139, 0.7);
        }
        .cyber-btn-label {
          flex-shrink: 0;
        }
        .cyber-btn-icon {
          display: inline-flex; align-items: center;
          margin-right: 4px;
        }

        /* ===== ローディング ===== */
        .loading-row {
          display: flex; align-items: center; gap: 12px;
          color: #FFD700;
          font-size: 13px;
          letter-spacing: 0.18em;
          padding: 8px 0;
        }
        .loading-text { color: #fbbf24; }
        .dots {
          display: inline-block;
          animation: dotsBlink 1.4s steps(4, end) infinite;
          width: 1.5em; text-align: left;
        }
        @keyframes dotsBlink {
          0%, 20%   { content: ''; }
          40%       { content: '.'; }
          60%       { content: '..'; }
          80%, 100% { content: '...'; }
        }

        .console-msg {
          color: #c9a96a;
          font-size: 12px;
          letter-spacing: 0.08em;
          margin: 8px 0 14px;
          line-height: 1.7;
        }

        /* ===== カットイン ===== */
        .cutin {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .cutin-text {
          font-size: clamp(42px, 12vw, 82px);
          font-weight: 900;
          font-family: 'Noto Serif JP', serif;
          letter-spacing: 0.05em;
          padding: 0 12px;
          animation: cutinAppear 1.5s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
          transform-origin: center center;
        }
        .cutin-S .cutin-text {
          color: #fbbf24;
          text-shadow:
            0 0 28px #fbbf24, 0 0 52px #FFD700,
            4px 4px 0 #000, -2px -2px 0 #8B0000, 2px -2px 0 #8B0000, -2px 2px 0 #8B0000;
        }
        .cutin-A .cutin-text {
          color: #FFD700;
          text-shadow:
            0 0 26px #FFD700, 0 0 50px #B22222,
            4px 4px 0 #000, -2px -2px 0 #8B0000, 2px -2px 0 #8B0000, -2px 2px 0 #8B0000;
        }
        .cutin-B .cutin-text, .cutin-C .cutin-text {
          color: #f5e6c8;
          text-shadow:
            0 0 18px #c9a96a,
            3px 3px 0 #000, -2px -2px 0 #8B0000, 2px -2px 0 #8B0000, -2px 2px 0 #8B0000;
        }
        .cutin-F .cutin-text {
          color: #ff5544;
          text-shadow:
            0 0 20px #8B0000,
            3px 3px 0 #000, -2px -2px 0 #2a1010, 2px -2px 0 #2a1010, -2px 2px 0 #2a1010;
        }
        @keyframes cutinAppear {
          0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; letter-spacing: 0.5em; }
          15%  { transform: scale(1.4) rotate(-4deg); opacity: 1; letter-spacing: 0.05em; }
          30%  { transform: scale(1.0) rotate(-2deg); }
          70%  { transform: scale(1.0) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(-2deg); opacity: 0; }
        }

        /* ===== 斬撃エフェクト（黄金） ===== */
        .slash-fx {
          position: absolute; inset: -20%;
          z-index: 8; pointer-events: none;
          background: linear-gradient(115deg,
            transparent 30%,
            rgba(255, 255, 255, 0) 38%,
            rgba(255, 248, 220, 0.95) 49%,
            rgba(255, 215, 0, 0.9) 50%,
            rgba(255, 248, 220, 0.95) 51%,
            rgba(255, 255, 255, 0) 62%,
            transparent 70%);
          background-size: 300% 300%;
          background-position: 100% 0%;
          animation: slashSweep 0.5s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
        }
        @keyframes slashSweep {
          0%   { background-position: 120% -20%; opacity: 0; }
          10%  { opacity: 1; }
          100% { background-position: -20% 120%; opacity: 0; }
        }

        /* ===== フラッシュ ===== */
        .flash-success {
          position: absolute; inset: 0;
          background: radial-gradient(circle, rgba(255, 215, 0, 0.5) 0%, transparent 70%);
          animation: flashGold 0.4s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashGold { 0% { opacity: 1; } 100% { opacity: 0; } }
        .flash-fail {
          position: absolute; inset: 0;
          background: rgba(178, 34, 34, 0.4);
          animation: flashRed 0.5s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashRed {
          0%   { opacity: 1; } 100% { opacity: 0; }
        }
        .flash-okori {
          position: absolute; inset: 0;
          background: radial-gradient(circle at center, rgba(220, 40, 40, 0.22) 0%, transparent 60%);
          animation: flashOkori 0.18s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashOkori {
          0%   { opacity: 1; } 100% { opacity: 0; }
        }

        /* ===== 試合終了サマリー ===== */
        .result-title {
          margin: 0 0 14px;
          font-size: 22px;
          letter-spacing: 0.28em;
          color: #fff;
          font-weight: 700;
          text-align: center;
          text-shadow: 0 0 18px rgba(255, 215, 0, 0.5), 0 1px 2px #000;
          position: relative; z-index: 1;
        }

        .rank-display {
          display: flex; align-items: baseline; justify-content: center; gap: 14px;
          margin: 10px 0 16px;
          padding: 14px 12px;
          border: 1px solid;
          animation: rankPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative; z-index: 1;
        }
        @keyframes rankPop {
          0% { transform: scale(0.3); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .rank-label {
          font-size: 11px; letter-spacing: 0.3em;
          color: #FFD700; opacity: 0.85;
        }
        .rank-value {
          font-size: 56px; font-weight: 900;
          font-family: 'Noto Serif JP', serif;
          line-height: 1;
        }
        .rank-S {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(178, 34, 34, 0.16));
          border-color: #fbbf24;
        }
        .rank-S .rank-value {
          color: #fbbf24;
          text-shadow: 0 0 26px #fbbf24, 0 0 52px #FFD700;
        }
        .rank-A {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.16), rgba(178, 34, 34, 0.12));
          border-color: #FFD700;
        }
        .rank-A .rank-value {
          color: #FFD700;
          text-shadow: 0 0 22px #FFD700;
        }
        .rank-B {
          background: rgba(201, 169, 106, 0.1);
          border-color: #c9a96a;
        }
        .rank-B .rank-value {
          color: #f5e6c8;
          text-shadow: 0 0 18px #c9a96a;
        }
        .rank-C {
          background: rgba(201, 169, 106, 0.05);
          border-color: #8a6f3a;
        }
        .rank-C .rank-value { color: #c9a96a; }
        .rank-F {
          background: rgba(178, 34, 34, 0.1);
          border-color: #ff7b6b;
        }
        .rank-F .rank-value { color: #ff5544; }

        .summary-error {
          font-size: 11px; color: #ff9b8b;
          margin: 8px 0 0;
          padding: 6px 10px;
          background: rgba(178, 34, 34, 0.1);
          border-left: 3px solid #ff7b6b;
          letter-spacing: 0.05em;
        }

        .summary-rounds {
          margin: 14px 0;
          border-top: 1px solid rgba(255, 215, 0, 0.25);
          border-bottom: 1px solid rgba(255, 215, 0, 0.25);
          padding: 8px 0;
          position: relative; z-index: 1;
        }
        .summary-round {
          display: grid;
          grid-template-columns: 44px 1fr 32px 70px;
          gap: 8px;
          font-size: 11px;
          padding: 5px 4px;
          align-items: center;
          letter-spacing: 0.05em;
        }
        .summary-round.ok { color: #FFD700; }
        .summary-round.ng { color: #ff9b8b; }
        .summary-round span:last-child { text-align: right; }
        .round-name {
          letter-spacing: 0.05em;
          font-size: 11px;
        }
        .summary-rank {
          font-size: 10px !important; padding: 2px 4px !important;
          font-weight: 900; text-align: center;
        }

        .rank-S-tag { background: #fbbf24; color: #1a0606; box-shadow: 0 0 8px #fbbf24; }
        .rank-A-tag { background: #FFD700; color: #1a0606; }
        .rank-B-tag { background: #c9a96a; color: #1a0606; }
        .rank-C-tag { background: #8a6f3a; color: #fff; }
        .rank-F-tag { background: #B22222; color: #f5e6c8; }
      `}</style>
    </div>
  );
}

// =====================================================================
// 仮想剣士 SVG（臙脂×ゴールド配色）
// =====================================================================
interface KenshiSVGProps {
  glowPart:  HitPart | null;
  intensity: 'okori' | 'strike' | null;
  active:    boolean;
  onTap:     (part: HitPart) => void;
}

function KenshiSVG({ glowPart, intensity, active, onTap }: KenshiSVGProps) {
  const handleClick = (part: HitPart) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) onTap(part);
  };

  const getColors = (part: HitPart) => {
    const isTarget = glowPart === part;
    if (!isTarget || intensity === null) {
      return {
        stroke: '#FFD700',
        fill: 'rgba(80, 30, 30, 0.2)',
        filter: 'url(#goldGlow)',
      };
    }
    if (intensity === 'okori') {
      return {
        stroke: '#ff8866',
        fill: 'rgba(178, 34, 34, 0.22)',
        filter: 'url(#redGlow)',
      };
    }
    return {
      stroke: '#ff3030',
      fill: 'rgba(200, 30, 30, 0.36)',
      filter: 'url(#redGlow)',
    };
  };

  const colorTransition = intensity === 'strike'
    ? 'fill 0.1s ease-out, stroke 0.1s ease-out'
    : 'fill 0.6s ease-in, stroke 0.6s ease-in';

  const hitStyle = (isActive: boolean): React.CSSProperties => ({
    cursor: isActive ? 'pointer' : 'default',
    pointerEvents: isActive ? 'all' : 'none',
    transition: colorTransition,
  });

  const menColors  = getColors('men');
  const koteColors = getColors('kote');
  const doColors   = getColors('do');

  return (
    <svg viewBox="0 0 300 500" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="redGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="thinGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="tipGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        <symbol id="bracket-tl" viewBox="0 0 20 20"><path d="M 0 8 L 0 0 L 8 0" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-tr" viewBox="0 0 20 20"><path d="M 12 0 L 20 0 L 20 8" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-bl" viewBox="0 0 20 20"><path d="M 0 12 L 0 20 L 8 20" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
        <symbol id="bracket-br" viewBox="0 0 20 20"><path d="M 12 20 L 20 20 L 20 12" stroke="currentColor" strokeWidth="1" fill="none" /></symbol>
      </defs>

      <g pointerEvents="none">
        <g stroke="#8B0000" strokeWidth="0.4" fill="none" opacity="0.5">
          <line x1="150" y1="20" x2="150" y2="490" strokeDasharray="2 4" />
          <line x1="20" y1="100" x2="280" y2="100" strokeDasharray="1 3" />
          <line x1="20" y1="280" x2="280" y2="280" strokeDasharray="1 3" />
          <line x1="20" y1="340" x2="280" y2="340" strokeDasharray="1 3" />
          <line x1="20" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
          <line x1="280" y1="460" x2="150" y2="86" strokeDasharray="1 6" opacity="0.35" />
        </g>
        <g color="#FFD700" opacity="0.65">
          <use href="#bracket-tl" x="20" y="30" width="22" height="22" />
          <use href="#bracket-tr" x="258" y="30" width="22" height="22" />
          <use href="#bracket-bl" x="20" y="448" width="22" height="22" />
          <use href="#bracket-br" x="258" y="448" width="22" height="22" />
        </g>
        <g fill="#c9a96a" fontFamily="Noto Serif JP, serif" fontSize="8" opacity="0.7">
          <text x="26" y="44">狙</text>
          <text x="264" y="44">壱</text>
          <text x="26" y="464">打突</text>
          <text x="252" y="464">構</text>
        </g>
      </g>

      {/* 面 */}
      <g className="hit-men" onClick={handleClick('men')} onTouchStart={handleClick('men')}>
        <polygon
          points="150,72 188,90 192,140 175,180 125,180 108,140 112,90"
          stroke={menColors.stroke}
          strokeWidth="2"
          fill={menColors.fill}
          filter={menColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={menColors.stroke} strokeWidth="1.2" filter="url(#thinGlow)" style={{ transition: colorTransition }}>
            <line x1="120" y1="108" x2="180" y2="108" />
            <line x1="116" y1="125" x2="184" y2="125" />
            <line x1="120" y1="142" x2="180" y2="142" opacity="0.85" />
            <line x1="128" y1="158" x2="172" y2="158" opacity="0.6" />
          </g>
          <text x="196" y="92" fill="#c9a96a" fontFamily="Noto Serif JP, serif" fontSize="9" opacity="0.85">面</text>
        </g>
      </g>

      {/* 小手 */}
      <g className="hit-kote" onClick={handleClick('kote')} onTouchStart={handleClick('kote')}>
        <polygon
          points="55,330 130,310 142,365 130,395 70,400 38,378 32,355"
          stroke={koteColors.stroke}
          strokeWidth="2.2"
          fill={koteColors.fill}
          filter={koteColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={koteColors.stroke} strokeWidth="0.6" opacity="0.7" fill="none" style={{ transition: colorTransition }}>
            <line x1="60" y1="345" x2="125" y2="328" />
            <line x1="58" y1="370" x2="130" y2="365" />
            <polygon points="75,348 115,335 120,360 80,372" />
          </g>
          <text x="40" y="420" fill="#c9a96a" fontFamily="Noto Serif JP, serif" fontSize="9" opacity="0.85">小手</text>
        </g>
      </g>

      {/* 胴 */}
      <g className="hit-do" onClick={handleClick('do')} onTouchStart={handleClick('do')}>
        <polygon
          points="100,255 200,255 215,290 208,335 150,348 92,335 85,290"
          stroke={doColors.stroke}
          strokeWidth="2"
          fill={doColors.fill}
          filter={doColors.filter}
          style={hitStyle(active)}
        />
        <g pointerEvents="none">
          <g stroke={doColors.stroke} strokeWidth="0.5" fill="none" opacity="0.65" style={{ transition: colorTransition }}>
            <line x1="100" y1="275" x2="200" y2="275" />
            <line x1="92" y1="305" x2="208" y2="305" />
            <line x1="125" y1="260" x2="125" y2="345" strokeDasharray="2 2" />
            <line x1="175" y1="260" x2="175" y2="345" strokeDasharray="2 2" />
            <path d="M 130 268 L 150 295 L 170 268" strokeWidth="0.7" />
          </g>
          <text x="218" y="335" fill="#c9a96a" fontFamily="Noto Serif JP, serif" fontSize="9" opacity="0.85">胴</text>
        </g>
      </g>

      {/* 竹刀（黄金グロウ） */}
      <g className="sword" filter="url(#goldGlow)" pointerEvents="none">
        <polygon points="143,92 157,92 152.5,322 147.5,322" stroke="#fbbf24" strokeWidth="1.3" fill="rgba(255, 215, 0, 0.22)" strokeLinejoin="miter" />
        <line x1="150" y1="92" x2="150" y2="322" stroke="#fff8dc" strokeWidth="0.5" opacity="0.85" />
        <polygon points="146,92 149,92 151,322 150,322" fill="rgba(255, 248, 220, 0.4)" opacity="0.7" />
        <polygon points="145,318 155,318 158,322 155,326 145,326 142,322" stroke="#FFD700" strokeWidth="1.1" fill="rgba(255, 215, 0, 0.32)" />
        <polygon points="148,326 152,326 151,388 149,388" stroke="#FFD700" strokeWidth="1" fill="rgba(255, 215, 0, 0.24)" />
        <g stroke="#fbbf24" strokeWidth="0.4" opacity="0.55">
          <line x1="148.5" y1="345" x2="151.5" y2="345" />
          <line x1="148.7" y1="360" x2="151.3" y2="360" />
          <line x1="148.9" y1="375" x2="151.1" y2="375" />
        </g>
        <polygon points="149,388 151,388 150.5,394 149.5,394" stroke="#FFD700" strokeWidth="0.8" fill="rgba(255, 215, 0, 0.32)" />
        <polygon points="150,72 162,94 138,94" fill="#fff8dc" stroke="#fbbf24" strokeWidth="0.9" filter="url(#tipGlow)" />
        <circle cx="150" cy="86" r="5" fill="#ffffff" opacity="0.95" filter="url(#tipGlow)" />
        <circle cx="150" cy="86" r="2.5" fill="#ffffff" />
        <circle cx="150" cy="86" r="11" stroke="#fbbf24" strokeWidth="0.5" fill="none" strokeDasharray="2 2" opacity="0.65" />
        <circle cx="150" cy="86" r="17" stroke="#B22222" strokeWidth="0.4" fill="none" opacity="0.5" />
        <circle cx="150" cy="86" r="24" stroke="#8B0000" strokeWidth="0.3" fill="none" opacity="0.4" strokeDasharray="3 4" />
      </g>

      <g pointerEvents="none" stroke="#8B0000" strokeWidth="0.5" fill="none" opacity="0.5" filter="url(#thinGlow)">
        <circle cx="150" cy="250" r="3" />
        <line x1="140" y1="250" x2="146" y2="250" />
        <line x1="154" y1="250" x2="160" y2="250" />
        <line x1="150" y1="240" x2="150" y2="246" />
        <line x1="150" y1="254" x2="150" y2="260" />
      </g>
    </svg>
  );
}
