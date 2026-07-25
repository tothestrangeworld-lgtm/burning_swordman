// src/components/NakamaGraph.tsx
// =====================================================================
// 燃えろ剣士 - なかま散布図（累計稽古日数 × 累計経験値）
// 生徒の「なかま」画面・先生ダッシュボードの両方から再利用する。
// =====================================================================

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
} from 'recharts';
import { THEME, levelColor } from '@/types';

// =====================================================================
// 公開型
// =====================================================================

export interface NakamaGraphEntry {
  user_id:               string;
  name:                  string;
  grade?:                string;
  level:                 number;
  total_xp:              number;
  title:                 string;
  last_practice_date:    string | null;
  daysSinceLastPractice: number | null;
  total_practice_days:   number;
  isBurning?:            boolean;
  cheeredTodayByMe?:     boolean;
}

export interface NakamaGraphProps {
  entries:       NakamaGraphEntry[];
  /** 生徒モード: 自分の user_id（金色プロットで強調） */
  selfUserId?:     string | null;
  /** 先生ダッシュボード向け（凡例・ポップアップの挙動を切り替え） */
  isTeacherMode?:  boolean;
  /** 生徒モード: 応援ボタン押下時 */
  onCheer?:        (entry: NakamaGraphEntry) => void | Promise<void>;
  cheeringId?:     string | null;
}

// =====================================================================
// 配色・ズーム定数
// =====================================================================

const NAKAMA_COLOR  = '#4DB8FF';
const NAKAMA_STROKE = '#1E88E5';
const SELF_COLOR    = '#FFD700';
const SELF_STROKE   = '#FFF7C0';

const ZOOM_MIN  = 1;
const ZOOM_MAX  = 4;
const ZOOM_STEP = 0.5;

const POPUP_W = 240;
const POPUP_H = 220;

interface ScatterPoint {
  x:       number;
  y:       number;
  z:       number;
  isSelf:  boolean;
  initial: string;
  entry:   NakamaGraphEntry;
}

interface PopupState {
  entry: NakamaGraphEntry;
  cx:    number;
  cy:    number;
}

function firstChar(name: string): string {
  if (!name) return '?';
  return Array.from(name.trim())[0] ?? '?';
}

function formatLastPractice(
  last: string | null,
  days: number | null,
): string {
  if (last == null || days == null) return 'まだ稽古なし';
  if (days <= 0) return '今日 稽古した！';
  if (days === 1) return 'きのう 稽古';
  if (days <= 3) return `${days}日前に稽古`;
  return `${days}日 お休み中`;
}

function isBurningEntry(entry: NakamaGraphEntry): boolean {
  if (entry.isBurning != null) return entry.isBurning;
  const days = entry.daysSinceLastPractice;
  return days != null && days <= 3;
}

// =====================================================================
// カスタムプロット（円＋頭文字）
// =====================================================================

function NakamaDot(props: {
  cx?: number;
  cy?: number;
  payload?: ScatterPoint;
}) {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
    return null;
  }
  const p = payload;
  const r = p.isSelf ? 16 : 13;
  const fill = p.isSelf ? SELF_COLOR : NAKAMA_COLOR;
  const stroke = p.isSelf ? SELF_STROKE : NAKAMA_STROKE;
  const strokeWidth = p.isSelf ? 3 : 1.5;
  const textColor = p.isSelf ? '#5A3B00' : '#0A2A45';

  return (
    <g style={{ cursor: 'pointer' }}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{
          filter: p.isSelf
            ? 'drop-shadow(0 0 8px rgba(255,215,0,0.9))'
            : 'none',
        }}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={p.isSelf ? 15 : 12}
        fontWeight={900}
        fill={textColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {p.initial}
      </text>
    </g>
  );
}

// =====================================================================
// インラインポップアップ
// =====================================================================

function InlinePopup({
  entry,
  left,
  top,
  isTeacherMode,
  isSelf,
  cheering,
  disabled,
  onCheer,
  onClose,
}: {
  entry:         NakamaGraphEntry;
  left:          number;
  top:           number;
  isTeacherMode: boolean;
  isSelf:        boolean;
  cheering:      boolean;
  disabled:      boolean;
  onCheer?:      () => void;
  onClose:       () => void;
}) {
  const lvColor = levelColor(entry.level);
  const alreadyCheered = entry.cheeredTodayByMe ?? false;
  const burning = isBurningEntry(entry);
  const lastLabel = formatLastPractice(
    entry.last_practice_date,
    entry.daysSinceLastPractice,
  );

  return (
    <div
      style={{
        ...styles.popup,
        left,
        top,
        width: POPUP_W,
        borderColor: isSelf && !isTeacherMode ? SELF_STROKE : NAKAMA_STROKE,
      }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`${entry.name}のじょうほう`}
    >
      <button
        type="button"
        style={styles.popupClose}
        onClick={onClose}
        aria-label="閉じる"
      >
        ✕
      </button>

      <div style={styles.popupHead}>
        <span style={styles.popupFlame}>
          {isSelf && !isTeacherMode ? '⭐' : burning ? '🔥' : '💤'}
        </span>
        <div style={styles.popupNameCol}>
          <div style={styles.popupNameRow}>
            <span style={styles.popupName}>{entry.name}</span>
            {entry.grade && (
              <span style={styles.gradeBadge}>{entry.grade}年</span>
            )}
            {isSelf && !isTeacherMode && (
              <span style={styles.selfBadge}>キミ</span>
            )}
          </div>
          <div style={styles.popupTitle}>「{entry.title}」</div>
        </div>
      </div>

      <div style={styles.popupStats}>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>レベル</span>
          <span style={{ ...styles.popupStatBadge, backgroundColor: lvColor }}>
            Lv.{entry.level}
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>経験値</span>
          <span style={styles.popupStatValue}>
            {entry.total_xp.toLocaleString()}
            <span style={styles.popupStatUnit}> XP</span>
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>稽古日数</span>
          <span style={styles.popupStatValue}>
            {entry.total_practice_days}
            <span style={styles.popupStatUnit}> 日</span>
          </span>
        </div>
        <div style={styles.popupStatBox}>
          <span style={styles.popupStatLabel}>最後の稽古</span>
          <span style={styles.popupStatValueSmall}>{lastLabel}</span>
        </div>
      </div>

      {isTeacherMode ? (
        <Link
          href={`/teacher/${entry.user_id}`}
          style={styles.popupEvalLink}
          onClick={onClose}
        >
          <span style={{ fontSize: '16px' }}>⚔️</span>
          <span>評価する</span>
        </Link>
      ) : !isSelf ? (
        <button
          type="button"
          onClick={onCheer}
          disabled={disabled || alreadyCheered}
          style={{
            ...styles.popupCheerBtn,
            ...(alreadyCheered ? styles.popupCheerBtnDone : {}),
            ...(cheering ? styles.cheerBtnLoading : {}),
          }}
        >
          {cheering ? (
            <span style={styles.cheerSpinner} aria-hidden="true" />
          ) : alreadyCheered ? (
            <>
              <span style={{ fontSize: '16px' }}>✅</span>
              <span>応援ずみ！</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '16px' }}>🎌</span>
              <span>応援する（+5 XP）</span>
            </>
          )}
        </button>
      ) : (
        <div style={styles.popupSelfMsg}>🔥 これがキミの現在地だ！</div>
      )}
    </div>
  );
}

// =====================================================================
// メインコンポーネント
// =====================================================================

export default function NakamaGraph({
  entries,
  selfUserId = null,
  isTeacherMode = false,
  onCheer,
  cheeringId = null,
}: NakamaGraphProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [zoom, setZoom] = useState<number>(ZOOM_MIN);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chartInnerRef = useRef<HTMLDivElement | null>(null);

  const clampZoom = (z: number) =>
    Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

  const zoomIn = () => {
    setPopup(null);
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  };
  const zoomOut = () => {
    setPopup(null);
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  };
  const zoomReset = () => {
    setPopup(null);
    setZoom(ZOOM_MIN);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  };

  const scatterData: ScatterPoint[] = useMemo(() => {
    const points: ScatterPoint[] = entries.map((entry) => {
      const isSelf = !isTeacherMode && selfUserId != null && entry.user_id === selfUserId;
      return {
        x:       entry.total_practice_days,
        y:       entry.total_xp,
        z:       isSelf ? 360 : 100,
        isSelf,
        initial: firstChar(entry.name),
        entry,
      };
    });

    // 自分を最前面に描画（生徒モードのみ）
    if (!isTeacherMode && selfUserId) {
      points.sort((a, b) => {
        if (a.isSelf === b.isSelf) return 0;
        return a.isSelf ? 1 : -1;
      });
    }

    return points;
  }, [entries, isTeacherMode, selfUserId]);

  const axisRange = useMemo(() => {
    if (scatterData.length === 0) {
      return { xMax: 10, yMax: 100 };
    }
    const maxX = Math.max(...scatterData.map((p) => p.x));
    const maxY = Math.max(...scatterData.map((p) => p.y));
    const xMax = Math.max(10, Math.ceil((maxX + 2) / 5) * 5);
    const yPadded = maxY * 1.1;
    const step =
      yPadded < 100 ? 10
      : yPadded < 1000 ? 100
      : yPadded < 10000 ? 500
      : 1000;
    const yMax = Math.max(step, Math.ceil(yPadded / step) * step);
    return { xMax, yMax };
  }, [scatterData]);

  const popupPos = useMemo(() => {
    if (!popup) return null;
    const inner = chartInnerRef.current;
    const areaW = inner?.clientWidth ?? 320;
    const areaH = inner?.clientHeight ?? 360;
    const gap = 14;

    let left = popup.cx + gap;
    if (left + POPUP_W > areaW) {
      left = popup.cx - gap - POPUP_W;
    }
    if (left < 4) left = 4;
    if (left + POPUP_W > areaW - 4) left = Math.max(4, areaW - 4 - POPUP_W);

    let top = popup.cy - POPUP_H / 2;
    if (top < 4) top = 4;
    if (top + POPUP_H > areaH - 4) top = Math.max(4, areaH - 4 - POPUP_H);

    return { left, top };
  }, [popup]);

  const zoomPct = Math.round(zoom * 100);
  const defaultHint = isTeacherMode
    ? 'ドットをタップすると個別評価画面へ移動できるよ！'
    : zoom > ZOOM_MIN
      ? '指でスワイプして見たい場所へ移動できるよ！'
      : '右上にいくほど「たくさん稽古して、強い剣士」だ！🔥';

  if (entries.length === 0) {
    return (
      <div style={styles.emptyGraph}>
        <span style={{ fontSize: '28px' }}>🎌</span>
        <p style={styles.emptyGraphText}>
          {isTeacherMode
            ? 'まだ門下生がいないため、マップを表示できません'
            : 'なかまがまだいません'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={styles.graphCard}>
        <div style={styles.graphTopBar}>
          <div style={styles.graphLegend}>
            <span style={styles.legendItem}>
              <span
                style={{
                  ...styles.legendDot,
                  backgroundColor: NAKAMA_COLOR,
                  border:          `2px solid ${NAKAMA_STROKE}`,
                }}
              />
              {isTeacherMode ? '門下生' : 'なかま'}
            </span>
            {!isTeacherMode && (
              <span style={styles.legendItem}>
                <span
                  style={{
                    ...styles.legendDot,
                    background: 'radial-gradient(circle, #FFF7C0 0%, #FFD700 55%, #FFA000 100%)',
                    boxShadow: '0 0 8px rgba(255,215,0,0.9)',
                  }}
                />
                キミ
              </span>
            )}
          </div>

          <div style={styles.zoomBar} role="group" aria-label="ズーム操作">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="ズームアウト"
              style={{
                ...styles.zoomBtn,
                ...(zoom <= ZOOM_MIN ? styles.zoomBtnDisabled : {}),
              }}
            >
              −
            </button>
            <button
              type="button"
              onClick={zoomReset}
              aria-label="ズームをリセット"
              style={styles.zoomResetBtn}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="ズームイン"
              style={{
                ...styles.zoomBtn,
                ...(zoom >= ZOOM_MAX ? styles.zoomBtnDisabled : {}),
              }}
            >
              ＋
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          style={{
            ...styles.chartScroll,
            overflow: zoom > ZOOM_MIN ? 'auto' : 'hidden',
            cursor:   zoom > ZOOM_MIN ? 'grab' : 'default',
          }}
        >
          <div
            ref={chartInnerRef}
            style={{
              position: 'relative',
              width:    `${100 * zoom}%`,
              height:   `${360 * zoom}px`,
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 8 }}>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.10)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="累計稽古日数"
                  domain={[0, axisRange.xMax]}
                  tick={{ fill: THEME.textMuted, fontSize: 11 }}
                  stroke="rgba(255,255,255,0.25)"
                  label={{
                    value:    '累計稽古日数（日）',
                    position: 'bottom',
                    offset:   16,
                    fill:     THEME.textSubtle,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="累計経験値"
                  domain={[0, axisRange.yMax]}
                  tick={{ fill: THEME.textMuted, fontSize: 11 }}
                  stroke="rgba(255,255,255,0.25)"
                  width={44}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(v)
                  }
                  label={{
                    value:    '累計経験値（XP）',
                    angle:    -90,
                    position: 'insideLeft',
                    offset:   12,
                    fill:     THEME.textSubtle,
                    fontSize: 12,
                  }}
                />
                <ZAxis type="number" dataKey="z" range={[80, 400]} />
                <Scatter
                  data={scatterData}
                  isAnimationActive={false}
                  shape={<NakamaDot />}
                  onClick={(pt: { payload?: ScatterPoint; cx?: number; cy?: number }) => {
                    const entry = pt?.payload?.entry;
                    if (!entry) return;
                    const cx = typeof pt?.cx === 'number' ? pt.cx : 0;
                    const cy = typeof pt?.cy === 'number' ? pt.cy : 0;
                    setPopup({ entry, cx, cy });
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>

            {popup && popupPos && (
              <>
                <div
                  style={styles.popupCatcher}
                  onClick={() => setPopup(null)}
                  aria-hidden="true"
                />
                <InlinePopup
                  entry={popup.entry}
                  left={popupPos.left}
                  top={popupPos.top}
                  isTeacherMode={isTeacherMode}
                  isSelf={
                    !isTeacherMode &&
                    selfUserId != null &&
                    popup.entry.user_id === selfUserId
                  }
                  cheering={cheeringId === popup.entry.user_id}
                  disabled={cheeringId !== null}
                  onCheer={onCheer ? () => onCheer(popup.entry) : undefined}
                  onClose={() => setPopup(null)}
                />
              </>
            )}
          </div>
        </div>

        <div style={styles.graphHint}>{defaultHint}</div>
      </div>

      <style>{`
        @keyframes nakama_flame_flicker {
          0%, 100% { transform: scale(1) rotate(-4deg); opacity: 1; }
          50%      { transform: scale(1.18) rotate(4deg); opacity: 0.85; }
        }
        @keyframes nakama_popup_in {
          0%   { transform: scale(0.85); opacity: 0; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes nakama_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

// =====================================================================
// スタイル
// =====================================================================

const styles: Record<string, React.CSSProperties> = {
  graphCard: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '10px',
    padding:         '14px 10px 10px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.border}`,
    borderRadius:    '14px',
    boxShadow:       '0 3px 12px rgba(0,0,0,0.3)',
  },
  graphTopBar: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            '8px',
    flexWrap:       'wrap',
    padding:        '0 2px',
  },
  graphLegend: {
    display: 'flex',
    gap:     '16px',
  },
  legendItem: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  legendDot: {
    width:        '14px',
    height:       '14px',
    borderRadius: '50%',
    display:      'inline-block',
  },
  zoomBar: {
    display:         'flex',
    alignItems:      'center',
    gap:             '6px',
    padding:         '4px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '999px',
  },
  zoomBtn: {
    width:           '32px',
    height:          '32px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      'inherit',
    fontSize:        '20px',
    fontWeight:      900,
    lineHeight:      1,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '50%',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  zoomBtnDisabled: {
    opacity: 0.4,
    cursor:  'not-allowed',
    filter:  'grayscale(0.6)',
  },
  zoomResetBtn: {
    minWidth:        '52px',
    height:          '30px',
    padding:         '0 8px',
    fontFamily:      'inherit',
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.text,
    backgroundColor: 'transparent',
    border:          'none',
    borderRadius:    '999px',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  chartScroll: {
    position:                'relative',
    width:                   '100%',
    height:                  '360px',
    WebkitOverflowScrolling: 'touch',
    borderRadius:            '10px',
  },
  graphHint: {
    textAlign:  'center',
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textSubtle,
    padding:    '0 8px',
    lineHeight: 1.5,
  },
  emptyGraph: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '8px',
    padding:         '32px 16px',
    backgroundColor: THEME.bgCard,
    border:          `2px dashed ${THEME.border}`,
    borderRadius:    '14px',
    textAlign:       'center',
  },
  emptyGraphText: {
    margin:     0,
    fontSize:   '13px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  popupCatcher: {
    position:   'absolute',
    inset:      0,
    zIndex:     10,
    background: 'transparent',
  },
  popup: {
    position:        'absolute',
    zIndex:          20,
    padding:         '12px 12px 12px',
    backgroundColor: THEME.bgCard,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '14px',
    boxShadow:       '0 10px 30px rgba(0,0,0,0.6)',
    animation:       'nakama_popup_in 0.18s cubic-bezier(0.2,0.8,0.3,1.2) both',
  },
  popupClose: {
    position:        'absolute',
    top:             '6px',
    right:           '6px',
    width:           '24px',
    height:          '24px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '12px',
    fontWeight:      900,
    color:           THEME.textMuted,
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '50%',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  popupHead: {
    display:      'flex',
    alignItems:   'center',
    gap:          '8px',
    paddingRight: '22px',
    marginBottom: '10px',
  },
  popupFlame: {
    fontSize:  '26px',
    flexShrink: 0,
    animation: 'nakama_flame_flicker 1.1s ease-in-out infinite',
  },
  popupNameCol: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
    minWidth:      0,
  },
  popupNameRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
    flexWrap:   'wrap',
  },
  popupName: {
    fontSize:   '16px',
    fontWeight: 900,
    color:      THEME.text,
  },
  popupTitle: {
    fontSize:     '11px',
    fontWeight:   700,
    color:        THEME.accent,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  gradeBadge: {
    fontSize:        '10px',
    fontWeight:      700,
    color:           THEME.textMuted,
    padding:         '1px 6px',
    backgroundColor: THEME.bgCardDeep,
    borderRadius:    '999px',
    flexShrink:      0,
  },
  selfBadge: {
    fontSize:     '9px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '1px 7px',
    background:   'linear-gradient(180deg, #FFF7C0 0%, #FFD700 100%)',
    borderRadius: '999px',
    boxShadow:    '0 0 6px rgba(255,215,0,0.7)',
    flexShrink:   0,
  },
  popupStats: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '6px',
    marginBottom:        '10px',
  },
  popupStatBox: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '3px',
    padding:         '7px 4px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${THEME.border}`,
    borderRadius:    '8px',
  },
  popupStatLabel: {
    fontSize:   '9px',
    fontWeight: 700,
    color:      THEME.textSubtle,
  },
  popupStatValue: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.text,
  },
  popupStatValueSmall: {
    fontSize:   '11px',
    fontWeight: 900,
    color:      THEME.text,
    textAlign:  'center',
  },
  popupStatBadge: {
    fontSize:     '12px',
    fontWeight:   900,
    color:        '#1A0000',
    padding:      '2px 10px',
    borderRadius: '6px',
    textShadow:   '0 1px 0 rgba(255,255,255,0.25)',
  },
  popupStatUnit: {
    fontSize:   '10px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  popupCheerBtn: {
    width:           '100%',
    minHeight:       '42px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '6px',
    fontFamily:      'inherit',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #FF5555 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.borderSolid}`,
    borderRadius:    '10px',
    cursor:          'pointer',
    boxShadow:       '0 3px 10px rgba(255,68,68,0.4)',
    WebkitTapHighlightColor: 'transparent',
  },
  popupCheerBtnDone: {
    background: THEME.bgCardDeep,
    border:     `2px solid ${THEME.border}`,
    boxShadow:  'none',
    cursor:     'default',
    color:      THEME.textSubtle,
  },
  popupEvalLink: {
    width:           '100%',
    minHeight:       '42px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '6px',
    fontFamily:      'inherit',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#2D0B0B',
    textDecoration:  'none',
    background:      'linear-gradient(180deg, #FFF7C0 0%, #FFD700 55%, #FFA500 100%)',
    border:          '2px solid #FFFFFF',
    borderRadius:    '10px',
    cursor:          'pointer',
    boxShadow:       '0 3px 10px rgba(255,215,0,0.45)',
    WebkitTapHighlightColor: 'transparent',
  },
  popupSelfMsg: {
    textAlign:       'center',
    fontSize:        '12px',
    fontWeight:      700,
    color:           SELF_COLOR,
    padding:         '9px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px solid ${SELF_COLOR}`,
    borderRadius:    '10px',
  },
  cheerBtnLoading: {
    opacity: 0.8,
    cursor:  'wait',
  },
  cheerSpinner: {
    width:          '18px',
    height:         '18px',
    border:         '3px solid rgba(255,255,255,0.3)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'nakama_spin 0.7s linear infinite',
  },
};
