// src/components/ResultModal.tsx
// =====================================================================
// 燃えろ剣士 - 記録完了モーダル
// レベルアップ時はカットインで「うおおぉ！」の達成感を演出
// =====================================================================

'use client';

import { useEffect, useState } from 'react';
import { THEME, levelColor, titleForLevel, TitleMasterEntry } from '@/types';
import type { SaveLogResponse } from '@/types';

interface Props {
  open:           boolean;
  result:         SaveLogResponse | null;
  prevLevel:      number;
  titleMaster:    TitleMasterEntry[];
  onClose:        () => void;
}

export default function ResultModal({
  open, result, prevLevel, titleMaster, onClose,
}: Props) {
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    if (open && result && result.level > prevLevel) {
      // 少し遅らせてレベルアップ演出
      const t = setTimeout(() => setShowLevelUp(true), 700);
      return () => clearTimeout(t);
    }
    setShowLevelUp(false);
  }, [open, result, prevLevel]);

  if (!open || !result) return null;

  const isLevelUp = result.level > prevLevel;
  const newTitle  = titleForLevel(result.level, titleMaster);
  const lvColor   = levelColor(result.level);
  const xpEarned  = result.xp_earned;

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true">
      <style>{`
        @keyframes burning_modal_in {
          from { transform: scale(0.7) translateY(20px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes burning_levelup_zoom {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes burning_xp_count {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.15); color: #FFD700; }
          100% { transform: scale(1); }
        }
        @keyframes burning_flame_dance {
          0%, 100% { transform: rotate(-5deg) scale(1); }
          50%      { transform: rotate(5deg) scale(1.1); }
        }
        @keyframes burning_aura_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        ...styles.modal,
        borderColor: isLevelUp ? THEME.accent : THEME.primary,
      }}>
        {/* レベルアップ時の背景オーラ */}
        {isLevelUp && (
          <div style={styles.aura} aria-hidden="true" />
        )}

        {/* ヘッダー */}
        <div style={styles.header}>
          {isLevelUp ? (
            <>
              <div style={styles.flameRow} aria-hidden="true">
                <span style={styles.flame}>🔥</span>
                <span style={styles.flame}>🔥</span>
                <span style={styles.flame}>🔥</span>
              </div>
              {showLevelUp && (
                <h2 style={styles.titleLevelUp}>
                  レベルアップ！！
                </h2>
              )}
            </>
          ) : (
            <h2 style={styles.title}>
              <span style={styles.titleIcon}>⚔️</span>
              修行を記録したぞ！
            </h2>
          )}
        </div>

        {/* 獲得XP表示 */}
        <div style={styles.xpBox}>
          <div style={styles.xpLabel}>今日の修行値</div>
          <div style={styles.xpValueRow}>
            <span style={styles.xpPlus}>+</span>
            <span style={styles.xpValue}>{xpEarned}</span>
            <span style={styles.xpUnit}>XP</span>
          </div>
          {(result.xp_from_tasks ?? 0) > 0 && (result.xp_from_techniques ?? 0) > 0 && (
            <div style={styles.xpBreakdown}>
              課題 +{result.xp_from_tasks} ／ 技 +{result.xp_from_techniques}
            </div>
          )}
        </div>

        {/* レベルアップ詳細 */}
        {isLevelUp && showLevelUp && (
          <div style={{ ...styles.levelUpBox, borderColor: lvColor }}>
            <div style={styles.levelUpRow}>
              <div style={styles.levelBefore}>
                <div style={styles.levelLabel}>BEFORE</div>
                <div style={styles.levelNum}>Lv.{prevLevel}</div>
              </div>
              <div style={styles.arrow}>➡️</div>
              <div style={styles.levelAfter}>
                <div style={styles.levelLabel}>AFTER</div>
                <div style={{ ...styles.levelNum, color: lvColor }}>
                  Lv.{result.level}
                </div>
              </div>
            </div>
            <div style={styles.titleAnnounce}>
              <span style={styles.titleAnnounceLabel}>新しい称号</span>
              <span style={{ ...styles.titleAnnounceText, color: lvColor }}>
                {newTitle}
              </span>
            </div>
          </div>
        )}

        {/* 累計XP */}
        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>累計修行値</span>
          <span style={styles.totalValue}>
            {result.total_xp.toLocaleString()} XP
          </span>
        </div>

        {/* 新実績 */}
        {result.newAchievements && result.newAchievements.length > 0 && (
          <div style={styles.achieveBox}>
            <div style={styles.achieveTitle}>🏆 新たな実績解放！</div>
            {result.newAchievements.map(a => (
              <div key={a.id} style={styles.achieveItem}>
                ✨ {a.name}
              </div>
            ))}
          </div>
        )}

        {/* OKボタン */}
        <button
          type="button"
          onClick={onClose}
          style={styles.okBtn}
          onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isLevelUp ? '🔥 つよくなったぞ！' : 'よくやった！'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px',
    zIndex:          1000,
    backdropFilter:  'blur(2px)',
  },
  modal: {
    position:        'relative',
    width:           '100%',
    maxWidth:        '420px',
    backgroundColor: '#FFFFFF',
    borderRadius:    '20px',
    border:          '3px solid',
    padding:         '28px 24px 24px',
    boxShadow:       '0 12px 48px rgba(178,34,34,0.4)',
    animation:       'burning_modal_in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    overflow:        'hidden',
  },
  aura: {
    position: 'absolute',
    top:      '-50%',
    left:     '-50%',
    width:    '200%',
    height:   '200%',
    background: `conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(255,215,0,0.15) 60deg,
      transparent 120deg,
      rgba(178,34,34,0.15) 180deg,
      transparent 240deg,
      rgba(255,215,0,0.15) 300deg,
      transparent 360deg
    )`,
    animation:     'burning_aura_spin 8s linear infinite',
    pointerEvents: 'none',
    zIndex:        0,
  },
  header: {
    position: 'relative',
    textAlign: 'center',
    marginBottom: '20px',
  },
  flameRow: {
    display:        'flex',
    justifyContent: 'center',
    gap:            '8px',
    fontSize:       '28px',
    marginBottom:   '4px',
  },
  flame: {
    display:   'inline-block',
    animation: 'burning_flame_dance 1.4s ease-in-out infinite',
  },
  title: {
    margin:     0,
    fontSize:   '22px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },
  titleIcon: {
    marginRight: '6px',
  },
  titleLevelUp: {
    margin:        0,
    fontSize:      '32px',
    fontWeight:    900,
    color:         THEME.primary,
    letterSpacing: '0.05em',
    animation:     'burning_levelup_zoom 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    textShadow:    '3px 3px 0 rgba(255,215,0,0.4)',
  },

  xpBox: {
    position:        'relative',
    textAlign:       'center',
    padding:         '16px 0',
    backgroundColor: '#FFF8F8',
    borderRadius:    '12px',
    border:          `2px solid ${THEME.primary}`,
    marginBottom:    '12px',
  },
  xpLabel: {
    fontSize:      '12px',
    fontWeight:    700,
    color:         '#777777', // 白背景用に濃いグレーに変更,
    letterSpacing: '0.15em',
    marginBottom:  '4px',
  },
  xpValueRow: {
    display:        'flex',
    justifyContent: 'center',
    alignItems:     'baseline',
    gap:            '4px',
  },
  xpPlus: {
    fontSize:   '24px',
    fontWeight: 900,
    color:      THEME.primary,
  },
  xpValue: {
    fontSize:      '56px',
    fontWeight:    900,
    color:         THEME.primary,
    lineHeight:    1,
    textShadow:    '2px 2px 0 rgba(178,34,34,0.2)',
    animation:     'burning_xp_count 0.6s ease-out',
  },
  xpUnit: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },
  xpBreakdown: {
    fontSize:  '11px',
    color:         '#777777', // 白背景用に濃いグレーに変更
    marginTop: '4px',
  },

  levelUpBox: {
    position:        'relative',
    backgroundColor: '#FFFEF0',
    border:          '2px solid',
    borderRadius:    '12px',
    padding:         '14px',
    marginBottom:    '12px',
  },
  levelUpRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-around',
    marginBottom:   '12px',
  },
  levelBefore: {
    textAlign: 'center',
    opacity:   0.6,
  },
  levelAfter: {
    textAlign: 'center',
  },
  levelLabel: {
    fontSize:      '9px',
    fontWeight:    900,
    color:         '#777777', // 白背景用に濃いグレーに変更,
    letterSpacing: '0.2em',
  },
  levelNum: {
    fontSize:   '24px',
    fontWeight: 900,
    color:      '#777777',
  },
  arrow: {
    fontSize: '20px',
  },
  titleAnnounce: {
    paddingTop: '10px',
    borderTop:  `1px dashed ${THEME.border}`,
    textAlign:  'center',
  },
  titleAnnounceLabel: {
    display:         'inline-block',
    fontSize:        '10px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: THEME.primaryDark,
    padding:         '2px 8px',
    borderRadius:    '4px',
    marginRight:     '8px',
  },
  titleAnnounceText: {
    fontSize:      '18px',
    fontWeight:    900,
    letterSpacing: '0.05em',
  },

  totalRow: {
    position:       'relative',
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    padding:        '8px 4px',
    borderTop:      `1px dashed ${THEME.border}`,
    marginBottom:   '16px',
  },
  totalLabel: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      '#777777', // 白背景用に濃いグレーに変更,
  },
  totalValue: {
    fontSize:   '16px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },

  achieveBox: {
    position:        'relative',
    backgroundColor: '#FFFEF0',
    border:          `1px solid ${THEME.accent}`,
    borderRadius:    '10px',
    padding:         '10px 14px',
    marginBottom:    '14px',
  },
  achieveTitle: {
    fontSize:   '13px',
    fontWeight: 900,
    color:      THEME.primaryDark,
    marginBottom: '4px',
  },
  achieveItem: {
    fontSize:   '13px',
    fontWeight: 700,
    color:      '#B8860B',
    paddingLeft: '4px',
  },

  okBtn: {
    position:     'relative',
    width:        '100%',
    minHeight:    '54px',
    padding:      '14px',
    fontSize:     '17px',
    fontWeight:   900,
    color:        '#FFFFFF',
    background:   `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:       'none',
    borderRadius: '12px',
    cursor:       'pointer',
    boxShadow:    `0 4px 0 ${THEME.primaryDark}, 0 6px 12px rgba(178,34,34,0.3)`,
    letterSpacing:'0.1em',
    transition:   'transform 0.08s ease',
    WebkitTapHighlightColor: 'transparent',
  },
};
