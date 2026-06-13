'use client';

/**
 * =====================================================================
 * 刹那ノ見切 (Setsuna no Mikiri) - 燃えよ剣士 エンドコンテンツ
 * =====================================================================
 * テーマ: 熱血ポップ和風（温かみ臙脂 × ゴールド × 絵文字いっぱい）🔥⚔️
 * 用途: 門下生（生徒）が遊べるボーナスXP獲得用ミニゲーム
 *
 * ステートマシン:
 *   waiting (構え) → pre_okori (間合い) → okori (起こり)★計測開始 → strike → result
 *
 * ★ lucide-react 不使用（自前インラインSVG）
 * ★ 1日5回プレイ制限
 * ★ 見切りランキング（TOP10 ＋ Recharts タイム推移グラフ）
 * ★ Y軸反転（reversed）で「速い＝上」表示
 * =====================================================================
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchMinigameStatus,
  saveMinigameResult,
  fetchMinigameRanking,
  type MinigameRank,
  type MinigameSaveResult,
  type MinigameStatus,
  type MinigameRankingResponse,
} from '@/lib/api';

// =====================================================================
// アイコン（自前インラインSVG）
// =====================================================================
interface IconProps {
  size?:      number;
  className?: string;
}

function ArrowLeft({ size = 20, className = '' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function Loader2({ size = 20, className = '' }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// =====================================================================
// 型定義
// =====================================================================
type HitPart = 'men' | 'kote' | 'do';
type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

type ViewState = 'menu' | 'playing' | 'records' | 'ranking';

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
  { id: 'A', successName: '出端小手',     correctPart: 'kote', glowPart: 'kote', strikeDuration: 1000, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-A' },
  { id: 'B', successName: '面返し胴',     correctPart: 'do',   glowPart: 'do',   strikeDuration: 580, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-B' },
  { id: 'C', successName: '出端面',       correctPart: 'men',  glowPart: 'men',  strikeDuration: 700, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-C' },
  { id: 'D', successName: '小手返し面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 600, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-D' },
  { id: 'E', successName: '小手抜き面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 700, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-E' },
  { id: 'F', successName: '合い小手面',   correctPart: 'kote', glowPart: 'kote', strikeDuration: 500, category: 'oji',     failLabel: 'HIT',  animClass: 'anim-F' },
  { id: 'G', successName: '飛び込み面',   correctPart: 'men',  glowPart: 'men',  strikeDuration: 700, category: 'shikake', failLabel: 'MISS', animClass: 'anim-G' },
  { id: 'H', successName: '飛び込み小手', correctPart: 'kote', glowPart: 'kote', strikeDuration: 700, category: 'shikake', failLabel: 'MISS', animClass: 'anim-H' },
];

const ROUNDS_PER_MATCH = 3;
const MAX_MATCHES_PER_DAY = 5;

// グラフの線カラー（上位5名分）
const CHART_COLORS = ['#FFD700', '#ff7b6b', '#7bd88f', '#7bb0ff', '#d89bff'];

// =====================================================================
// カットイン用テキスト（熱血ポップ）🔥
// =====================================================================
const CUTIN_S = [
  '一本！🔥',
  '神速だ！⚡',
  '心眼さえた！✨',
  'すごいぞ！💯',
  '会心の一撃！💥',
];
const CUTIN_A = [
  'お見事！👏',
  'きまった！⚔️',
  '一本！🔥',
  'そこだ！💨',
  'かっこいい！✨',
];
const CUTIN_BC = [
  'ナイス！👍',
  'ギリギリセーフ！😅',
  'あぶなかった〜💦',
  'なんとか！🌀',
  'おしい、でもOK！👌',
];
const CUTIN_FAIL = [
  'うたれた〜😵',
  'ざんねん！💧',
  'つぎがんばろ！💪',
];
const CUTIN_TOO_EARLY = [
  'お手つき！😂',
  'はやい！はやい！💦',
  'おちついて〜🍵',
];

const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ★ 子ども向け調整版の閾値（学童期の選択反応＋位置決めを考慮して緩和）
//   S: 0    〜 350   集中して見切れた「すごい！」枠
//   A: 351  〜 550   普通に反応できれば届く
//   B: 551  〜 750   ほとんどの子が到達できる
//   C: 751  〜 1000  落ち着いてタップできれば成功
//   F: 1001〜（okori中なら最低Cに丸めて成功・strike中は被弾）
const RANK_THRESHOLD = {
  S: 350,
  A: 550,
  B: 750,
  C: 1000,
} as const;

// ★ 純粋な反応時間(ms)からランクを判定するヘルパー
function judgeRankByReaction(reactionMs: number): 'S' | 'A' | 'B' | 'C' | 'F' {
  if (reactionMs <= RANK_THRESHOLD.S) return 'S';
  if (reactionMs <= RANK_THRESHOLD.A) return 'A';
  if (reactionMs <= RANK_THRESHOLD.B) return 'B';
  if (reactionMs <= RANK_THRESHOLD.C) return 'C';
  return 'F';
}

// ★ ランクに応じたカットインプール（絵文字あり・本アプリのテーマ準拠）を返すヘルパー
function pickCutinByRank(rank: 'S' | 'A' | 'B' | 'C'): string {
  switch (rank) {
    case 'S': return pickRandom(CUTIN_S);
    case 'A': return pickRandom(CUTIN_A);
    case 'B':
    case 'C':
    default:  return pickRandom(CUTIN_BC);
  }
}


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

// ランクごとの応援メッセージ（結果画面用）🔥
function rankCheer(rank: MinigameRank): string {
  switch (rank) {
    case 'S': return 'しんがん全開！道場のヒーローだ！🦸🔥';
    case 'A': return 'めちゃくちゃ強い！その調子だ！⚔️✨';
    case 'B': return 'いい見切り！もう一歩でAランク！💪';
    case 'C': return 'ナイスチャレンジ！次はもっといけるぞ！🌱';
    default:  return 'ドンマイ！何回でも挑戦できるぞ！💪🔥';
  }
}

// =====================================================================
// ★ ランキング推移グラフ（Recharts LineChart）
//   Y軸は reversed で「速い（小さい）＝上」に表示
// =====================================================================
interface RankingChartProps {
  history: MinigameRankingResponse['history'];
}

function RankingChart({ history }: RankingChartProps) {
  // recharts 用に { date, [name]: 秒 } の配列へ変換
  const chartData = useMemo(() => {
    return history.dates.map((label, idx) => {
      const row: Record<string, number | string | null> = { date: label };
      history.series.forEach((s) => {
        const ms = s.points[idx];
        // ミリ秒 → 秒（小数3桁）。null はそのまま（線が途切れる）
        row[s.name] = ms === null || ms === undefined
          ? null
          : Math.round((ms / 1000) * 1000) / 1000;
      });
      return row;
    });
  }, [history]);

  if (!history.series || history.series.length === 0) {
    return (
      <p className="chart-empty">📉 まだグラフにできる記録がないよ。<br />たくさん挑戦してね！🔥</p>
    );
  }

  return (
    <div className="chart-wrap">
      <p className="chart-caption">📈 みんなのタイム推移（上にいくほど速い！⚡）</p>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,215,0,0.12)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#f5e6c8', fontSize: 10 }}
              stroke="rgba(255,215,0,0.4)"
            />
            <YAxis
              tick={{ fill: '#f5e6c8', fontSize: 10 }}
              stroke="rgba(255,215,0,0.4)"
              width={44}
              domain={['auto', 'auto']}
              reversed={true}
              tickFormatter={(v) => `${v}s`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(30,14,14,0.95)',
                border: '1px solid #FFD700',
                borderRadius: 8,
                color: '#f5e6c8',
                fontSize: 12,
              }}
              labelStyle={{ color: '#FFD700', fontWeight: 700 }}
              formatter={(value, name) => {
                if (value === null || value === undefined) {
                  return ['記録なし', name as string];
                }
                return [`${value}秒`, name as string];
              }}
            />

            <Legend
              wrapperStyle={{ fontSize: 11, color: '#f5e6c8' }}
              iconType="circle"
            />
            {history.series.map((s, i) => (
              <Line
                key={s.userId}
                type="monotone"
                dataKey={s.name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 1 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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

  // ★ ランキング関連（top + history）
  const [ranking, setRanking]               = useState<MinigameRankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError]     = useState<string>('');

  const okoriStartRef    = useRef<number | null>(null);
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

  // ★ ランキング取得
  const loadRanking = useCallback(async () => {
    setRankingLoading(true);
    setRankingError('');
    try {
      const data = await fetchMinigameRanking();
      setRanking(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRankingError(msg);
    } finally {
      setRankingLoading(false);
    }
  }, []);

  const openRanking = useCallback(() => {
    setViewState('ranking');
    loadRanking();
  }, [loadRanking]);

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

  const scheduleNextRound = useCallback(() => {
    const waitMs = randomBetween(1000, 2000);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setPhase('pre_okori');

      const preOkoriMs = randomBetween(1500, 3000);
      timerRef.current = setTimeout(() => {
        const pattern = pickRandomPattern();
        setCurrentPattern(pattern);
        okoriStartRef.current = performance.now();
        setPhase('okori');
        setFlashType('okori');
        setTimeout(() => setFlashType('none'), 120);

        // ★ 子ども向け調整：okori継続（＝タップ猶予）を長めに確保
        //   子どもの選択反応＋位置決め（500〜700ms程度）でも
        //   焦らず正しい部位を押せるよう、900〜1600msに延長。
        const okoriMs = randomBetween(900, 1600);
        timerRef.current = setTimeout(() => {
          setPhase('strike');

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
    setErrorMessage('');
    setViewState('playing');
    setPhase('waiting');
    scheduleNextRound();
  }, [scheduleNextRound]);

  // ===================================================================
  // ★ 案A: タップハンドラ（okori中タップ＝必ず成功）
  //   - waiting / pre_okori 中のタップ → フライング（即Fランク・タイム無効）
  //   - 部位ミス → Fランク・タイム無効
  //   - okori 中の正しい部位タップ
  //       → 「相手の起こりを見切った」＝必ず成功
  //         反応時間(ms)に応じて S/A/B/C を付与（遅くても最低Cで成功）
  //   - strike 中（okoriを見切れず打突を許した）の正しい部位タップ
  //       → 被弾扱いの失敗（Fランク）
  // ===================================================================
  const handleTap = (part: HitPart) => {
    // ── フライング（お手つき）判定 ──
    // ★ 敵がまだ動き出していない無の間（waiting / pre_okori）のタップのみ即フライング失敗
    //   okori 以降は有効打突として受け付けるため、ここには含めない
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
    // ★ 起こり（okori）と打突（strike）の両フェーズでタップを有効打突として受け付ける
    if (phase !== 'okori' && phase !== 'strike') return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const isCorrectPart = part === currentPattern.correctPart;

    // ── 部位ミス → 失敗（タイム無効） ──
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
    // ★ 敵が動き始めた瞬間（okoriStartRef）からの純粋な経過時間をミリ秒で計測
    const reactionMs = okoriStartRef.current !== null
      ? performance.now() - okoriStartRef.current
      : 0;
    const reactionMsRounded = Math.round(reactionMs);

    // ── strike フェーズ＝起こりを見切れず打突を許した → 被弾失敗（Fランク） ──
    if (phase === 'strike') {
      finishRound({
        patternId:   currentPattern.id,
        success:     false,
        reactionMs:  reactionMsRounded, // 被弾タイムは記録（参考表示）
        successName: currentPattern.successName,
        failLabel:   currentPattern.failLabel,
        timing:      'strike',
        cutinText:   pickRandom(CUTIN_FAIL),
        rank:        'F',
      });
      return;
    }

    // ── okori フェーズ＝起こりを見切った → 必ず成功 ──
    // ★ 反応時間に応じて S/A/B/C を付与。
    //   okori継続が長い回で600msを超えても、見切れている以上は最低Cで成功扱い。
    let rank = judgeRankByReaction(reactionMsRounded);
    if (rank === 'F') rank = 'C';

    finishRound({
      patternId:   currentPattern.id,
      success:     true,
      reactionMs:  reactionMsRounded,
      successName: currentPattern.successName,
      failLabel:   '',
      timing:      'okori',
      cutinText:   pickCutinByRank(rank),
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
    setPhase(matchCountRef.current >= MAX_MATCHES_PER_DAY ? 'locked' : 'idle');
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
        <div className="mikiri-glow" />
      </div>

      <header className="mikiri-header">
        {viewState === 'playing' || viewState === 'records' || viewState === 'ranking' ? (
          <button onClick={handleBackToMenu} className="mikiri-back" aria-label="もどる" type="button">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link href="/" className="mikiri-back" aria-label="もどる">
            <ArrowLeft size={20} />
          </Link>
        )}
        <h1 className="mikiri-title">
          <span className="mikiri-title-main">⚔️ 刹那ノ見切 ⚔️</span>
          <span className="mikiri-title-sub">🔥 相手の動きを見ぬけ！ 🔥</span>
        </h1>
        <div className="mikiri-counter" aria-label="今日の挑戦回数">
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
              <div className="console-prompt">🧘 精神とういつ中…</div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">じゅんびしてるよ<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">😣 ざんねん…！</div>
              <p className="console-msg">{errorMessage || 'どうじょうとつながれなかったみたい💦'}</p>
              <button className="cyber-btn cyber-btn--danger" onClick={() => window.location.reload()} type="button">
                🔄 もういちど挑戦！
              </button>
            </div>
          </div>
        )}

        {/* ============ メニュー画面 ============ */}
        {viewState === 'menu' && phase !== 'loading' && phase !== 'error' && (
          <div className="overlay">
            <div className="console-box console-box--menu">
              <div className="kanji-watermark" aria-hidden="true">見切</div>

              <div className="console-prompt">🥋 どうじょう・とっくん部屋</div>

              <div className="menu-header">
                <h2 className="menu-title-jp-main">⚔️ 刹那ノ見切 ⚔️</h2>
                <p className="menu-title-jp-sub">🔥 相手の「起こり」を見切って一本！ 🔥</p>
              </div>

              <div className="menu-sep" />

              {phase === 'locked' ? (
                <div className="menu-locked">
                  🌙 今日の特訓はおしまい！<br />また明日チャレンジしようね！✨
                </div>
              ) : (
                <button
                  className="cyber-btn cyber-btn--primary"
                  onClick={startMatch}
                  type="button"
                  disabled={matchCount >= MAX_MATCHES_PER_DAY}
                >
                  ⚔️ 立ち合いスタート！ 🔥
                </button>
              )}

              <button
                className="cyber-btn cyber-btn--gold"
                onClick={openRanking}
                type="button"
              >
                🏆 見切りランキングを見る
              </button>

              <button
                className="cyber-btn cyber-btn--secondary"
                onClick={() => setViewState('records')}
                type="button"
              >
                📖 じぶんの記録を見る
              </button>

              <div className="menu-stat-line">
                <span className="stat-key">💪 のこり挑戦</span>
                <span className="stat-sep">：</span>
                <span className="stat-val">あと {pad2(remainingQuota)} 回！</span>
              </div>
            </div>
          </div>
        )}

        {/* ============ 記録画面 ============ */}
        {viewState === 'records' && (
          <div className="overlay">
            <div className="console-box console-box--records">
              <div className="kanji-watermark" aria-hidden="true">記録</div>

              <div className="console-prompt">📖 じぶんの修行記録</div>

              <div className="menu-header menu-header--records">
                <h2 className="menu-title-jp-main">📖 修行記録</h2>
                <p className="menu-title-jp-sub">✨ これまでのがんばり ✨</p>
              </div>

              <div className="menu-sep" />

              <div className="data-row">
                <span className="data-key">⚡ 自己ベスト</span>
                <span className="data-val">
                  🏆 {bestTimeMs !== null ? formatTime(bestTimeMs) : '---.---'}
                </span>
              </div>

              <div className="data-row">
                <span className="data-key">⚔️ 今日の挑戦</span>
                <span className="data-val">{pad2(matchCount)} / {pad2(MAX_MATCHES_PER_DAY)} 回</span>
              </div>

              <div className="data-row">
                <span className="data-key">💪 のこり挑戦</span>
                <span className="data-val">あと {pad2(remainingQuota)} 回</span>
              </div>

              {statusInfo?.locked && (
                <div className="locked-bar">
                  🌙 今日の特訓はおしまい！また明日ね✨
                </div>
              )}

              <div className="menu-sep" />

              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                ⬅️ メニューにもどる
              </button>
            </div>
          </div>
        )}

        {/* ============ ★ ランキング画面（グラフ付き） ============ */}
        {viewState === 'ranking' && (
          <div className="overlay">
            <div className="console-box console-box--ranking">
              <div className="kanji-watermark" aria-hidden="true">頂</div>

              <div className="console-prompt">🏆 道場ナンバーワン決定戦！</div>

              <div className="menu-header menu-header--records">
                <h2 className="menu-title-jp-main">🏆 見切りランキング</h2>
                <p className="menu-title-jp-sub">⚡ 道場最速はだれだ！？ ⚡</p>
              </div>

              <div className="menu-sep" />

              {rankingLoading && (
                <div className="loading-row" style={{ justifyContent: 'center' }}>
                  <Loader2 size={20} className="animate-spin" />
                  <span className="loading-text">番付をとりよせ中<span className="dots">...</span></span>
                </div>
              )}

              {!rankingLoading && rankingError && (
                <p className="summary-error">😣 とりこみ失敗: {rankingError}</p>
              )}

              {!rankingLoading && !rankingError && ranking && ranking.top.length === 0 && (
                <p className="console-msg" style={{ textAlign: 'center' }}>
                  📭 まだだれも記録してないよ！<br />🥇 いちばん乗りをめざせ！🔥
                </p>
              )}

              {!rankingLoading && !rankingError && ranking && ranking.top.length > 0 && (
                <>
                  {/* ★ 推移グラフ */}
                  <RankingChart history={ranking.history} />

                  {/* ★ TOP10リスト */}
                  <p className="chart-caption" style={{ marginTop: 14 }}>🥇 ベストタイム TOP10</p>
                  <div className="ranking-list">
                    {ranking.top.map((entry, i) => {
                      const rankNo = i + 1;
                      const medal =
                        rankNo === 1 ? '🥇'
                        : rankNo === 2 ? '🥈'
                        : rankNo === 3 ? '🥉'
                        : '🔸';
                      const medalClass =
                        rankNo === 1 ? 'rank-gold'
                        : rankNo === 2 ? 'rank-silver'
                        : rankNo === 3 ? 'rank-bronze'
                        : '';
                      return (
                        <div key={entry.userId} className={`ranking-row ${medalClass}`}>
                          <span className="ranking-no">{medal}{pad2(rankNo)}</span>
                          <span className="ranking-name">{entry.name}</span>
                          <span className="ranking-time">💨 {formatTime(entry.bestTimeMs)}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="menu-sep" />

              <button className="cyber-btn cyber-btn--gold" onClick={loadRanking} type="button" disabled={rankingLoading}>
                🔄 番付をこうしん
              </button>

              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                ⬅️ メニューにもどる
              </button>
            </div>
          </div>
        )}

        {/* ============ プレイ画面 ============ */}
        {viewState === 'playing' && phase === 'waiting' && (
          <div className="overlay overlay--passive">
            <p className="overlay-msg">🥋 かまえて…！</p>
            <p className="overlay-round">{pad2(roundIdx + 1)} 本め / 全 {pad2(ROUNDS_PER_MATCH)} 本</p>
          </div>
        )}

        {viewState === 'playing' && phase === 'okori' && (
          <div className="overlay overlay--passive overlay--okori">
            <p className="overlay-okori-msg">⚡ いまだ！⚡</p>
          </div>
        )}

        {phase === 'submitting' && (
          <div className="overlay">
            <div className="console-box">
              <div className="console-prompt">📝 記録中…🔥</div>
              <div className="loading-row">
                <Loader2 size={20} className="animate-spin" />
                <span className="loading-text">けっか を記録中<span className="dots">...</span></span>
              </div>
            </div>
          </div>
        )}

        {phase === 'matchEnd' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--result">
              <div className="kanji-watermark" aria-hidden="true">結果</div>

              <div className="console-prompt">🎌 立ち合いの けっか！</div>

              <h2 className="result-title">⚔️ しょうぶあり！ ⚔️</h2>

              <div className={`rank-display rank-${overallRank}`}>
                <span className="rank-label">きみの位は…</span>
                <span className="rank-value">{overallRank}</span>
              </div>

              <p className="rank-cheer">{rankCheer(overallRank)}</p>

              <div className="data-row">
                <span className="data-key">⚔️ 一本数</span>
                <span className="data-val">{successCount} / {ROUNDS_PER_MATCH} 本</span>
              </div>
              <div className="data-row">
                <span className="data-key">💨 平均タイム</span>
                <span className="data-val">{formatTime(averageReaction)}</span>
              </div>

              {lastSaveResult && (
                <div className="data-row data-row--xp">
                  <span className="data-key">✨ ゲットXP</span>
                  <span className="data-val xp-val">+{lastSaveResult.earnedXp} 🔥</span>
                </div>
              )}
              {lastSaveResult?.leveledUp && (
                <div className="levelup-banner">
                  🎉 レベルアップ！ Lv.{lastSaveResult.level} になったぞ！🎉
                </div>
              )}
              {!lastSaveResult && errorMessage && (
                <p className="summary-error">😣 記録失敗: {errorMessage}</p>
              )}

              <div className="summary-rounds">
                {results.map((r, i) => (
                  <div key={i} className={`summary-round ${r.success ? 'ok' : 'ng'}`}>
                    <span>{i + 1}本め</span>
                    <span className="round-name">{r.success ? r.cutinText.replace(/[!！🔥⚡✨💯💥👏⚔️💨👍😅💦🌀👌]/g, '') : r.failLabel}</span>
                    <span className={`summary-rank rank-${r.rank}-tag`}>{r.rank}</span>
                    <span>{formatTime(r.reactionMs)}</span>
                  </div>
                ))}
              </div>

              {matchCount < MAX_MATCHES_PER_DAY ? (
                <>
                  <button className="cyber-btn cyber-btn--primary" onClick={startMatch} type="button">
                    🔥 もう一本！（あと{pad2(remainingQuota)}回）
                  </button>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    ⬅️ メニューにもどる
                  </button>
                </>
              ) : (
                <>
                  <div className="locked-bar">
                    🌙 今日の特訓はここまで！おつかれさま✨
                  </div>
                  <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button">
                    ⬅️ メニューにもどる
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'locked' && viewState === 'playing' && (
          <div className="overlay">
            <div className="console-box console-box--error">
              <div className="console-prompt console-prompt--error">🌙 きょうはここまで！</div>
              <h2 className="result-title">⭐ また明日！ ⭐</h2>
              <p className="console-msg">今日の特別稽古はここまで！<br />また明日挑戦しようぜ！🔥</p>
              {bestTimeMs !== null && (
                <div className="data-row" style={{ marginTop: 12 }}>
                  <span className="data-key">⚡ 自己ベスト</span>
                  <span className="data-val">🏆 {formatTime(bestTimeMs)}</span>
                </div>
              )}
              <button className="cyber-btn cyber-btn--secondary" onClick={handleBackToMenu} type="button" style={{ marginTop: 14 }}>
                ⬅️ メニューにもどる
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================
          styled-jsx: 熱血ポップ和風（温かみ臙脂 × ゴールド）🔥
      =================================================================== */}
      <style jsx>{`
        .mikiri-root {
          position: fixed; inset: 0;
          /* ★ 温かみのある暗い臙脂ベース（漆黒すぎない） */
          background:
            radial-gradient(circle at 50% 0%, #4a1a1a 0%, #2e1212 45%, #1f0d0d 100%);
          color: #f5e6c8;
          overflow: hidden;
          font-family: 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
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
            linear-gradient(rgba(255, 215, 0, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 215, 0, 0.05) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at center, black 40%, transparent 85%);
        }
        .mikiri-glow {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 30%, rgba(255, 120, 60, 0.12) 0%, transparent 60%);
        }

        /* ===== ヘッダー ===== */
        .mikiri-header {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px 10px;
          border-bottom: 2px solid rgba(255, 215, 0, 0.4);
          backdrop-filter: blur(6px);
          background: linear-gradient(180deg, rgba(74, 26, 26, 0.85), rgba(46, 18, 18, 0.6));
        }
        .mikiri-back {
          color: #FFD700; padding: 7px;
          background: rgba(178, 34, 34, 0.3); border: 2px solid rgba(255, 215, 0, 0.4);
          cursor: pointer; transition: all 0.2s;
          display: inline-flex; align-items: center;
          border-radius: 10px;
        }
        .mikiri-back:hover {
          background: rgba(178, 34, 34, 0.5);
          border-color: #FFD700;
          box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
          transform: scale(1.05);
        }
        .mikiri-title { text-align: center; line-height: 1; margin: 0; }
        .mikiri-title-main {
          display: block;
          font-size: 16px; font-weight: 900;
          letter-spacing: 0.08em;
          color: #fff;
          text-shadow: 0 0 14px rgba(255, 215, 0, 0.7), 0 2px 2px #000;
        }
        .mikiri-title-sub {
          display: block; font-size: 10px;
          letter-spacing: 0.05em;
          color: #ffd97a; margin-top: 5px;
          font-weight: 700;
        }
        .mikiri-counter {
          font-size: 16px; font-weight: 900;
          color: #FFD700;
          background: rgba(178, 34, 34, 0.35);
          border: 2px solid rgba(255, 215, 0, 0.5);
          border-radius: 12px;
          padding: 4px 12px;
          letter-spacing: 0.05em;
        }
        .counter-num { color: #ffe97a; }
        .counter-sep { color: #ff9b8b; margin: 0 3px; }
        .counter-max { color: #ffcf8a; }

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
          filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.4));
        }

        /* ===== okori 予備動作アニメ ===== */
        :global(.kenshi-wrap.anim-okori) {
          animation: kenshiOkori 0.7s cubic-bezier(0.55, 0, 0.6, 0.7) forwards;
        }
        @keyframes kenshiOkori {
          0% { transform: translateY(0) scale(1); filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.4)); }
          40% { transform: translateY(1.5px) scale(1.005); filter: drop-shadow(0 0 14px rgba(251, 191, 36, 0.4)); }
          100% { transform: translateY(3px) scale(1.015); filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.55)); }
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
          background: radial-gradient(ellipse at center, rgba(46, 18, 18, 0.55) 0%, rgba(20, 10, 10, 0.85) 100%);
          backdrop-filter: blur(3px);
          padding: 16px;
          overflow-y: auto;
        }
        .overlay--passive {
          background: transparent; backdrop-filter: none; pointer-events: none;
        }
        .overlay--okori {
          background: radial-gradient(ellipse at center, rgba(255, 120, 60, 0.25) 0%, transparent 70%);
        }
        .overlay-msg {
          font-size: 22px; letter-spacing: 0.15em; color: #FFD700; margin: 0;
          text-shadow: 0 0 12px rgba(255, 215, 0, 0.6), 0 2px 2px #000;
          font-weight: 900;
        }
        .overlay-round {
          font-size: 13px; color: #ffd97a; margin: 0;
          letter-spacing: 0.1em; font-weight: 700;
        }
        .overlay-okori-msg {
          font-size: 30px; letter-spacing: 0.2em;
          color: #ffec6b; margin: 0; font-weight: 900;
          text-shadow: 0 0 18px rgba(255, 180, 40, 0.9), 0 2px 3px #000;
          animation: okoriPulse 0.7s ease-in-out infinite;
        }
        @keyframes okoriPulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.12); }
        }

        /* ===== ポップなカードボックス ===== */
        .console-box {
          position: relative;
          background:
            linear-gradient(135deg, rgba(90, 32, 32, 0.92) 0%, rgba(54, 22, 22, 0.95) 100%);
          border: 3px solid rgba(255, 215, 0, 0.55);
          padding: 22px 22px;
          width: min(94vw, 440px);
          max-height: 88vh;
          overflow-y: auto;
          backdrop-filter: blur(10px);
          border-radius: 20px;
          box-shadow:
            0 8px 40px rgba(0, 0, 0, 0.5),
            0 0 30px rgba(255, 180, 40, 0.25),
            inset 0 1px 0 rgba(255, 240, 200, 0.15);
        }

        .console-box--error {
          border-color: rgba(255, 130, 110, 0.7);
        }

        .kanji-watermark {
          position: absolute;
          right: 4px;
          bottom: -10px;
          font-size: 120px;
          font-weight: 900;
          color: rgba(255, 215, 0, 0.07);
          line-height: 0.85;
          pointer-events: none;
          user-select: none;
          writing-mode: vertical-rl;
        }

        .console-prompt {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px;
          color: #1a0606;
          letter-spacing: 0.05em;
          padding: 5px 14px;
          background: linear-gradient(135deg, #FFD700, #ffb347);
          border-radius: 20px;
          margin-bottom: 14px;
          font-weight: 900;
          box-shadow: 0 2px 8px rgba(255, 180, 40, 0.4);
        }
        .console-prompt--error {
          background: linear-gradient(135deg, #ff9b8b, #ff6b6b);
          color: #fff;
        }

        /* ===== タイポグラフィ ===== */
        .menu-header {
          margin: 4px 0 16px;
          position: relative; z-index: 1;
        }
        .menu-header--records { margin-bottom: 14px; }
        .menu-title-jp-main {
          display: block;
          margin: 0;
          font-size: clamp(26px, 7vw, 36px);
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #fff;
          line-height: 1.2;
          text-shadow:
            0 0 16px rgba(255, 215, 0, 0.5),
            0 2px 0 #8B0000,
            0 3px 6px rgba(0,0,0,0.5);
        }
        .menu-title-jp-sub {
          margin: 10px 0 0;
          font-size: 12px;
          letter-spacing: 0.06em;
          color: #ffd97a;
          font-weight: 700;
        }

        .menu-sep {
          height: 2px;
          background: linear-gradient(90deg,
            transparent,
            rgba(255, 215, 0, 0.6) 20%,
            rgba(255, 140, 60, 0.7) 50%,
            rgba(255, 215, 0, 0.6) 80%,
            transparent);
          margin: 14px 0;
          border-radius: 2px;
          position: relative; z-index: 1;
        }

        .menu-stat-line {
          margin-top: 16px;
          padding: 10px 14px;
          background: rgba(255, 215, 0, 0.12);
          border: 2px dashed rgba(255, 215, 0, 0.4);
          border-radius: 12px;
          display: flex; align-items: center; gap: 6px; justify-content: center;
          font-size: 14px; font-weight: 700;
          position: relative; z-index: 1;
        }
        .stat-key { color: #ffd97a; }
        .stat-sep { color: #ff9b8b; }
        .stat-val { color: #ffec6b; font-weight: 900; }

        .menu-locked {
          text-align: center;
          color: #ffd97a;
          font-size: 14px; font-weight: 700;
          line-height: 1.7;
          padding: 16px;
          background: rgba(255, 176, 74, 0.12);
          border: 2px dashed rgba(255, 176, 74, 0.5);
          border-radius: 14px;
          margin: 4px 0;
          position: relative; z-index: 1;
        }

        /* ===== データ行 ===== */
        .data-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px;
          margin: 6px 0;
          background: rgba(255, 215, 0, 0.08);
          border-radius: 12px;
          border: 1px solid rgba(255, 215, 0, 0.25);
          font-size: 14px; font-weight: 700;
          position: relative; z-index: 1;
        }
        .data-key { color: #ffd97a; }
        .data-val {
          display: inline-flex; align-items: center; gap: 6px;
          color: #fff; font-weight: 900;
        }
        .data-row--xp {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 60, 0.15));
          border-color: rgba(255, 215, 0, 0.6);
          margin-top: 12px;
        }
        .data-row--xp .data-key { color: #ffec6b; }
        .xp-val {
          color: #ffec6b !important;
          font-size: 22px !important;
          text-shadow: 0 0 12px rgba(255, 200, 60, 0.8);
        }

        .levelup-banner {
          margin: 12px 0 4px;
          padding: 12px;
          text-align: center;
          font-weight: 900;
          font-size: 15px;
          color: #1a0606;
          background: linear-gradient(135deg, #ffec6b, #ffb347);
          border-radius: 14px;
          box-shadow: 0 0 22px rgba(255, 200, 60, 0.7);
          animation: levelupPulse 0.7s ease-in-out infinite;
        }
        @keyframes levelupPulse {
          0%, 100% { transform: scale(1) rotate(-1deg); }
          50% { transform: scale(1.05) rotate(1deg); }
        }

        .locked-bar {
          text-align: center;
          margin: 12px 0 0; padding: 12px;
          color: #ffd97a; font-weight: 700;
          font-size: 13px; line-height: 1.6;
          background: rgba(255, 176, 74, 0.12);
          border: 2px dashed rgba(255, 176, 74, 0.5);
          border-radius: 14px;
        }

        /* ===== ★ グラフ ===== */
        .chart-wrap {
          margin: 4px 0 6px;
          position: relative; z-index: 1;
        }
        .chart-caption {
          font-size: 13px; font-weight: 900; color: #ffd97a;
          margin: 0 0 8px; text-align: center;
        }
        .chart-box {
          background: rgba(20, 10, 10, 0.5);
          border: 1px solid rgba(255, 215, 0, 0.25);
          border-radius: 14px;
          padding: 8px 6px 4px;
        }
        .chart-empty {
          text-align: center; color: #ffd97a;
          font-size: 13px; font-weight: 700; line-height: 1.8;
          padding: 16px;
        }

        /* ===== ★ ランキングリスト ===== */
        .ranking-list {
          display: flex; flex-direction: column; gap: 6px;
          margin: 8px 0 4px;
          position: relative; z-index: 1;
        }
        .ranking-row {
          display: grid;
          grid-template-columns: 60px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 9px 12px;
          background: rgba(255, 215, 0, 0.07);
          border-radius: 12px;
          border: 1px solid rgba(255, 215, 0, 0.2);
          font-size: 14px; font-weight: 700;
        }
        .ranking-no {
          font-weight: 900;
          color: #ffd97a;
          font-size: 13px;
        }
        .ranking-name {
          color: #fff;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ranking-time {
          color: #ffec6b;
          font-weight: 900;
          text-align: right;
        }
        .ranking-row.rank-gold {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 140, 60, 0.12));
          border-color: #FFD700;
          box-shadow: 0 0 14px rgba(255, 200, 60, 0.3);
        }
        .ranking-row.rank-silver {
          background: linear-gradient(135deg, rgba(220, 220, 230, 0.15), rgba(90, 32, 32, 0.3));
          border-color: #d8d8e0;
        }
        .ranking-row.rank-bronze {
          background: linear-gradient(135deg, rgba(205, 127, 50, 0.18), rgba(90, 32, 32, 0.3));
          border-color: #e0975a;
        }

        /* ===== ポップなボタン ===== */
        .cyber-btn {
          position: relative;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%;
          padding: 15px 18px;
          background: rgba(178, 34, 34, 0.45);
          color: #FFD700;
          border: 2px solid rgba(255, 215, 0, 0.5);
          border-radius: 16px;
          font-family: inherit;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: all 0.18s ease;
          margin-top: 10px;
        }
        .cyber-btn:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 0 6px 20px rgba(255, 180, 40, 0.4);
        }
        .cyber-btn:active { transform: translateY(0) scale(0.98); }
        .cyber-btn:disabled {
          background: rgba(60, 50, 50, 0.4);
          color: #8a7a6a;
          border-color: rgba(120, 100, 90, 0.4);
          cursor: not-allowed;
          transform: none; box-shadow: none;
          opacity: 0.6;
        }

        .cyber-btn--primary {
          background: linear-gradient(135deg, #e23c3c, #ff6b3c);
          color: #fff;
          border-color: #ffd97a;
          box-shadow: 0 4px 16px rgba(255, 80, 50, 0.4);
          font-size: 17px;
          padding: 17px 18px;
        }
        .cyber-btn--primary:hover {
          background: linear-gradient(135deg, #ff4c4c, #ff7c4c);
        }

        .cyber-btn--gold {
          background: linear-gradient(135deg, #FFD700, #ffb347);
          color: #1a0606;
          border-color: #fff3c4;
          box-shadow: 0 4px 16px rgba(255, 200, 60, 0.4);
        }
        .cyber-btn--gold:hover {
          background: linear-gradient(135deg, #ffe44d, #ffc14d);
        }

        .cyber-btn--secondary {
          background: rgba(54, 22, 22, 0.6);
          color: #ffd97a;
          border-color: rgba(201, 169, 106, 0.5);
        }
        .cyber-btn--secondary:hover {
          background: rgba(74, 30, 30, 0.7);
          color: #fff;
        }

        .cyber-btn--danger {
          background: linear-gradient(135deg, #ff6b6b, #ff9b8b);
          color: #fff;
          border-color: #ffd0c4;
        }

        /* ===== ローディング ===== */
        .loading-row {
          display: flex; align-items: center; gap: 12px;
          color: #FFD700;
          font-size: 14px; font-weight: 700;
          letter-spacing: 0.05em;
          padding: 8px 0;
        }
        .loading-text { color: #ffd97a; }
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
          color: #ffd97a;
          font-size: 14px; font-weight: 700;
          letter-spacing: 0.03em;
          margin: 8px 0 14px;
          line-height: 1.8;
          text-align: center;
        }

        /* ===== カットイン ===== */
        .cutin {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .cutin-text {
          font-size: clamp(34px, 10vw, 68px);
          font-weight: 900;
          font-family: inherit;
          letter-spacing: 0.02em;
          padding: 0 12px;
          text-align: center;
          animation: cutinAppear 1.5s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
          transform-origin: center center;
        }
        .cutin-S .cutin-text {
          color: #ffec6b;
          text-shadow:
            0 0 28px #ffec6b, 0 0 52px #ffb347,
            3px 3px 0 #8B0000, -2px -2px 0 #8B0000;
        }
        .cutin-A .cutin-text {
          color: #FFD700;
          text-shadow:
            0 0 24px #FFD700, 0 0 44px #ff8c3c,
            3px 3px 0 #8B0000, -2px -2px 0 #8B0000;
        }
        .cutin-B .cutin-text, .cutin-C .cutin-text {
          color: #fff;
          text-shadow:
            0 0 18px #ffd97a,
            3px 3px 0 #8B0000, -2px -2px 0 #8B0000;
        }
        .cutin-F .cutin-text {
          color: #ff8c7a;
          text-shadow:
            0 0 18px #ff5544,
            3px 3px 0 #2a1010, -2px -2px 0 #2a1010;
        }
        @keyframes cutinAppear {
          0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; }
          15%  { transform: scale(1.4) rotate(-4deg); opacity: 1; }
          30%  { transform: scale(1.0) rotate(-2deg); }
          70%  { transform: scale(1.0) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.1) rotate(-2deg); opacity: 0; }
        }

        /* ===== 斬撃エフェクト ===== */
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
          background: rgba(255, 80, 60, 0.35);
          animation: flashRed 0.5s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashRed { 0% { opacity: 1; } 100% { opacity: 0; } }
        .flash-okori {
          position: absolute; inset: 0;
          background: radial-gradient(circle at center, rgba(255, 140, 60, 0.3) 0%, transparent 60%);
          animation: flashOkori 0.18s ease-out;
          pointer-events: none; z-index: 4;
        }
        @keyframes flashOkori { 0% { opacity: 1; } 100% { opacity: 0; } }

        /* ===== 結果サマリー ===== */
        .result-title {
          margin: 0 0 12px;
          font-size: 24px;
          letter-spacing: 0.05em;
          color: #fff;
          font-weight: 900;
          text-align: center;
          text-shadow: 0 0 18px rgba(255, 215, 0, 0.6), 0 2px 2px #000;
          position: relative; z-index: 1;
        }

        .rank-display {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          margin: 8px 0 8px;
          padding: 14px 12px;
          border: 3px solid;
          border-radius: 18px;
          animation: rankPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative; z-index: 1;
        }
        @keyframes rankPop {
          0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
          70% { transform: scale(1.15) rotate(3deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        .rank-label {
          font-size: 12px; font-weight: 700;
          color: #ffd97a;
        }
        .rank-value {
          font-size: 64px; font-weight: 900;
          font-family: inherit;
          line-height: 1;
        }
        .rank-cheer {
          text-align: center;
          font-size: 13px; font-weight: 700;
          color: #ffd97a;
          margin: 0 0 10px;
          line-height: 1.6;
          position: relative; z-index: 1;
        }
        .rank-S {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 140, 60, 0.18));
          border-color: #ffec6b;
        }
        .rank-S .rank-value {
          color: #ffec6b;
          text-shadow: 0 0 26px #ffec6b, 0 0 52px #ffb347;
        }
        .rank-A {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.18), rgba(255, 140, 60, 0.12));
          border-color: #FFD700;
        }
        .rank-A .rank-value { color: #FFD700; text-shadow: 0 0 22px #FFD700; }
        .rank-B {
          background: rgba(255, 240, 200, 0.1);
          border-color: #ffd97a;
        }
        .rank-B .rank-value { color: #fff; text-shadow: 0 0 18px #ffd97a; }
        .rank-C {
          background: rgba(255, 240, 200, 0.05);
          border-color: #c9a96a;
        }
        .rank-C .rank-value { color: #ffd97a; }
        .rank-F {
          background: rgba(255, 80, 60, 0.12);
          border-color: #ff8c7a;
        }
        .rank-F .rank-value { color: #ff8c7a; }

        .summary-error {
          font-size: 12px; color: #ff9b8b; font-weight: 700;
          margin: 8px 0 0;
          padding: 8px 10px;
          background: rgba(255, 80, 60, 0.12);
          border-radius: 10px;
          text-align: center;
        }

        .summary-rounds {
          margin: 14px 0;
          padding: 10px;
          background: rgba(20, 10, 10, 0.4);
          border-radius: 12px;
          position: relative; z-index: 1;
        }
        .summary-round {
          display: grid;
          grid-template-columns: 50px 1fr 36px 72px;
          gap: 8px;
          font-size: 12px; font-weight: 700;
          padding: 5px 4px;
          align-items: center;
        }
        .summary-round.ok { color: #ffd97a; }
        .summary-round.ng { color: #ff9b8b; }
        .summary-round span:last-child { text-align: right; }
        .round-name { font-size: 12px; }
        .summary-rank {
          font-size: 11px !important; padding: 2px 4px !important;
          font-weight: 900; text-align: center;
          border-radius: 6px;
        }

        .rank-S-tag { background: #ffec6b; color: #1a0606; box-shadow: 0 0 8px #ffec6b; }
        .rank-A-tag { background: #FFD700; color: #1a0606; }
        .rank-B-tag { background: #ffd97a; color: #1a0606; }
        .rank-C-tag { background: #c9a96a; color: #1a0606; }
        .rank-F-tag { background: #ff8c7a; color: #1a0606; }
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
        fill: 'rgba(120, 50, 40, 0.25)',
        filter: 'url(#goldGlow)',
      };
    }
    if (intensity === 'okori') {
      return {
        stroke: '#ff8866',
        fill: 'rgba(255, 120, 60, 0.28)',
        filter: 'url(#redGlow)',
      };
    }
    return {
      stroke: '#ff4030',
      fill: 'rgba(255, 60, 40, 0.4)',
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
        <g stroke="#ff8c5a" strokeWidth="0.4" fill="none" opacity="0.5">
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
        <g fill="#ffcf8a" fontFamily="'Noto Sans JP', sans-serif" fontSize="9" opacity="0.75" fontWeight="700">
          <text x="26" y="44">ねらえ！</text>
          <text x="244" y="464">かまえ</text>
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
          <text x="196" y="92" fill="#ffcf8a" fontFamily="'Noto Sans JP', sans-serif" fontSize="11" fontWeight="700" opacity="0.9">面</text>
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
          <text x="40" y="420" fill="#ffcf8a" fontFamily="'Noto Sans JP', sans-serif" fontSize="11" fontWeight="700" opacity="0.9">小手</text>
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
          <text x="218" y="335" fill="#ffcf8a" fontFamily="'Noto Sans JP', sans-serif" fontSize="11" fontWeight="700" opacity="0.9">胴</text>
        </g>
      </g>

      {/* 竹刀（黄金グロウ） */}
      <g className="sword" filter="url(#goldGlow)" pointerEvents="none">
        <polygon points="143,92 157,92 152.5,322 147.5,322" stroke="#fbbf24" strokeWidth="1.3" fill="rgba(255, 215, 0, 0.25)" strokeLinejoin="miter" />
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
        <circle cx="150" cy="86" r="17" stroke="#ff8c5a" strokeWidth="0.4" fill="none" opacity="0.5" />
        <circle cx="150" cy="86" r="24" stroke="#ff8c5a" strokeWidth="0.3" fill="none" opacity="0.4" strokeDasharray="3 4" />
      </g>

      <g pointerEvents="none" stroke="#ff8c5a" strokeWidth="0.5" fill="none" opacity="0.5" filter="url(#thinGlow)">
        <circle cx="150" cy="250" r="3" />
        <line x1="140" y1="250" x2="146" y2="250" />
        <line x1="154" y1="250" x2="160" y2="250" />
        <line x1="150" y1="240" x2="150" y2="246" />
        <line x1="150" y1="254" x2="150" y2="260" />
      </g>
    </svg>
  );
}
