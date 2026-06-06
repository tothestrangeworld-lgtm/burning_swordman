// src/components/SkillTriangle.tsx
// =====================================================================
// 燃えろ剣士 - 技の修得（純粋ネオン版）
// 円の枠を捨てて漆黒に直接浮かぶ⚔️。加法混色がクリアに輝く。
// =====================================================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Technique, TechniqueId } from '@/types';
import { THEME } from '@/types';

interface Props {
  techniques:        Technique[];
  saturationPoints?: number;
}

const INTENSITY_TARGET = 300;

type PopupKey = TechniqueId | 'TOTAL';

const TECH_THEME: Record<TechniqueId, {
  name:    string;
  color:   string;
  glow:    string;
  bgSoft:  string;
  emoji:   string;
  rgb:     [number, number, number];
}> = {
  T001: { name: '面',   color: '#FF3333', glow: '#FF6666', bgSoft: '#FFE8E8', emoji: '🔥', rgb: [255, 51, 51] },
  T002: { name: '小手', color: '#FFD700', glow: '#FFE566', bgSoft: '#FFF8DC', emoji: '⚡', rgb: [255, 215, 0] },
  T003: { name: '胴',   color: '#3366FF', glow: '#6699FF', bgSoft: '#E6F0FA', emoji: '💧', rgb: [51, 102, 255] },
};

function calcIntensity(points: number): number {
  return Math.min(1.0, Math.sqrt(Math.max(0, points) / INTENSITY_TARGET));
}

function additiveCenterColor(intensities: number[], rgbs: [number, number, number][]): {
  fill:     string;
  glow:     string;
  text:     string;
  whiteMix: number;
  maxI:     number;
} {
  let r = 0, g = 0, b = 0;
  intensities.forEach((intensity, i) => {
    r += rgbs[i][0] * intensity;
    g += rgbs[i][1] * intensity;
    b += rgbs[i][2] * intensity;
  });
  r = Math.min(255, Math.round(r));
  g = Math.min(255, Math.round(g));
  b = Math.min(255, Math.round(b));

  const minI = Math.min(...intensities);
  const maxI = Math.max(...intensities);

  // ★ 修正：白への移行（whiteMix）の立ち上がりを早める
  // minI^2 → minI^1.4 にすることで、序盤からハッキリ白く色付く
  const whiteMix = Math.pow(minI, 1.4);

  const fr = Math.round(r + (255 - r) * whiteMix);
  const fg = Math.round(g + (255 - g) * whiteMix);
  const fb = Math.round(b + (255 - b) * whiteMix);

  const glowAlpha = 0.3 + whiteMix * 0.7;
  return {
    fill:   `rgb(${fr}, ${fg}, ${fb})`,
    glow:   `rgba(255, 255, 255, ${glowAlpha.toFixed(2)})`,
    text:   whiteMix > 0.35 ? '#FFFFFF' : `rgb(${fr}, ${fg}, ${fb})`,
    whiteMix,
    maxI,
  };
}

export default function SkillTriangle({
  techniques,
  saturationPoints = 500,
}: Props) {
  // -----------------------------------------------------------------
  // ポップアップ状態
  // -----------------------------------------------------------------
  const [activePopup, setActivePopup] = useState<PopupKey | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePopup) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setActivePopup(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [activePopup]);

  // -----------------------------------------------------------------
  // データ計算
  // -----------------------------------------------------------------
  const data = useMemo(() => {
    const findTech = (id: TechniqueId) => techniques.find(t => t.id === id);
    return (['T001', 'T002', 'T003'] as TechniqueId[]).map(id => {
      const t = findTech(id);
      const points = t?.points ?? 0;
      const ratio  = Math.min(points / saturationPoints, 1);
      const intensity = calcIntensity(points);
      return {
        id,
        techName: TECH_THEME[id].name,
        points,
        ratio,
        intensity,
      };
    });
  }, [techniques, saturationPoints]);

  // -----------------------------------------------------------------
  // 形状定数
  // -----------------------------------------------------------------
  const SIZE   = 320;
  const PAD_TOP = 60;
  const PAD_SIDE = 40;
  const CENTER = SIZE / 2;
  const MAX_R  = SIZE * 0.34;
  const ANGLES = [-90, 30, 150];

  function polarToXY(angle: number, r: number) {
    const rad = (angle * Math.PI) / 180;
    return {
      x: CENTER + Math.cos(rad) * r,
      y: CENTER + Math.sin(rad) * r,
    };
  }

  const outerPoints = ANGLES.map(a => polarToXY(a, MAX_R));
  const dataPoints  = ANGLES.map((a, i) => polarToXY(a, MAX_R * data[i].ratio));
  const dataPath    = dataPoints.map(p => `${p.x},${p.y}`).join(' ');
  const gridLevels  = [0.25, 0.5, 0.75, 1.0];
  const iconPositions = ANGLES.map(a => polarToXY(a, MAX_R + 38));

  const totalPoints  = data.reduce((s, d) => s + d.points, 0);
  const overallRatio = data.reduce((s, d) => s + d.ratio, 0) / 3;
  const ratios       = data.map(d => d.ratio);
  const maxRatio     = Math.max(...ratios);
  const minRatio     = Math.min(...ratios);
  const balance      = maxRatio === 0 ? 1 : minRatio / maxRatio;
  const isHotZone    = balance > 0.75 && overallRatio > 0.5;
  const isExtreme    = balance < 0.4 && maxRatio > 0.6;

  const centerAura = additiveCenterColor(
    data.map(d => d.intensity),
    data.map(d => TECH_THEME[d.id].rgb),
  );

  // ★ 修正：最低保証値+0.15で、ポイントが低くても色がしっかり見える
  // ただしtotalPoints=0の時は完全消灯のため0のまま
  const baseIntensity   = totalPoints > 0 ? 0.15 : 0;
  const centerIntensity = Math.min(1, centerAura.maxI + centerAura.whiteMix * 0.4 + baseIntensity);
  const isMaxBalance    = centerAura.whiteMix > 0.6;

  const viewW = SIZE + PAD_SIDE * 2;
  const viewH = SIZE + PAD_TOP + 32;

  const svgViewBoxToPercent = (svgX: number, svgY: number) => {
    const xPercent = ((svgX + PAD_SIDE) / viewW) * 100;
    const yPercent = ((svgY + PAD_TOP) / viewH) * 100;
    return { left: `${xPercent}%`, top: `${yPercent}%` };
  };

  function getPopupContent(key: PopupKey) {
    if (key === 'TOTAL') {
      return {
        emoji:    '⚔️',
        name:     '総合',
        points:   totalPoints,
        color:    isMaxBalance ? '#FFFFFF' : centerAura.fill,
        glow:     centerAura.glow,
        isCenter: true,
      };
    }
    const tech = data.find(d => d.id === key)!;
    const theme = TECH_THEME[key];
    return {
      emoji:    theme.emoji,
      name:     theme.name,
      points:   tech.points,
      color:    theme.color,
      glow:     theme.glow,
      isCenter: false,
    };
  }

  function getPopupPosition(key: PopupKey) {
    if (key === 'TOTAL') {
      // 中心⚔️用：少し上方に位置調整（CENTERの上）
      return svgViewBoxToPercent(CENTER, CENTER - 6);
    }
    const idx = (['T001', 'T002', 'T003'] as TechniqueId[]).indexOf(key);
    const p = iconPositions[idx];
    return svgViewBoxToPercent(p.x, p.y);
  }

  // -----------------------------------------------------------------
  // レンダリング
  // -----------------------------------------------------------------
  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <span style={styles.headerIcon}>⚔️</span>
        <h3 style={styles.title}>技の修得</h3>
        <span style={styles.subTitle}>面・小手・胴 の修行バランス</span>
      </header>

      <div style={styles.badgeRow}>
        {isHotZone && (
          <span style={{ ...styles.badge, ...styles.badgeHot }}>
            🔥 全方位の達人！
          </span>
        )}
        {isExtreme && (
          <span style={{ ...styles.badge, ...styles.badgeExtreme }}>
            ⚡ 一点突破！
          </span>
        )}
        {totalPoints === 0 && (
          <span style={{ ...styles.badge, ...styles.badgeStart }}>
            🌱 これから修行スタート！
          </span>
        )}
      </div>

      <div ref={wrapRef} style={styles.svgWrap}>
        <svg
          width="100%"
          viewBox={`${-PAD_SIDE} ${-PAD_TOP} ${viewW} ${viewH}`}
          style={{ display: 'block', maxWidth: SIZE + PAD_SIDE * 2 }}
        >
          <defs>
            {/* 各技の多重発光フィルタ */}
            {data.map((tech, i) => {
              const blur1 = 1.5 + tech.intensity * 4;
              const blur2 = 4   + tech.intensity * 12;
              const blur3 = 8   + tech.intensity * 24;
              return (
                <filter
                  key={`glow-${tech.id}`}
                  id={`burning_icon_glow_${i}`}
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation={blur3} result="blurFar" />
                  <feGaussianBlur stdDeviation={blur2} result="blurMid" />
                  <feGaussianBlur stdDeviation={blur1} result="blurNear" />
                  <feMerge>
                    <feMergeNode in="blurFar" />
                    <feMergeNode in="blurFar" />
                    <feMergeNode in="blurMid" />
                    <feMergeNode in="blurNear" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              );
            })}

            {/* 中心⚔️用：超強力な多層オーラ（さらにブースト） */}
            <filter id="burning_center_glow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation={4 + centerIntensity * 10}  result="cBlur1" />
              <feGaussianBlur stdDeviation={10 + centerIntensity * 22} result="cBlur2" />
              <feGaussianBlur stdDeviation={18 + centerIntensity * 38} result="cBlur3" />
              <feMerge>
                <feMergeNode in="cBlur3" />
                <feMergeNode in="cBlur3" />
                <feMergeNode in="cBlur2" />
                <feMergeNode in="cBlur2" />
                <feMergeNode in="cBlur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <radialGradient id="burning_skill_fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={centerAura.fill}    stopOpacity={0.55} />
              <stop offset="60%"  stopColor={THEME.primary}      stopOpacity={0.35} />
              <stop offset="100%" stopColor={THEME.primaryDark}  stopOpacity={0.25} />
            </radialGradient>
          </defs>

          {/* グリッド */}
          {gridLevels.map((lv, i) => {
            const pts = ANGLES.map(a => polarToXY(a, MAX_R * lv));
            const path = pts.map(p => `${p.x},${p.y}`).join(' ');
            return (
              <polygon
                key={i}
                points={path}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={i === gridLevels.length - 1 ? 1.5 : 1}
                strokeDasharray={i === gridLevels.length - 1 ? '0' : '3 3'}
              />
            );
          })}

          {/* 軸線 */}
          {outerPoints.map((p, i) => (
            <line
              key={i}
              x1={CENTER} y1={CENTER}
              x2={p.x}    y2={p.y}
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {/* データ三角形 */}
          {totalPoints > 0 && (
            <polygon
              points={dataPath}
              fill="url(#burning_skill_fill)"
              stroke={centerAura.fill}
              strokeWidth={2.5}
              strokeLinejoin="round"
              style={{ transition: 'all 0.6s ease' }}
            />
          )}

          {/* 三角形頂点のドット */}
          {dataPoints.map((p, i) => {
            const tech     = data[i];
            const theme    = TECH_THEME[tech.id];
            const isLit    = tech.points > 0;
            const dotR     = 4 + tech.intensity * 3;
            return (
              <g key={`dot-${i}`}>
                {isLit && (
                  <>
                    <circle
                      cx={p.x} cy={p.y} r={dotR}
                      fill={theme.color}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                    />
                    <circle
                      cx={p.x - 1.5} cy={p.y - 1.5} r={1.6}
                      fill="#FFFFFF"
                      opacity={0.85}
                    />
                  </>
                )}
                {!isLit && (
                  <circle
                    cx={p.x} cy={p.y} r={5}
                    fill="rgba(255,255,255,0.06)"
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}

          {/* ============================================================ */}
          {/*  ★中心の ⚔️（円なし・純粋なネオン発光）★                  */}
          {/*  - 円は完全削除                                              */}
          {/*  - mixBlendMode: 'screen' で漆黒に対し加算合成               */}
          {/*  - fillに加法混色色を直接適用                                */}
          {/*  - drop-shadow 4層で激しい発光                               */}
          {/* ============================================================ */}
          <g>
            {/* 1. 最外殻オーラ（広範囲のふわっとした光・色は加法混色） */}
            {centerIntensity > 0.05 && (
              <circle
                cx={CENTER} cy={CENTER}
                r={48 + centerIntensity * 16}
                fill={centerAura.fill}
                opacity={0.10 + centerAura.whiteMix * 0.22}
                filter="url(#burning_center_glow)"
                style={{ mixBlendMode: 'screen' }}
              />
            )}

            {/* 2. 中距離オーラ（より凝縮された光） */}
            {centerIntensity > 0.05 && (
              <circle
                cx={CENTER} cy={CENTER}
                r={34 + centerIntensity * 10}
                fill={centerAura.fill}
                opacity={0.20 + centerAura.whiteMix * 0.40}
                filter="url(#burning_center_glow)"
                style={{ mixBlendMode: 'screen' }}
              />
            )}

            {/* 3. 近距離コア（さらに凝縮） */}
            {centerIntensity > 0.05 && (
              <circle
                cx={CENTER} cy={CENTER}
                r={20 + centerIntensity * 6}
                fill={centerAura.fill}
                opacity={0.25 + centerAura.whiteMix * 0.55}
                filter="url(#burning_center_glow)"
                style={{ mixBlendMode: 'screen' }}
              />
            )}

            {/* 4. ⚔️アイコン本体
                - fillに加法混色色を直接適用 → 絵文字自体が動的色に
                - mixBlendMode: 'screen' で漆黒に光として加算
                - drop-shadow 4層で純粋な発光体に
            */}
            <text
              x={CENTER}
              y={CENTER + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={36 + centerIntensity * 10}
              fill={centerAura.fill}
              style={{
                filter: centerIntensity > 0.05
                  ? `drop-shadow(0 0 ${3 + centerIntensity * 6}px ${centerAura.fill})
                     drop-shadow(0 0 ${8 + centerIntensity * 14}px ${centerAura.fill})
                     drop-shadow(0 0 ${14 + centerIntensity * 24}px ${centerAura.fill})
                     drop-shadow(0 0 ${20 + centerIntensity * 36}px ${centerAura.glow})`
                  : 'drop-shadow(0 0 2px rgba(255,255,255,0.15))',
                opacity: centerIntensity > 0.05 ? 1 : 0.5,
                transition: 'all 0.6s ease',
                cursor: 'pointer',
                userSelect: 'none',
                transform: activePopup === 'TOTAL' ? `scale(1.18)` : 'scale(1)',
                transformOrigin: `${CENTER}px ${CENTER}px`,
                mixBlendMode: 'screen',
              }}
            >
              ⚔️
            </text>

            {/* 5. 透明hitbox（タップ判定 - 中心⚔️用） */}
            <circle
              cx={CENTER} cy={CENTER}
              r={36}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setActivePopup(prev => prev === 'TOTAL' ? null : 'TOTAL');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setActivePopup(prev => prev === 'TOTAL' ? null : 'TOTAL');
              }}
              aria-label={`総合：${totalPoints}ポイント`}
            />
          </g>

          {/* ============================================================ */}
          {/*  頂点の発光アイコン（炎・雷・水）                              */}
          {/* ============================================================ */}
          {iconPositions.map((p, i) => {
            const tech  = data[i];
            const theme = TECH_THEME[tech.id];
            const isLit = tech.points > 0;
            const isActive = activePopup === tech.id;
            const fontSize = 32 + tech.intensity * 6;

            return (
              <g key={`icon-${i}`}>
                {isLit && tech.intensity > 0.1 && (
                  <circle
                    cx={p.x} cy={p.y}
                    r={20 + tech.intensity * 18}
                    fill={theme.color}
                    opacity={0.08 + tech.intensity * 0.18}
                    filter={`url(#burning_icon_glow_${i})`}
                  />
                )}

                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  style={{
                    filter: isLit
                      ? `drop-shadow(0 0 ${4 + tech.intensity * 8}px ${theme.color})
                         drop-shadow(0 0 ${8 + tech.intensity * 16}px ${theme.glow})
                         drop-shadow(0 0 ${12 + tech.intensity * 24}px ${theme.color})`
                      : 'drop-shadow(0 0 2px rgba(255,255,255,0.1)) grayscale(80%)',
                    opacity: isLit ? 1 : 0.4,
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transform: isActive ? `scale(1.15)` : 'scale(1)',
                    transformOrigin: `${p.x}px ${p.y}px`,
                  }}
                >
                  {theme.emoji}
                </text>

                <circle
                  cx={p.x} cy={p.y}
                  r={28}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePopup(prev => prev === tech.id ? null : tech.id);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setActivePopup(prev => prev === tech.id ? null : tech.id);
                  }}
                  aria-label={`${theme.name}：${tech.points}ポイント`}
                />
              </g>
            );
          })}
        </svg>

        {/* ポップアップ */}
        {activePopup && (() => {
          const content = getPopupContent(activePopup);
          const pos     = getPopupPosition(activePopup);

          return (
            <div
              style={{
                ...styles.popup,
                left: pos.left,
                top:  pos.top,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActivePopup(null);
              }}
              role="tooltip"
            >
              <div style={{
                ...styles.popupBubble,
                borderColor: '#FFFFFF',
                boxShadow:   `0 0 12px ${content.color}AA, 0 4px 16px rgba(0,0,0,0.8)`,
                ...(content.isCenter ? styles.popupBubbleCenter : {}),
              }}>
                <span style={{
                  ...styles.popupName,
                  color: '#FFFFFF',
                  textShadow: content.isCenter
                    ? `0 0 6px ${content.color}`
                    : 'none',
                }}>
                  {content.emoji} {content.name}
                </span>
                <span style={{
                  ...styles.popupValue,
                  color: content.isCenter ? content.color : content.glow,
                  textShadow: `0 0 6px ${content.color}`,
                }}>
                  {content.points}
                </span>
                <span style={styles.popupUnit}>pt</span>
              </div>

              <div style={{
                ...styles.popupArrow,
                borderTopColor: '#FFFFFF',
              }} />
            </div>
          );
        })()}
      </div>

      {/* 凡例 */}
      <div style={styles.legend}>
        {data.map(d => {
          const theme = TECH_THEME[d.id];
          return (
            <div key={d.id} style={styles.legendItem}>
              <div style={{
                ...styles.legendDot,
                background: theme.color,
                boxShadow:  `0 0 ${4 + d.intensity * 12}px ${theme.glow}`,
              }} />
              <span style={styles.legendLabel}>
                {theme.emoji} {theme.name}
              </span>
              <span style={{ ...styles.legendValue, color: theme.color }}>
                {d.points}<span style={styles.legendUnit}>pt</span>
              </span>
              <div style={styles.legendBarOuter}>
                <div style={{
                  ...styles.legendBarInner,
                  width:      `${d.ratio * 100}%`,
                  background: `linear-gradient(90deg, ${theme.color} 0%, ${theme.glow} 100%)`,
                  boxShadow:  d.intensity > 0 ? `0 0 8px ${theme.glow}` : 'none',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes burning_skill_pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.15); }
        }
        @keyframes burning_popup_in {
          0%   { opacity: 0; transform: translate(-50%, calc(-100% - 4px)) scale(0.7); }
          60%  { opacity: 1; transform: translate(-50%, calc(-100% - 16px)) scale(1.05); }
          100% { opacity: 1; transform: translate(-50%, calc(-100% - 12px)) scale(1); }
        }
      `}</style>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#0A0202',
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.borderSolid ?? '#2D0B0B'}`,
    boxShadow:       '0 6px 24px rgba(0,0,0,0.55), inset 0 0 60px rgba(178,34,34,0.08)',
  },
  header: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginBottom: '8px',
    flexWrap:   'wrap',
  },
  headerIcon: {
    fontSize: '20px',
  },
  title: {
    margin:     0,
    fontSize:   '18px',
    fontWeight: 900,
    color:      '#FFFFFF',
    letterSpacing: '0.05em',
    textShadow: '0 0 8px rgba(255,215,0,0.4)',
  },
  subTitle: {
    fontSize: '11px',
    color:    '#999',
  },
  badgeRow: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '6px',
    marginBottom: '4px',
    minHeight:  '24px',
  },
  badge: {
    fontSize:      '11px',
    fontWeight:    700,
    padding:       '3px 10px',
    borderRadius:  '999px',
    letterSpacing: '0.05em',
  },
  badgeHot: {
    color:           '#FFFFFF',
    backgroundColor: '#B22222',
    boxShadow:       '0 0 12px rgba(255,68,68,0.55)',
  },
  badgeExtreme: {
    color:           '#2D0B0B',
    backgroundColor: '#FFD700',
    boxShadow:       '0 0 10px rgba(255,215,0,0.4)',
  },
  badgeStart: {
    color:           '#999',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          '1px solid rgba(255,255,255,0.15)',
  },
  svgWrap: {
    position:        'relative',
    display:         'flex',
    justifyContent:  'center',
    paddingTop:      '8px',
    paddingBottom:   '4px',
    overflow:        'visible',
    backgroundColor: '#050000',
    borderRadius:    '12px',
    border:          '1px solid rgba(255,215,0,0.15)',
    boxShadow:       'inset 0 0 60px rgba(178,34,34,0.08), inset 0 0 30px rgba(0,0,0,0.6)',
  },
  popup: {
    position:       'absolute',
    transform:      'translate(-50%, calc(-100% - 12px))',
    zIndex:         10,
    pointerEvents:  'auto',
    cursor:         'pointer',
    animation:      'burning_popup_in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
  },
  popupBubble: {
    backgroundColor: '#2D0B0B',
    border:          '2px solid #FFFFFF',
    borderRadius:    '10px',
    padding:         '8px 14px',
    display:         'flex',
    alignItems:      'baseline',
    gap:             '6px',
    whiteSpace:      'nowrap',
    fontWeight:      900,
    minWidth:        '90px',
    justifyContent:  'center',
  },
  popupBubbleCenter: {
    minWidth: '110px',
  },
  popupName: {
    color:    '#FFFFFF',
    fontSize: '13px',
    fontWeight: 900,
    letterSpacing: '0.05em',
  },
  popupValue: {
    fontSize: '20px',
    fontWeight: 900,
    lineHeight: 1,
  },
  popupUnit: {
    color:    '#FFFFFF',
    fontSize: '11px',
    fontWeight: 700,
    opacity:  0.9,
  },
  popupArrow: {
    position:        'absolute',
    bottom:          '-8px',
    left:            '50%',
    transform:       'translateX(-50%)',
    width:           0,
    height:          0,
    borderLeft:      '8px solid transparent',
    borderRight:     '8px solid transparent',
    borderTop:       '8px solid #FFFFFF',
    filter:          'drop-shadow(0 2px 2px rgba(0,0,0,0.5))',
  },
  legend: {
    display:    'flex',
    flexDirection: 'column',
    gap:        '8px',
    marginTop:  '8px',
    paddingTop: '12px',
    borderTop:  '1px dashed rgba(255,255,255,0.12)',
  },
  legendItem: {
    display:        'grid',
    gridTemplateColumns: '14px 60px 60px 1fr',
    alignItems:     'center',
    gap:            '8px',
  },
  legendDot: {
    width:        '10px',
    height:       '10px',
    borderRadius: '50%',
    transition:   'box-shadow 0.4s ease',
  },
  legendLabel: {
    fontSize:   '13px',
    fontWeight: 700,
    color:      '#FFFFFF',
  },
  legendValue: {
    fontSize:   '14px',
    fontWeight: 900,
    textAlign:  'right',
    textShadow: '0 0 4px currentColor',
  },
  legendUnit: {
    fontSize:   '10px',
    fontWeight: 700,
    marginLeft: '2px',
  },
  legendBarOuter: {
    position:        'relative',
    height:          '8px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius:    '999px',
    overflow:        'hidden',
    border:          '1px solid rgba(255,255,255,0.1)',
  },
  legendBarInner: {
    height:       '100%',
    borderRadius: '999px',
    transition:   'width 0.6s ease, box-shadow 0.4s ease',
  },
};
