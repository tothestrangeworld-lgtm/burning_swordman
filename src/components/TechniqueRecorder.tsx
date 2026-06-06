// src/components/TechniqueRecorder.tsx
// =====================================================================
// 燃えろ剣士 - 技の量×質 記録コンポーネント（熱血ダークテーマ版）
// 漆黒の中、面（炎）小手（雷）胴（水）が属性カラーで燃え上がる
// =====================================================================

'use client';

import {
  THEME,
  TechniqueId,
  QuantityLevel,
  QualityLevel,
  QUANTITY_LABELS,
  QUALITY_LABELS,
  calcTechniqueXp,
} from '@/types';

interface Props {
  techniqueId:   TechniqueId;
  techniqueName: string;
  quantity:      QuantityLevel | 0;
  quality:       QualityLevel  | 0;
  onChange:      (quantity: QuantityLevel | 0, quality: QualityLevel | 0) => void;
}

// 技ごとのテーマカラー（ダーク背景でも映える明るめのトーン）
const TECH_COLOR: Record<TechniqueId, {
  color:     string;
  bgGlow:    string;
  emoji:     string;
  effect:    string;
}> = {
  T001: { color: '#FF4444', bgGlow: 'rgba(255,68,68,0.15)',  emoji: '🔥', effect: 'メーン！' },
  T002: { color: '#FFD700', bgGlow: 'rgba(255,215,0,0.15)',  emoji: '⚡', effect: 'コテーッ！' },
  T003: { color: '#5599FF', bgGlow: 'rgba(85,153,255,0.18)', emoji: '💧', effect: 'ドーッ！' },
};

const QUANTITY_OPTIONS: Array<{ value: QuantityLevel; label: string; sub: string }> = [
  { value: 1, label: '少ない',  sub: 'ちょっと' },
  { value: 2, label: 'ふつう',  sub: 'いい感じ' },
  { value: 3, label: '多い！',  sub: 'たくさん！' },
];

const QUALITY_OPTIONS: Array<{ value: QualityLevel; label: string; sub: string }> = [
  { value: 1, label: 'まぐれ',     sub: 'たまたま' },
  { value: 2, label: 'ふつう',     sub: 'できた' },
  { value: 3, label: '会心！',     sub: 'バッチリ！' },
];

export default function TechniqueRecorder({
  techniqueId, techniqueName, quantity, quality, onChange,
}: Props) {
  const theme = TECH_COLOR[techniqueId];
  const isFilled = quantity > 0 && quality > 0;
  const xp = isFilled ? calcTechniqueXp(quantity as QuantityLevel, quality as QualityLevel) : 0;

  return (
    <div style={{
      ...styles.card,
      borderColor: isFilled ? theme.color : 'rgba(255,255,255,0.2)',
      backgroundColor: isFilled ? theme.bgGlow : THEME.bgCardDeep ?? '#1A0505',
      boxShadow: isFilled
        ? `0 4px 16px ${theme.color}55, inset 0 0 24px ${theme.color}22`
        : '0 2px 8px rgba(0,0,0,0.4), inset 0 0 12px rgba(0,0,0,0.3)',
    }}>
      {/* ヘッダー */}
      <div style={styles.header}>
        <span style={{
          ...styles.emoji,
          filter: isFilled
            ? `drop-shadow(0 0 8px ${theme.color}) drop-shadow(0 0 16px ${theme.color}66)`
            : 'drop-shadow(0 0 4px rgba(255,255,255,0.2))',
        }}>
          {theme.emoji}
        </span>
        <div>
          <div style={{
            ...styles.techName,
            color: isFilled ? theme.color : '#FFFFFF',
            textShadow: isFilled
              ? `0 0 8px ${theme.color}88, 0 1px 2px rgba(0,0,0,0.6)`
              : '0 1px 2px rgba(0,0,0,0.5)',
          }}>
            {techniqueName}
          </div>
          {isFilled && (
            <div style={{
              ...styles.effectText,
              color: theme.color,
              textShadow: `0 0 6px ${theme.color}88`,
            }}>
              {theme.effect}
            </div>
          )}
        </div>
        {isFilled && (
          <div style={{
            ...styles.xpBadge,
            backgroundColor: theme.color,
            color: techniqueId === 'T002' ? '#2D0B0B' : '#FFFFFF', // 黄色のみ黒文字
            boxShadow: `0 0 12px ${theme.color}AA`,
          }}>
            +{xp} XP
          </div>
        )}
      </div>

      {/* 量セクション */}
      <div style={styles.sectionLabel}>
        <span style={styles.sectionIcon}>📊</span>
        どれくらい打ったかな？
      </div>
      <div style={styles.optionRow}>
        {QUANTITY_OPTIONS.map(opt => {
          const active = quantity === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(active ? 0 : opt.value, quality)}
              style={{
                ...styles.optionBtn,
                backgroundColor: active ? theme.color : 'rgba(255,255,255,0.04)',
                color:           active
                  ? (techniqueId === 'T002' ? '#2D0B0B' : '#FFFFFF')
                  : '#FFFFFF',
                borderColor:     active ? theme.color : 'rgba(255,255,255,0.2)',
                boxShadow:       active
                  ? `0 4px 0 ${theme.color}66, 0 0 16px ${theme.color}88`
                  : 'inset 0 0 8px rgba(0,0,0,0.3)',
                transform:       active ? 'translateY(-2px)' : 'none',
                textShadow:      active && techniqueId !== 'T002'
                  ? '0 1px 2px rgba(0,0,0,0.5)'
                  : 'none',
              }}
            >
              <div style={styles.optionLabel}>{opt.label}</div>
              <div style={{
                ...styles.optionSub,
                opacity: active ? 0.92 : 0.55,
                color:   active
                  ? (techniqueId === 'T002' ? '#2D0B0B' : '#FFFFFF')
                  : 'rgba(255,255,255,0.7)',
              }}>
                {opt.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* 質セクション */}
      <div style={styles.sectionLabel}>
        <span style={styles.sectionIcon}>✨</span>
        どんな打ちだった？
      </div>
      <div style={styles.optionRow}>
        {QUALITY_OPTIONS.map(opt => {
          const active = quality === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(quantity, active ? 0 : opt.value)}
              style={{
                ...styles.optionBtn,
                backgroundColor: active ? theme.color : 'rgba(255,255,255,0.04)',
                color:           active
                  ? (techniqueId === 'T002' ? '#2D0B0B' : '#FFFFFF')
                  : '#FFFFFF',
                borderColor:     active ? theme.color : 'rgba(255,255,255,0.2)',
                boxShadow:       active
                  ? `0 4px 0 ${theme.color}66, 0 0 16px ${theme.color}88`
                  : 'inset 0 0 8px rgba(0,0,0,0.3)',
                transform:       active ? 'translateY(-2px)' : 'none',
                textShadow:      active && techniqueId !== 'T002'
                  ? '0 1px 2px rgba(0,0,0,0.5)'
                  : 'none',
              }}
            >
              <div style={styles.optionLabel}>{opt.label}</div>
              <div style={{
                ...styles.optionSub,
                opacity: active ? 0.92 : 0.55,
                color:   active
                  ? (techniqueId === 'T002' ? '#2D0B0B' : '#FFFFFF')
                  : 'rgba(255,255,255,0.7)',
              }}>
                {opt.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* プレビュー：量×質 = XP の式表示 */}
      {isFilled && (
        <div style={{
          ...styles.previewBox,
          borderColor: theme.color,
          boxShadow:   `inset 0 0 12px ${theme.color}33`,
        }}>
          <span style={styles.previewText}>
            {QUANTITY_LABELS[quantity as QuantityLevel]}
            <span style={styles.previewMul}> × </span>
            {QUALITY_LABELS[quality as QualityLevel]}
            <span style={styles.previewMul}> = </span>
            <strong style={{
              color: theme.color,
              textShadow: `0 0 6px ${theme.color}88`,
            }}>
              +{xp} XP
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding:      '16px 14px',
    borderRadius: '14px',
    border:       '2px solid',
    transition:   'border-color 0.2s, background-color 0.2s, box-shadow 0.3s',
  },
  header: {
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    marginBottom: '14px',
  },
  emoji: {
    fontSize:    '32px',
    transition:  'filter 0.3s ease',
  },
  techName: {
    fontSize:      '22px',
    fontWeight:    900,
    lineHeight:    1.1,
    letterSpacing: '0.05em',
    transition:    'color 0.2s ease',
  },
  effectText: {
    fontSize:   '11px',
    fontWeight: 900,
    fontStyle:  'italic',
    marginTop:  '2px',
    letterSpacing: '0.05em',
  },
  xpBadge: {
    marginLeft:   'auto',
    padding:      '6px 14px',
    borderRadius: '999px',
    fontSize:     '14px',
    fontWeight:   900,
    border:       '2px solid #FFFFFF',
    letterSpacing: '0.05em',
  },
  sectionLabel: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
    fontSize:   '13px',
    fontWeight: 900,
    color:      '#FFD700',
    marginBottom: '8px',
    marginTop:  '10px',
    textShadow: '0 0 4px rgba(255,215,0,0.4)',
    letterSpacing: '0.05em',
  },
  sectionIcon: {
    fontSize: '14px',
  },
  optionRow: {
    display:              'grid',
    gridTemplateColumns:  'repeat(3, 1fr)',
    gap:                  '8px',
    marginBottom:         '4px',
  },
  optionBtn: {
    minHeight:    '64px',
    padding:      '8px 4px',
    border:       '2px solid',
    borderRadius: '10px',
    fontFamily:   'inherit',
    cursor:       'pointer',
    transition:   'all 0.15s ease',
    display:      'flex',
    flexDirection:'column',
    alignItems:   'center',
    justifyContent:'center',
    gap:          '2px',
    WebkitTapHighlightColor: 'transparent',
  },
  optionLabel: {
    fontSize:      '15px',
    fontWeight:    900,
    lineHeight:    1.1,
    letterSpacing: '0.03em',
  },
  optionSub: {
    fontSize:   '10px',
    fontWeight: 700,
  },
  previewBox: {
    marginTop:       '12px',
    padding:         '10px 12px',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '1.5px dashed',
    borderRadius:    '8px',
    textAlign:       'center',
  },
  previewText: {
    fontSize:   '13px',
    fontWeight: 800,
    color:      '#FFFFFF',
    letterSpacing: '0.03em',
  },
  previewMul: {
    color:      'rgba(255,255,255,0.55)',
    fontWeight: 400,
    margin:     '0 4px',
  },
};
