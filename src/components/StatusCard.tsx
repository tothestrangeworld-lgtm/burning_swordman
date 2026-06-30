// src/components/StatusCard.tsx
// =====================================================================
// 燃えろ剣士 - ステータスカード
// レベル・称号・XPバー・経験値グラフを内包
// =====================================================================

'use client';

import {
  UserStatus,
  TitleMasterEntry,
  XpHistoryEntry,
  xpForLevel,
  calcProgressPercent,
  titleForLevel,
  levelColor,
  THEME,
  MAX_LEVEL,
} from '@/types';

import XpTimelineChart from '@/components/XpTimelineChart';

interface Props {
  userName:    string;
  status:      UserStatus;
  titleMaster: TitleMasterEntry[];
  xpHistory?:  XpHistoryEntry[];
}

export default function StatusCard({ userName, status, titleMaster, xpHistory = [] }: Props) {
  const level        = status.level;
  const xp           = status.total_xp;
  const currentTitle = titleForLevel(level, titleMaster);
  const progress     = calcProgressPercent(xp);
  const xpToNext     = level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - xp;
  const lvColor      = levelColor(level);

  return (
    <section style={styles.card}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.miniLabel}>🔥 修行中の剣士</div>

      <div style={styles.nameRow}>
        <h2 style={styles.userName}>{userName}</h2>
        <span style={styles.dan}>殿</span>
      </div>

      <div style={{ ...styles.titleBanner, borderColor: lvColor }}>
        <span style={styles.titleLabel}>称号</span>
        <span style={{ ...styles.titleText, color: lvColor }}>
          {currentTitle}
        </span>
      </div>

      <div style={styles.levelArea}>
        <div style={styles.levelLabel}>Lv.</div>
        <div style={styles.levelValueRow}>
          <span style={{ ...styles.levelNumber, color: lvColor }}>{level}</span>
          <span style={styles.levelMax}>/ {MAX_LEVEL}</span>
        </div>
      </div>

      <div style={styles.xpBarArea}>
        <div style={styles.xpBarLabels}>
          <span style={styles.xpLabel}>つぎのレベルまで</span>
          <span style={styles.xpValue}>
            あと <strong style={{ color: THEME.accent }}>{xpToNext}</strong> XP
          </span>
        </div>
        <div style={styles.xpBarOuter}>
          <div
            style={{
              ...styles.xpBarInner,
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${lvColor} 0%, ${THEME.primary} 100%)`,
            }}
          >
            <div style={styles.xpBarShine} />
          </div>
        </div>
        <div style={styles.xpBarFoot}>
          {progress}% 達成 — レベルアップへの道を歩み続けろ！
        </div>
      </div>

      {status.catchphrase && (
        <div style={styles.catchphraseBox}>
          <span style={styles.catchIcon}>💬</span>
          <span style={styles.catchText}>「{status.catchphrase}」</span>
        </div>
      )}

      <div style={styles.totalXpRow}>
        <span style={styles.totalXpLabel}>累計修行値</span>
        <span style={styles.totalXpValue}>
          {xp.toLocaleString()} <span style={styles.totalXpUnit}>XP</span>
        </span>
      </div>

      <div style={styles.chartSection}>
        <div style={styles.chartHeader}>
          <span style={styles.chartIcon}>🔥</span>
          <h4 style={styles.chartTitle}>経験値のうつりかわり</h4>
        </div>
        <XpTimelineChart xpHistory={xpHistory} compact embedded dark />
        <div style={styles.chartLegend}>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: THEME.primary }} /> 稽古
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: THEME.accent }} /> 先生評価
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: '#1E7C3A' }} /> ミニゲーム
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: '#999' }} /> サボリ減衰
          </span>
        </div>
      </div>

      <style>{`
        @keyframes burning_xp_shine {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position:        'relative',
    backgroundColor: THEME.bgCard,
    borderRadius:    '16px',
    padding:         '24px 20px',
    border:          `2px solid ${THEME.borderSolid}`,
    boxShadow:       '0 6px 24px rgba(0,0,0,0.45)',
    overflow:        'hidden',
  },
  bgPattern: {
    position: 'absolute',
    inset:    0,
    background: `
      radial-gradient(circle at 90% 10%, rgba(255,215,0,0.12) 0%, transparent 35%),
      radial-gradient(circle at 10% 90%, rgba(255,68,68,0.15) 0%, transparent 35%)
    `,
    pointerEvents: 'none',
  },
  miniLabel: {
    position:        'relative',
    display:         'inline-block',
    fontSize:        '11px',
    fontWeight:      700,
    color:           THEME.primaryDark,
    backgroundColor: THEME.accent,
    padding:         '3px 10px',
    borderRadius:    '999px',
    letterSpacing:   '0.05em',
  },
  nameRow: {
    position:   'relative',
    display:    'flex',
    alignItems: 'baseline',
    gap:        '6px',
    marginTop:  '12px',
  },
  userName: {
    margin:        0,
    fontSize:      '28px',
    fontWeight:    900,
    color:         THEME.text,
    letterSpacing: '0.02em',
    textShadow:    '0 2px 8px rgba(0,0,0,0.35)',
  },
  dan: {
    fontSize:   '18px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  titleBanner: {
    position:        'relative',
    marginTop:       '16px',
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
    padding:         '10px 14px',
    backgroundColor: THEME.bgCardDeep,
    border:          `2px solid ${THEME.border}`,
    borderRadius:    '8px',
  },
  titleLabel: {
    fontSize:        '11px',
    fontWeight:      700,
    color:           THEME.primaryDark,
    backgroundColor: THEME.accent,
    padding:         '2px 8px',
    borderRadius:    '4px',
  },
  titleText: {
    fontSize:      '20px',
    fontWeight:    900,
    letterSpacing: '0.05em',
  },
  levelArea: {
    position:  'relative',
    marginTop: '20px',
    textAlign: 'center',
  },
  levelLabel: {
    fontSize:      '13px',
    fontWeight:    700,
    color:         THEME.textMuted,
    letterSpacing: '0.15em',
  },
  levelValueRow: {
    display:        'flex',
    alignItems:     'baseline',
    justifyContent: 'center',
    gap:            '4px',
    marginTop:      '4px',
  },
  levelNumber: {
    fontSize:      '64px',
    fontWeight:    900,
    lineHeight:    1,
    letterSpacing: '-0.02em',
    textShadow:    '0 0 24px rgba(255,215,0,0.35)',
  },
  levelMax: {
    fontSize:   '18px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  xpBarArea: {
    position:  'relative',
    marginTop: '16px',
  },
  xpBarLabels: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   '6px',
  },
  xpLabel: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
  },
  xpValue: {
    fontSize:   '14px',
    fontWeight: 700,
    color:      THEME.text,
  },
  xpBarOuter: {
    position:        'relative',
    width:           '100%',
    height:          '18px',
    backgroundColor: THEME.bgCardDeep,
    borderRadius:    '999px',
    border:          `2px solid ${THEME.borderSolid}`,
    overflow:        'hidden',
    boxShadow:       'inset 0 2px 6px rgba(0,0,0,0.45)',
  },
  xpBarInner: {
    position:     'relative',
    height:       '100%',
    borderRadius: '999px',
    transition:   'width 0.6s ease',
    overflow:     'hidden',
  },
  xpBarShine: {
    position:   'absolute',
    top:        0,
    left:       0,
    width:      '40%',
    height:     '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
    animation:  'burning_xp_shine 2.4s ease-in-out infinite',
  },
  xpBarFoot: {
    marginTop:  '6px',
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.textMuted,
    fontStyle:  'italic',
  },
  catchphraseBox: {
    position:        'relative',
    marginTop:       '16px',
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '10px 14px',
    backgroundColor: THEME.bgCardDeep,
    border:          `1px dashed ${THEME.accent}`,
    borderRadius:    '8px',
  },
  catchIcon: {
    fontSize: '16px',
  },
  catchText: {
    fontSize:   '14px',
    fontWeight: 700,
    color:      THEME.text,
    fontStyle:  'italic',
  },
  totalXpRow: {
    position:       'relative',
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginTop:      '16px',
    paddingTop:     '12px',
    borderTop:      `1px dashed ${THEME.border}`,
  },
  totalXpLabel: {
    fontSize:      '12px',
    fontWeight:    700,
    color:         THEME.textMuted,
    letterSpacing: '0.1em',
  },
  totalXpValue: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      THEME.accent,
    textShadow: '0 0 12px rgba(255,215,0,0.35)',
  },
  totalXpUnit: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
    marginLeft: '2px',
  },
  chartSection: {
    position:   'relative',
    marginTop:  '16px',
    paddingTop: '14px',
    borderTop:  `1px dashed ${THEME.border}`,
  },
  chartHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          '6px',
    marginBottom: '4px',
  },
  chartIcon: {
    fontSize: '16px',
  },
  chartTitle: {
    margin:        0,
    fontSize:      '14px',
    fontWeight:    900,
    color:         THEME.text,
    letterSpacing: '0.04em',
  },
  chartLegend: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '10px',
    marginTop:  '6px',
    fontSize:   '10px',
    color:      THEME.textSubtle,
  },
  legendItem: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        '4px',
  },
  legendDot: {
    width:        '7px',
    height:       '7px',
    borderRadius: '50%',
  },
};
