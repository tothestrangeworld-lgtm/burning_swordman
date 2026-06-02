// src/components/TeacherTaskRater.tsx
// =====================================================================
// 燃えよ剣士 - 先生用★評価コンポーネント
// 二重評価防止（todayEvaluatedTaskIds）に対応した先生専用版
// =====================================================================

'use client';

import { THEME, calcTeacherTaskXp } from '@/types';
import { TASK_CRITERIA } from '@/lib/taskCriteria';
import TaskCriteriaPanel from '@/components/TaskCriteriaPanel';

interface Props {
  taskId:   string;
  taskText: string;
  /** 0=未評価, 1〜5 */
  score:     number;
  onChange:  (score: number) => void;
  /** 今日すでに評価済みかどうか */
  alreadyEvaluated: boolean;
  index?:    number;
  criteriaExpanded?: boolean;
  onToggleCriteria?: () => void;
}

const SCORE_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'もっと修行！', emoji: '😤', color: '#999999' },
  2: { label: 'まあまあ',     emoji: '🙂', color: '#FFA07A' },
  3: { label: 'できてる！',   emoji: '😊', color: '#FFB400' },
  4: { label: 'すばらしい！', emoji: '🔥', color: '#DC143C' },
  5: { label: '会心の出来！', emoji: '⚡', color: THEME.primary },
};

export default function TeacherTaskRater({
  taskId, taskText, score, onChange, alreadyEvaluated, index,
  criteriaExpanded = false, onToggleCriteria,
}: Props) {
  const xp = score > 0 ? calcTeacherTaskXp(score) : 0;
  const meta = score > 0 ? SCORE_LABELS[score] : null;
  const disabled = alreadyEvaluated;
  const hasCriteria = Boolean(TASK_CRITERIA[taskId]);
  const textColor = disabled ? '#999' : THEME.text;

  return (
    <div style={{
      ...styles.card,
      ...(disabled ? styles.cardDisabled : {}),
      ...(score > 0 && !disabled ? styles.cardActive : {}),
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
                color: criteriaExpanded && !disabled
                  ? THEME.primaryDark
                  : textColor,
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
            <p style={{ ...styles.taskText, color: textColor }}>
              {taskText}
            </p>
          )}
          {hasCriteria && (
            <TaskCriteriaPanel taskId={taskId} expanded={criteriaExpanded} />
          )}
        </div>
        {disabled && (
          <span style={styles.evaluatedBadge}>
            ✅ 評価ずみ
          </span>
        )}
      </div>

      {!disabled && (
        <>
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
                  onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.85)'}
                  onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.85)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  ★
                </button>
              );
            })}
          </div>

          <div style={styles.feedbackRow}>
            {meta ? (
              <>
                <span style={{ ...styles.feedbackLabel, color: meta.color }}>
                  {meta.emoji} {meta.label}
                </span>
                <span style={styles.xpPreview}>
                  +<strong>{xp}</strong> XP <span style={styles.xpBoost}>×10!</span>
                </span>
              </>
            ) : (
              <span style={styles.tapHint}>↑ 星をタップして評価する</span>
            )}
          </div>
        </>
      )}

      {disabled && (
        <div style={styles.disabledMsg}>
          きょうはもう評価済みだ。あすまた稽古を見よう。
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding:      '14px 16px',
    borderRadius: '12px',
    border:       `2px solid ${THEME.border}`,
    backgroundColor: '#FFFFFF',
    transition:   'all 0.2s ease',
  },
  cardActive: {
    borderColor:     THEME.primary,
    backgroundColor: '#FFF8F8',
  },
  cardDisabled: {
    backgroundColor: '#F5F5F5',
    borderColor:     '#DDD',
    opacity:         0.7,
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
    flex:     1,
    minWidth: 0,
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
    lineHeight: 1.4,
    display:    'block',
    color:      'inherit',
  },
  criteriaHint: {
    display:    'block',
    marginTop:  '4px',
    fontSize:   '11px',
    fontWeight: 600,
    color:      THEME.textMuted,
    lineHeight: 1.3,
  },
  evaluatedBadge: {
    flexShrink:      0,
    fontSize:        '10px',
    fontWeight:      900,
    color:           '#1E7C3A',
    backgroundColor: '#E5F4E5',
    border:          '1px solid #1E7C3A',
    padding:         '3px 8px',
    borderRadius:    '999px',
  },
  starsRow: {
    display:        'flex',
    justifyContent: 'space-around',
    alignItems:     'center',
    gap:            '4px',
  },
  starBtn: {
    minWidth:        '48px',
    minHeight:       '48px',
    padding:         '4px',
    fontSize:        '40px',
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
    minHeight:      '24px',
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
    padding:         '4px 12px',
    borderRadius:    '999px',
    display:         'flex',
    alignItems:      'center',
    gap:             '4px',
    boxShadow:       '0 0 8px rgba(178,34,34,0.4)',
  },
  xpBoost: {
    fontSize:        '11px',
    fontWeight:      900,
    color:           '#FFD700',
    textShadow:      '0 0 4px rgba(255,215,0,0.5)',
    marginLeft:      '2px',
  },
  tapHint: {
    fontSize:  '12px',
    color:     THEME.textMuted,
    fontStyle: 'italic',
  },
  disabledMsg: {
    fontSize:  '12px',
    color:     '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding:   '8px 0',
  },
};
