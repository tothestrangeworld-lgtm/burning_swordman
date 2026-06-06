// src/components/TaskRater.tsx
// =====================================================================
// 燃えろ剣士 - 課題の★評価コンポーネント（熱血ダークテーマ版）
// 漆黒の中で星が金色に輝く、特大タップUI
// =====================================================================

'use client';

import { THEME, calcSelfTaskXp } from '@/types';
import { TASK_CRITERIA } from '@/lib/taskCriteria';
import TaskCriteriaPanel from '@/components/TaskCriteriaPanel';

interface Props {
  taskId:   string;
  taskText: string;
  score:    number;
  onChange: (score: number) => void;
  index?:   number;
  criteriaExpanded?: boolean;
  onToggleCriteria?: () => void;
}

const SCORE_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'うーん…',     emoji: '😣', color: '#A0A0A0' },
  2: { label: 'まあまあ',     emoji: '🙂', color: '#FFA07A' },
  3: { label: 'できた！',     emoji: '😊', color: '#FFD700' },
  4: { label: 'バッチリ！',   emoji: '🔥', color: '#FF6347' },
  5: { label: '完璧！！',     emoji: '⚡', color: '#FFFFFF' },
};

export default function TaskRater({
  taskId, taskText, score, onChange, index,
  criteriaExpanded = false, onToggleCriteria,
}: Props) {
  const xp = score > 0 ? calcSelfTaskXp(score) : 0;
  const meta = score > 0 ? SCORE_LABELS[score] : null;
  const hasCriteria = Boolean(TASK_CRITERIA[taskId]);
  const isRated = score > 0;

  return (
    <div style={{
      ...styles.card,
      borderColor:     isRated ? '#FFD700' : 'rgba(255,255,255,0.2)',
      backgroundColor: isRated ? 'rgba(255,215,0,0.08)' : THEME.bgCardDeep ?? '#1A0505',
      boxShadow:       isRated
        ? '0 4px 16px rgba(255,215,0,0.25), inset 0 0 20px rgba(255,215,0,0.10)'
        : '0 2px 8px rgba(0,0,0,0.4), inset 0 0 12px rgba(0,0,0,0.3)',
    }}>
      <div style={styles.header}>
        {index !== undefined && (
          <span style={styles.indexBadge}>{index + 1}</span>
        )}
        <div style={styles.taskLabelBlock}>
          {hasCriteria && onToggleCriteria ? (
            <button
              type="button"
              onClick={onToggleCriteria}
              style={{
                ...styles.taskLabelBtn,
                color: criteriaExpanded ? '#FFD700' : '#FFFFFF',
              }}
              aria-expanded={criteriaExpanded}
              aria-label={`${taskText}の合格基準を${criteriaExpanded ? '閉じる' : '見る'}`}
            >
              <span style={styles.taskText}>{taskText}</span>
              <span style={styles.criteriaHint}>
                {criteriaExpanded
                  ? '▲ 閉じる'
                  : '（タップして合格基準をみる）'}
              </span>
            </button>
          ) : (
            <p style={styles.taskText}>{taskText}</p>
          )}
          {hasCriteria && (
            <TaskCriteriaPanel taskId={taskId} expanded={criteriaExpanded} />
          )}
        </div>
      </div>

      {/* 星ボタン */}
      <div style={styles.starsRow} role="group" aria-label="評価">
        {[1, 2, 3, 4, 5].map(n => {
          const filled = n <= score;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(score === n ? 0 : n)}
              aria-label={`${n}つ星`}
              aria-pressed={filled}
              style={{
                ...styles.starBtn,
                color: filled ? '#FFD700' : 'rgba(255,255,255,0.18)',
                textShadow: filled
                  ? '0 0 8px rgba(255,215,0,0.85), 0 0 16px rgba(255,215,0,0.45)'
                  : 'none',
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.transform = 'scale(0.85)';
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.85)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ★
            </button>
          );
        })}
      </div>

      {/* 評価ラベル & XPプレビュー */}
      <div style={styles.feedbackRow}>
        {meta ? (
          <>
            <span style={{
              ...styles.feedbackLabel,
              color: meta.color,
              textShadow: `0 0 6px ${meta.color}88`,
            }}>
              {meta.emoji} {meta.label}
            </span>
            <span style={styles.xpPreview}>
              +<strong>{xp}</strong> XP
            </span>
          </>
        ) : (
          <span style={styles.tapHint}>↑ 星をタップして評価しよう</span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding:      '14px 16px',
    borderRadius: '12px',
    border:       '2px solid',
    transition:   'border-color 0.2s, background-color 0.2s, box-shadow 0.3s',
  },
  header: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '8px',
    marginBottom: '10px',
  },
  indexBadge: {
    flexShrink:      0,
    width:           '26px',
    height:          '26px',
    borderRadius:    '50%',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    color:           '#FFFFFF',
    fontSize:        '12px',
    fontWeight:      900,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    border:          '2px solid #FFD700',
    boxShadow:       '0 0 8px rgba(255,215,0,0.4)',
  },
  taskLabelBlock: {
    flex:       1,
    minWidth:   0,
  },
  taskLabelBtn: {
    display:        'block',
    width:          '100%',
    margin:         0,
    padding:        '4px 0',
    textAlign:      'left',
    background:     'none',
    border:         'none',
    cursor:         'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  taskText: {
    margin:     0,
    fontSize:   '15px',
    fontWeight: 800,
    color:      '#FFFFFF',
    lineHeight: 1.4,
    display:    'block',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  },
  criteriaHint: {
    display:    'block',
    marginTop:  '4px',
    fontSize:   '11px',
    fontWeight: 600,
    color:      'rgba(255,255,255,0.55)',
    lineHeight: 1.3,
  },
  starsRow: {
    display:        'flex',
    justifyContent: 'space-around',
    alignItems:     'center',
    gap:            '4px',
  },
  starBtn: {
    minWidth:        '44px',
    minHeight:       '44px',
    padding:         '4px',
    fontSize:        '40px',
    lineHeight:      1,
    backgroundColor: 'transparent',
    border:          'none',
    cursor:          'pointer',
    transition:      'transform 0.08s ease, color 0.15s ease, text-shadow 0.2s ease',
    userSelect:      'none',
    WebkitTapHighlightColor: 'transparent',
  },
  feedbackRow: {
    marginTop:      '8px',
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    minHeight:      '20px',
  },
  feedbackLabel: {
    fontSize:   '14px',
    fontWeight: 900,
    letterSpacing: '0.05em',
  },
  xpPreview: {
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.15)',
    padding:         '3px 12px',
    borderRadius:    '999px',
    border:          '1.5px solid #FFD700',
    boxShadow:       '0 0 8px rgba(255,215,0,0.4)',
    textShadow:      '0 0 4px rgba(255,215,0,0.6)',
  },
  tapHint: {
    fontSize:  '12px',
    color:     'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
};
