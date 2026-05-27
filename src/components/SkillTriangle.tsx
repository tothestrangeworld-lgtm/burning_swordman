// src/components/SkillTriangle.tsx
// =====================================================================
// 燃えよ剣士 - 心・技・体（三角形レーダーチャート）
// 「面・小手・胴」の3項目をSVGで描画する和風ヒロイック版
// 百錬自得のSkillGridの「印影発光」「ホットゾーン」「凡例」のエッセンスを継承
// =====================================================================

'use client';

import { useMemo } from 'react';
import type { Technique, TechniqueId } from '@/types';
import { THEME } from '@/types';

interface Props {
  techniques:        Technique[];
  /** 飽和ポイント（これでバーMAXとする） */
  saturationPoints?: number;
}

// 部位ごとのテーマカラー（白背景に映えるよう調整）
const TECH_THEME: Record<TechniqueId, {
  name:    string;
  color:   string;
  glow:    string;
  bgSoft:  string;
  emoji:   string;
}> = {
  T001: { name: '面',   color: '#B22222', glow: '#FF6347', bgSoft: '#FFE8E8', emoji: '🔥' },
  T002: { name: '小手', color: '#D4A017', glow: '#FFD700', bgSoft: '#FFF8DC', emoji: '⚡' },
  T003: { name: '胴',   color: '#1E5C8A', glow: '#4FA8E0', bgSoft: '#E6F0FA', emoji: '💧' },
};

export default function SkillTriangle({
  techniques,
  saturationPoints = 500,
}: Props) {
  // 3技ぶんのデータ整形
  const data = useMemo(() => {
    const findTech = (id: TechniqueId) => techniques.find(t => t.id === id);
    return (['T001', 'T002', 'T003'] as TechniqueId[]).map(id => {
      const t = findTech(id);
      const points = t?.points ?? 0;
      const ratio  = Math.min(points / saturationPoints, 1);
      return {
        id,
        techName: TECH_THEME[id].name,
        points,
        ratio,
      };
    });
  }, [techniques, saturationPoints]);

  // SVG描画パラメータ
  const SIZE     = 320;
  const CENTER   = SIZE / 2;
  const MAX_R    = SIZE * 0.36;

  // 上(0°)→右下(120°)→左下(240°)に正三角形配置
  // 上=面 / 右下=小手 / 左下=胴
  const ANGLES = [-90, 30, 150]; // degrees: 上、右下、左下

  function polarToXY(angle: number, r: number) {
    const rad = (angle * Math.PI) / 180;
    return {
      x: CENTER + Math.cos(rad) * r,
      y: CENTER + Math.sin(rad) * r,
    };
  }

  // 外周（最大）三角形
  const outerPoints = ANGLES.map(a => polarToXY(a, MAX_R));
  const outerPath   = outerPoints.map(p => `${p.x},${p.y}`).join(' ');

  // データ三角形（実際のratio）
  const dataPoints = ANGLES.map((a, i) => polarToXY(a, MAX_R * data[i].ratio));
  const dataPath   = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // 同心三角（4段階のグリッド）
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  // 合計ポイント
  const totalPoints = data.reduce((s, d) => s + d.points, 0);
  const overallRatio = data.reduce((s, d) => s + d.ratio, 0) / 3;

  // バランス判定（3技のratioが揃っているか）
  const ratios     = data.map(d => d.ratio);
  const maxRatio   = Math.max(...ratios);
  const minRatio   = Math.min(...ratios);
  const balance    = maxRatio === 0 ? 1 : minRatio / maxRatio;
  const isHotZone  = balance > 0.75 && overallRatio > 0.5; // 全技高水準
  const isExtreme  = balance < 0.4 && maxRatio > 0.6;       // 一点突破型

  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <span style={styles.headerIcon}>⚔️</span>
        <h3 style={styles.title}>心・技・体</h3>
        <span style={styles.subTitle}>面・小手・胴 の修行バランス</span>
      </header>

      {/* バッジ：HotZone / Extreme */}
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

      {/* SVG三角形レーダー */}
      <div style={styles.svgWrap}>
        <svg
          width="100%"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{ display: 'block', maxWidth: SIZE }}
        >
          <defs>
            {/* データ三角形の塗り：臙脂→ゴールドのグラデーション */}
            <radialGradient id="burning_skill_fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={THEME.accent}  stopOpacity={0.5} />
              <stop offset="60%"  stopColor={THEME.primary} stopOpacity={0.45} />
              <stop offset="100%" stopColor={THEME.primaryDark} stopOpacity={0.35} />
            </radialGradient>

            {/* 光彩フィルター */}
            <filter id="burning_skill_glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* グリッド：同心三角形 */}
          {gridLevels.map((lv, i) => {
            const pts = ANGLES.map(a => polarToXY(a, MAX_R * lv));
            const path = pts.map(p => `${p.x},${p.y}`).join(' ');
            return (
              <polygon
                key={i}
                points={path}
                fill="none"
                stroke={THEME.border}
                strokeWidth={i === gridLevels.length - 1 ? 1.5 : 1}
                strokeDasharray={i === gridLevels.length - 1 ? '0' : '3 3'}
              />
            );
          })}

          {/* 軸線（中心→各頂点） */}
          {outerPoints.map((p, i) => (
            <line
              key={i}
              x1={CENTER} y1={CENTER}
              x2={p.x}    y2={p.y}
              stroke={THEME.border}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ))}

          {/* データ三角形（塗り） */}
          {totalPoints > 0 && (
            <polygon
              points={dataPath}
              fill="url(#burning_skill_fill)"
              stroke={THEME.primary}
              strokeWidth={2.5}
              strokeLinejoin="round"
              filter="url(#burning_skill_glow)"
              style={{ transition: 'all 0.6s ease' }}
            />
          )}

          {/* データポイント（各頂点の発光ドット） */}
          {dataPoints.map((p, i) => {
            const tech    = data[i];
            const theme   = TECH_THEME[tech.id];
            const isLit   = tech.ratio > 0;
            return (
              <g key={i}>
                {isLit && (
                  <>
                    {/* 外周のグロー */}
                    <circle
                      cx={p.x} cy={p.y} r={10}
                      fill={theme.glow}
                      opacity={0.3}
                      filter="url(#burning_skill_glow)"
                    />
                    {/* メインドット */}
                    <circle
                      cx={p.x} cy={p.y} r={6}
                      fill={theme.color}
                      stroke="#FFFFFF"
                      strokeWidth={2}
                    />
                    {/* ハイライト */}
                    <circle
                      cx={p.x - 1.5} cy={p.y - 1.5} r={1.8}
                      fill="#FFFFFF"
                      opacity={0.8}
                    />
                  </>
                )}
                {!isLit && (
                  <circle
                    cx={p.x} cy={p.y} r={5}
                    fill="#FFFFFF"
                    stroke={THEME.border}
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}

          {/* 各頂点ラベル */}
          {outerPoints.map((p, i) => {
            const tech  = data[i];
            const theme = TECH_THEME[tech.id];
            // 頂点から少し外側にラベル
            const offset = 30;
            const angle = ANGLES[i];
            const labelPos = polarToXY(angle, MAX_R + offset);
            return (
              <g key={i}>
                {/* バッジ風背景 */}
                <rect
                  x={labelPos.x - 32}
                  y={labelPos.y - 18}
                  width={64}
                  height={36}
                  rx={8}
                  fill="#FFFFFF"
                  stroke={theme.color}
                  strokeWidth={2}
                  filter="drop-shadow(0 2px 3px rgba(0,0,0,0.15))"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y - 2}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={900}
                  fill={theme.color}
                >
                  {theme.emoji} {theme.name}
                </text>
                <text
                  x={labelPos.x}
                  y={labelPos.y + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={THEME.textMuted}
                >
                  {tech.points}pt
                </text>
              </g>
            );
          })}

          {/* 中央：合計バッジ */}
          <g>
            <circle
              cx={CENTER} cy={CENTER} r={26}
              fill="#FFFFFF"
              stroke={THEME.primaryDark}
              strokeWidth={2}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
            />
            <text
              x={CENTER} y={CENTER - 4}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill={THEME.textMuted}
              letterSpacing="0.1em"
            >
              累計
            </text>
            <text
              x={CENTER} y={CENTER + 11}
              textAnchor="middle"
              fontSize={14}
              fontWeight={900}
              fill={THEME.primary}
            >
              {totalPoints}
            </text>
          </g>
        </svg>
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
                boxShadow:  `0 0 6px ${theme.glow}`,
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
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       `0 4px 16px rgba(178, 34, 34, 0.10)`,
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
    color:      THEME.primaryDark,
  },
  subTitle: {
    fontSize: '11px',
    color:    THEME.textMuted,
  },
  badgeRow: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '6px',
    marginBottom: '12px',
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
    backgroundColor: THEME.primary,
    boxShadow:       '0 0 8px rgba(178,34,34,0.4)',
  },
  badgeExtreme: {
    color:           THEME.primaryDark,
    backgroundColor: THEME.accent,
  },
  badgeStart: {
    color:           '#1E7C3A',
    backgroundColor: '#E5F4E5',
    border:          '1px solid #C0E0C0',
  },
  svgWrap: {
    display:        'flex',
    justifyContent: 'center',
    margin:         '8px 0',
  },
  legend: {
    display:    'flex',
    flexDirection: 'column',
    gap:        '8px',
    marginTop:  '8px',
    paddingTop: '12px',
    borderTop:  `1px dashed ${THEME.border}`,
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
  },
  legendLabel: {
    fontSize:   '13px',
    fontWeight: 700,
    color:      THEME.text,
  },
  legendValue: {
    fontSize:   '14px',
    fontWeight: 900,
    textAlign:  'right',
  },
  legendUnit: {
    fontSize:   '10px',
    fontWeight: 700,
    marginLeft: '2px',
  },
  legendBarOuter: {
    position:        'relative',
    height:          '8px',
    backgroundColor: '#F5E6E6',
    borderRadius:    '999px',
    overflow:        'hidden',
  },
  legendBarInner: {
    height:       '100%',
    borderRadius: '999px',
    transition:   'width 0.6s ease',
  },
};
