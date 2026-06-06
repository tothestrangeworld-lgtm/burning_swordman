// src/components/StudentListCard.tsx
// =====================================================================
// 燃えろ剣士 - 門下生カード（熱血ダークテーマ版）
// 先生ダッシュボードでの一覧表示用。タップで詳細画面へ遷移
// =====================================================================

'use client';

import Link from 'next/link';
import {
  THEME,
  StudentSummary,
  TitleMasterEntry,
  titleForLevel,
  levelColor,
} from '@/types';

interface Props {
  student:     StudentSummary;
  titleMaster: TitleMasterEntry[];
}

// 最終稽古日からの経過日数
function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const last = new Date(dateStr);
  const now  = new Date();
  if (isNaN(last.getTime())) return null;
  return Math.floor((now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
}

// 稽古状態判定（ダークテーマ用配色）
function getTrainingStatus(daysAgo: number | null): {
  type: 'fresh' | 'normal' | 'warning' | 'pinch';
  label: string;
  color: string;
  bg:    string;
  emoji: string;
} {
  if (daysAgo === null) {
    return {
      type: 'normal',
      label: '稽古まだ',
      color: 'rgba(255,255,255,0.7)',
      bg:    'rgba(255,255,255,0.06)',
      emoji: '🌱',
    };
  }
  if (daysAgo === 0) {
    return {
      type: 'fresh',
      label: '今日稽古した！',
      color: '#7FFFAA',
      bg:    'rgba(30,124,58,0.25)',
      emoji: '✨',
    };
  }
  if (daysAgo <= 1) {
    return {
      type: 'fresh',
      label: 'きのう稽古',
      color: '#7FFFAA',
      bg:    'rgba(30,124,58,0.20)',
      emoji: '🌟',
    };
  }
  if (daysAgo <= 2) {
    return {
      type: 'normal',
      label: `${daysAgo}日まえ`,
      color: 'rgba(255,255,255,0.7)',
      bg:    'rgba(255,255,255,0.06)',
      emoji: '📅',
    };
  }
  if (daysAgo <= 6) {
    return {
      type: 'warning',
      label: `${daysAgo}日サボり`,
      color: '#FFD700',
      bg:    'rgba(255,215,0,0.15)',
      emoji: '⚠️',
    };
  }
  return {
    type: 'pinch',
    label: `${daysAgo}日サボり！`,
    color: '#FF6B6B',
    bg:    'rgba(255,68,68,0.25)',
    emoji: '🔥',
  };
}

// 学年表示の整形（number → "○年生"）
function formatGrade(grade: number): string | null {
  if (!grade || grade < 1 || grade > 6) return null;
  return `${grade}年生`;
}

export default function StudentListCard({ student, titleMaster }: Props) {
  const daysAgo = student.daysSinceLastPractice
    ?? daysSince(student.last_practice_date);
  const status   = getTrainingStatus(daysAgo);
  const title    = titleForLevel(student.level, titleMaster);
  const lvColor  = levelColor(student.level);
  const isPinch  = status.type === 'pinch';
  const isFresh  = status.type === 'fresh';
  const gradeLabel = formatGrade(student.grade);

  return (
    <Link
      href={`/teacher/${student.user_id}`}
      style={{
        ...styles.card,
        borderColor: isPinch
          ? '#FF6B6B'
          : isFresh
            ? '#7FFFAA'
            : 'rgba(255,255,255,0.2)',
        boxShadow: isPinch
          ? '0 0 0 2px rgba(255,68,68,0.30), 0 4px 16px rgba(255,68,68,0.30), inset 0 0 16px rgba(255,68,68,0.10)'
          : isFresh
            ? '0 4px 12px rgba(0,0,0,0.4), inset 0 0 12px rgba(127,255,170,0.08)'
            : '0 4px 12px rgba(0,0,0,0.4), inset 0 0 8px rgba(0,0,0,0.3)',
      }}
      aria-label={`${student.name}の評価画面へ`}
    >
      {/* 上段：名前・学年・状態バッジ */}
      <div style={styles.topRow}>
        <div style={styles.nameBlock}>
          <div style={styles.nameRow}>
            <span style={styles.name}>{student.name}</span>
            {gradeLabel && (
              <span style={styles.grade}>{gradeLabel}</span>
            )}
          </div>
          <div style={{
            ...styles.title,
            color: lvColor,
            textShadow: `0 0 6px ${lvColor}88`,
          }}>
            {title}
          </div>
        </div>

        {/* 状態バッジ */}
        <div style={{
          ...styles.statusBadge,
          backgroundColor: status.bg,
          color:           status.color,
          borderColor:     status.color,
          ...(isPinch ? styles.statusPinch : {}),
          ...(isFresh ? styles.statusFresh : {}),
        }}>
          <span style={styles.statusEmoji}>{status.emoji}</span>
          <span>{status.label}</span>
        </div>
      </div>

      {/* 下段：レベル・XP・矢印 */}
      <div style={styles.bottomRow}>
        <div style={styles.levelBlock}>
          <span style={styles.levelLabel}>修行度</span>
          <span style={{
            ...styles.levelNum,
            color: lvColor,
            textShadow: `0 0 8px ${lvColor}AA`,
          }}>
            Lv.{student.level}
          </span>
        </div>

        <div style={styles.xpBlock}>
          <span style={styles.xpNum}>
            {student.total_xp.toLocaleString()}
          </span>
          <span style={styles.xpUnit}>XP</span>
        </div>

        <div style={styles.arrow} aria-hidden="true">
          ▶
        </div>
      </div>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display:         'block',
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    border:          '2px solid',
    padding:         '14px 16px',
    textDecoration:  'none',
    transition:      'transform 0.15s ease, box-shadow 0.15s ease',
    cursor:          'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  topRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    gap:            '8px',
    marginBottom:   '10px',
  },
  nameBlock: {
    flex:     1,
    minWidth: 0,
  },
  nameRow: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        '6px',
    flexWrap:   'wrap',
  },
  name: {
    fontSize:      '18px',
    fontWeight:    900,
    color:         '#FFFFFF',
    letterSpacing: '0.02em',
    textShadow:    '0 1px 2px rgba(0,0,0,0.5)',
  },
  grade: {
    fontSize:        '11px',
    fontWeight:      700,
    color:           'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding:         '2px 8px',
    borderRadius:    '999px',
    border:          '1px solid rgba(255,255,255,0.2)',
  },
  title: {
    fontSize:      '12px',
    fontWeight:    900,
    marginTop:     '3px',
    letterSpacing: '0.05em',
  },
  statusBadge: {
    display:        'flex',
    alignItems:     'center',
    gap:            '4px',
    padding:        '4px 10px',
    borderRadius:   '999px',
    border:         '1.5px solid',
    fontSize:       '11px',
    fontWeight:     900,
    flexShrink:     0,
    letterSpacing:  '0.05em',
  },
  statusPinch: {
    boxShadow:  '0 0 12px rgba(255,68,68,0.55)',
    textShadow: '0 0 6px rgba(255,68,68,0.6)',
  },
  statusFresh: {
    boxShadow:  '0 0 8px rgba(127,255,170,0.40)',
    textShadow: '0 0 4px rgba(127,255,170,0.5)',
  },
  statusEmoji: {
    fontSize: '12px',
  },
  bottomRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    paddingTop: '10px',
    borderTop:  '1px dashed rgba(255,255,255,0.18)',
  },
  levelBlock: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0',
  },
  levelLabel: {
    fontSize:      '9px',
    fontWeight:    700,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: '0.15em',
  },
  levelNum: {
    fontSize:   '20px',
    fontWeight: 900,
    lineHeight: 1.1,
  },
  xpBlock: {
    flex:           1,
    display:        'flex',
    alignItems:     'baseline',
    justifyContent: 'flex-end',
    gap:            '2px',
  },
  xpNum: {
    fontSize:   '17px',
    fontWeight: 900,
    color:      '#FFD700',
    textShadow: '0 0 6px rgba(255,215,0,0.5)',
  },
  xpUnit: {
    fontSize:   '10px',
    fontWeight: 700,
    color:      'rgba(255,255,255,0.7)',
  },
  arrow: {
    fontSize:   '14px',
    color:      '#FFD700',
    fontWeight: 900,
    textShadow: '0 0 4px rgba(255,215,0,0.5)',
  },
};
