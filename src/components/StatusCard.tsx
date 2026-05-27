// src/components/StatusCard.tsx
// =====================================================================
// 燃えよ剣士 - ステータスカード
// レベル・称号・XPバー・かけ声を表示する中核コンポーネント
// =====================================================================

'use client';

import {
  UserStatus,
  TitleMasterEntry,
  xpForLevel,
  calcProgressPercent,
  titleForLevel,
  nextTitleLevel,
  levelColor,
  THEME,
  MAX_LEVEL,
} from '@/types';

interface Props {
  userName:    string;
  status:      UserStatus;
  titleMaster: TitleMasterEntry[];
}

export default function StatusCard({ userName, status, titleMaster }: Props) {
  const level        = status.level;
  const xp           = status.total_xp;
  const currentTitle = titleForLevel(level, titleMaster);
  const next         = nextTitleLevel(level, titleMaster);
  const progress     = calcProgressPercent(xp);
  const xpToNext     = level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - xp;
  const lvColor      = levelColor(level);

  return (
    <section style={styles.card}>
      {/* 背景パターン（和紙・炎） */}
      <div style={styles.bgPattern} aria-hidden="true" />

      {/* 上部ラベル */}
      <div style={styles.miniLabel}>🔥 修行中の剣士</div>

      {/* 名前 */}
      <div style={styles.nameRow}>
        <h2 style={styles.userName}>{userName}</h2>
        <span style={styles.dan}>殿</span>
      </div>

      {/* 称号バナー */}
      <div style={{ ...styles.titleBanner, borderColor: lvColor }}>
        <span style={styles.titleLabel}>称号</span>
        <span style={{ ...styles.titleText, color: lvColor }}>
          {currentTitle}
        </span>
      </div>

      {/* レベル（特大） */}
      <div style={styles.levelArea}>
        <div style={styles.levelLabel}>修行度</div>
        <div style={styles.levelValueRow}>
          <span style={{ ...styles.levelNumber, color: lvColor }}>{level}</span>
          <span style={styles.levelMax}>/ {MAX_LEVEL}</span>
        </div>
      </div>

      {/* XPバー */}
      <div style={styles.xpBarArea}>
        <div style={styles.xpBarLabels}>
          <span style={styles.xpLabel}>つぎの修行まで</span>
          <span style={styles.xpValue}>
            あと <strong style={{ color: THEME.primary }}>{xpToNext}</strong> XP
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
          {progress}% 達成 ／ つぎの称号:{' '}
          <strong style={{ color: THEME.primaryDark }}>{next?.title ?? '極み'}</strong>
          {next && <span style={styles.nextLv}>（Lv.{next.level}）</span>}
        </div>
      </div>

      {/* かけ声 */}
      {status.catchphrase && (
        <div style={styles.catchphraseBox}>
          <span style={styles.catchIcon}>💬</span>
          <span style={styles.catchText}>「{status.catchphrase}」</span>
        </div>
      )}

      {/* 累計XP */}
      <div style={styles.totalXpRow}>
        <span style={styles.totalXpLabel}>累計修行値</span>
        <span style={styles.totalXpValue}>
          {xp.toLocaleString()} <span style={styles.totalXpUnit}>XP</span>
        </span>
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
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '24px 20px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       `0 4px 16px rgba(178, 34, 34, 0.12)`,
    overflow:        'hidden',
  },
  bgPattern: {
    position: 'absolute',
    inset:    0,
    background: `
      radial-gradient(circle at 90% 10%, rgba(255,215,0,0.08) 0%, transparent 35%),
      radial-gradient(circle at 10% 90%, rgba(178,34,34,0.06) 0%, transparent 35%)
    `,
    pointerEvents: 'none',
  },
  miniLabel: {
    position:        'relative',
    display:         'inline-block',
    fontSize:        '11px',
    fontWeight:      700,
    color:           '#FFFFFF',
    backgroundColor: THEME.primary,
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
    backgroundColor: '#FFF8F8',
    border:          '2px solid',
    borderRadius:    '8px',
  },
  titleLabel: {
    fontSize:        '11px',
    fontWeight:      700,
    color:           '#FFFFFF',
    backgroundColor: THEME.primaryDark,
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
    textShadow:    '2px 2px 0 rgba(178,34,34,0.15)',
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
    backgroundColor: '#F5E6E6',
    borderRadius:    '999px',
    border:          `2px solid ${THEME.primaryDark}`,
    overflow:        'hidden',
    boxShadow:       'inset 0 2px 4px rgba(0,0,0,0.1)',
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
    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
    animation:  'burning_xp_shine 2.4s ease-in-out infinite',
  },
  xpBarFoot: {
    marginTop: '6px',
    fontSize:  '11px',
    color:     THEME.textMuted,
  },
  nextLv: {
    marginLeft: '4px',
    fontWeight: 700,
    color:      THEME.primary,
  },
  catchphraseBox: {
    position:        'relative',
    marginTop:       '16px',
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '10px 14px',
    backgroundColor: '#FFFEF0',
    border:          `1px dashed ${THEME.accent}`,
    borderRadius:    '8px',
  },
  catchIcon: {
    fontSize: '16px',
  },
  catchText: {
    fontSize:   '14px',
    fontWeight: 700,
    color:      THEME.primaryDark,
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
    color:      THEME.primaryDark,
  },
  totalXpUnit: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      THEME.textMuted,
    marginLeft: '2px',
  },
};
