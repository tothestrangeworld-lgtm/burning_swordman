// src/components/TaskRater.tsx
// =====================================================================
// 燃えよ剣士 - 課題の★評価コンポーネント
// 小学生でも迷わずタップできる、特大の星アイコンUI
// =====================================================================

'use client';

import { THEME, calcSelfTaskXp } from '@/types';
import { TASK_CRITERIA } from '@/lib/taskCriteria';
import TaskCriteriaPanel from '@/components/TaskCriteriaPanel';

interface Props {
  taskId:   string;
  taskText: string;
  /** 0=未評価, 1〜5 */
  score:    number;
  onChange: (score: number) => void;
  /** インデックス（連番表示用） */
  index?:   number;
  /** 合格基準アコーディオンが開いているか */
  criteriaExpanded?: boolean;
  onToggleCriteria?: () => void;
}

const SCORE_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'うーん…',     emoji: '😣', color: '#999999' },
  2: { label: 'まあまあ',     emoji: '🙂', color: '#FFA07A' },
  3: { label: 'できた！',     emoji: '😊', color: '#FFB400' },
  4: { label: 'バッチリ！',   emoji: '🔥', color: '#DC143C' },
  5: { label: '完璧！！',     emoji: '⚡', color: THEME.primary },
};

export default function TaskRater({
  taskId, taskText, score, onChange, index,
  criteriaExpanded = false, onToggleCriteria,
}: Props) {
  const xp = score > 0 ? calcSelfTaskXp(score) : 0;
  const meta = score > 0 ? SCORE_LABELS[score] : null;
  const hasCriteria = Boolean(TASK_CRITERIA[taskId]);

  return (
    <div style={{
      ...styles.card,
      borderColor: score > 0 ? THEME.primary : THEME.border,
      backgroundColor: score > 0 ? '#FFF8F8' : '#FFFFFF',
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
                color: criteriaExpanded ? THEME.primaryDark : THEME.text,
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

      {/* 星ボタン（特大タップエリア） */}
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
                color: filled ? '#FFB400' : '#E0D5D5',
                textShadow: filled ? '0 0 6px rgba(255,180,0,0.5)' : 'none',
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
            <span style={{ ...styles.feedbackLabel, color: meta.color }}>
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
    transition:   'border-color 0.2s, background-color 0.2s',
  },
  header: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '8px',
    marginBottom: '10px',
  },
  indexBadge: {
    flexShrink:      0,
    width:           '24px',
    height:          '24px',
    borderRadius:    '50%',
    backgroundColor: THEME.primary,
    color:           '#FFFFFF',
    fontSize:        '12px',
    fontWeight:      900,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
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
    fontWeight: 700,
    color:      'inherit',
    lineHeight: 1.4,
    display:    'block',
  },
  criteriaHint: {
    display:    'block',
    marginTop:  '4px',
    fontSize:   '11px',
    fontWeight: 600,
    color:      THEME.textMuted,
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
    fontSize:        '38px',
    lineHeight:      1,
    backgroundColor: 'transparent',
    border:          'none',
    cursor:          'pointer',
    transition:      'transform 0.08s ease, color 0.15s ease',
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
    fontWeight: 800,
  },
  xpPreview: {
    fontSize:        '13px',
    fontWeight:      700,
    color:           '#FFFFFF',
    backgroundColor: THEME.primary,
    padding:         '2px 10px',
    borderRadius:    '999px',
  },
  tapHint: {
    fontSize:  '12px',
    color:     THEME.textMuted,
    fontStyle: 'italic',
  },
};
