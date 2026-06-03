// src/components/TeacherTaskRater.tsx
// =====================================================================
// 燃えよ剣士 - 先生用★評価コンポーネント（熱血ダークテーマ版）
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
  /** 課題ごとの個別コメント（任意） */
  comment?: string;
  onCommentChange?: (value: string) => void;
  commentExpanded?: boolean;
  onToggleComment?: () => void;
}

const SCORE_LABELS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'もっと修行！', emoji: '😤', color: '#A0A0A0' },
  2: { label: 'まあまあ',     emoji: '🙂', color: '#FFA07A' },
  3: { label: 'できてる！',   emoji: '😊', color: '#FFD700' },
  4: { label: 'すばらしい！', emoji: '🔥', color: '#FF6347' },
  5: { label: '会心の出来！', emoji: '⚡', color: '#FFFFFF' },
};

export default function TeacherTaskRater({
  taskId, taskText, score, onChange, alreadyEvaluated, index,
  criteriaExpanded = false, onToggleCriteria,
  comment = '', onCommentChange, commentExpanded = false, onToggleComment,
}: Props) {
  const xp = score > 0 ? calcTeacherTaskXp(score) : 0;
  const meta = score > 0 ? SCORE_LABELS[score] : null;
  const disabled = alreadyEvaluated;
  const hasCriteria = Boolean(TASK_CRITERIA[taskId]);
  const textColor = disabled ? 'rgba(255,255,255,0.45)' : '#FFFFFF';
  const hasComment = Boolean(comment.trim());
  const canComment = !disabled && Boolean(onCommentChange && onToggleComment);

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
                  ? '#FFD700'
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
                    color: filled ? '#FFD700' : 'rgba(255,255,255,0.18)',
                    textShadow: filled
                      ? '0 0 8px rgba(255,215,0,0.85), 0 0 16px rgba(255,215,0,0.45)'
                      : 'none',
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
                <span style={{
                  ...styles.feedbackLabel,
                  color: meta.color,
                  textShadow: `0 0 6px ${meta.color}88`,
                }}>
                  {meta.emoji} {meta.label}
                </span>
                <span style={styles.xpPreview}>
                  +<strong>{xp}</strong> XP
                  <span style={styles.xpBoost}>×10!</span>
                </span>
              </>
            ) : (
              <span style={styles.tapHint}>↑ 星をタップして評価する</span>
            )}
          </div>

          {canComment && (
            <div style={styles.commentBlock}>
              <button
                type="button"
                onClick={onToggleComment}
                style={{
                  ...styles.commentToggle,
                  ...(commentExpanded ? styles.commentToggleOpen : {}),
                  ...(hasComment && !commentExpanded ? styles.commentToggleFilled : {}),
                }}
                aria-expanded={commentExpanded}
              >
                <span style={styles.commentToggleIcon}>💬</span>
                <span style={styles.commentToggleText}>
                  {commentExpanded
                    ? 'コメントを閉じる'
                    : hasComment
                      ? 'コメントを編集（任意）'
                      : 'コメントを書く（任意）'}
                </span>
                {hasComment && !commentExpanded && (
                  <span style={styles.commentFilledDot} aria-hidden="true" />
                )}
                <span style={styles.commentToggleChevron}>
                  {commentExpanded ? '▲' : '▼'}
                </span>
              </button>

              <div
                style={{
                  ...styles.commentPanel,
                  maxHeight: commentExpanded ? '160px' : '0',
                  opacity:   commentExpanded ? 1 : 0,
                  marginTop: commentExpanded ? '8px' : '0',
                  padding:   commentExpanded ? '10px 12px' : '0 12px',
                }}
                aria-hidden={!commentExpanded}
              >
                <textarea
                  value={comment}
                  onChange={(e) => onCommentChange!(e.target.value)}
                  placeholder="例：足さばきがとても良くなった！"
                  style={styles.commentInput}
                  maxLength={200}
                  rows={2}
                  disabled={!commentExpanded}
                />
                <div style={styles.commentFooter}>
                  <span style={styles.commentHint}>生徒の伝言板に表示されます</span>
                  <span style={styles.commentLimit}>{comment.length}/200</span>
                </div>
              </div>
            </div>
          )}
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
    padding:         '14px 16px',
    borderRadius:    '12px',
    border:          '2px solid rgba(255,255,255,0.2)',
    backgroundColor: THEME.bgCardDeep ?? '#1A0505',
    boxShadow:       '0 2px 8px rgba(0,0,0,0.4), inset 0 0 12px rgba(0,0,0,0.3)',
    transition:      'all 0.2s ease',
  },
  cardActive: {
    borderColor:     '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.08)',
    boxShadow:       '0 4px 16px rgba(255,215,0,0.25), inset 0 0 20px rgba(255,215,0,0.10)',
  },
  cardDisabled: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor:     'rgba(255,255,255,0.12)',
    opacity:         0.6,
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
    fontWeight: 800,
    lineHeight: 1.4,
    display:    'block',
    color:      'inherit',
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
  evaluatedBadge: {
    flexShrink:      0,
    fontSize:        '10px',
    fontWeight:      900,
    color:           '#7FFFAA',
    backgroundColor: 'rgba(30,124,58,0.30)',
    border:          '1px solid #7FFFAA',
    padding:         '3px 8px',
    borderRadius:    '999px',
    textShadow:      '0 0 4px rgba(127,255,170,0.5)',
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
    transition:      'transform 0.08s ease, color 0.15s ease, text-shadow 0.2s ease',
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
    fontWeight: 900,
    letterSpacing: '0.05em',
  },
  xpPreview: {
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 100%)`,
    padding:         '4px 12px',
    borderRadius:    '999px',
    display:         'flex',
    alignItems:      'center',
    gap:             '4px',
    boxShadow:       '0 0 12px rgba(255,68,68,0.55), 0 0 6px rgba(255,215,0,0.4)',
    border:          '1.5px solid #FFD700',
    textShadow:      '0 1px 2px rgba(0,0,0,0.5)',
  },
  xpBoost: {
    fontSize:        '11px',
    fontWeight:      900,
    color:           '#FFD700',
    textShadow:      '0 0 6px rgba(255,215,0,0.8)',
    marginLeft:      '2px',
  },
  tapHint: {
    fontSize:  '12px',
    color:     'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
  },
  disabledMsg: {
    fontSize:  '12px',
    color:     'rgba(255,255,255,0.45)',
    fontStyle: 'italic',
    textAlign: 'center',
    padding:   '8px 0',
  },

  // === コメントブロック ===
  commentBlock: {
    marginTop:  '10px',
    paddingTop: '10px',
    borderTop:  '1px dashed rgba(255,255,255,0.18)',
  },
  commentToggle: {
    width:           '100%',
    minHeight:       '44px',
    padding:         '8px 12px',
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    backgroundColor: 'rgba(0,0,0,0.30)',
    border:          '1.5px solid rgba(255,255,255,0.2)',
    borderRadius:    '10px',
    cursor:          'pointer',
    textAlign:       'left',
    WebkitTapHighlightColor: 'transparent',
    transition:      'border-color 0.15s ease, background-color 0.15s ease',
  },
  commentToggleOpen: {
    borderColor:     '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.10)',
    boxShadow:       'inset 0 0 8px rgba(255,215,0,0.15)',
  },
  commentToggleFilled: {
    borderColor:     'rgba(255,215,0,0.45)',
    backgroundColor: 'rgba(255,215,0,0.05)',
  },
  commentToggleIcon: {
    fontSize:   '16px',
    flexShrink: 0,
  },
  commentToggleText: {
    flex:       1,
    fontSize:   '13px',
    fontWeight: 900,
    color:      '#FFD700',
    textShadow: '0 0 4px rgba(255,215,0,0.4)',
  },
  commentFilledDot: {
    width:           '8px',
    height:          '8px',
    borderRadius:    '50%',
    backgroundColor: '#FFD700',
    boxShadow:       '0 0 6px rgba(255,215,0,0.7)',
    flexShrink:      0,
  },
  commentToggleChevron: {
    fontSize:   '10px',
    fontWeight: 900,
    color:      'rgba(255,255,255,0.7)',
    flexShrink: 0,
  },
  commentPanel: {
    overflow:        'hidden',
    transition:      'max-height 0.25s ease, opacity 0.2s ease, margin-top 0.2s ease, padding 0.2s ease',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius:    '10px',
    border:          '1.5px solid rgba(255,255,255,0.2)',
    boxSizing:       'border-box',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.4)',
  },
  commentInput: {
    width:           '100%',
    padding:         '10px 12px',
    fontSize:        '13px',
    fontFamily:      'inherit',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.4)',
    border:          '1.5px solid rgba(255,255,255,0.2)',
    borderRadius:    '8px',
    outline:         'none',
    resize:          'vertical',
    minHeight:       '56px',
    boxSizing:       'border-box',
    lineHeight:      1.5,
  },
  commentFooter: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      '6px',
    gap:            '8px',
  },
  commentHint: {
    fontSize:   '10px',
    fontWeight: 600,
    color:      'rgba(255,255,255,0.6)',
  },
  commentLimit: {
    fontSize:   '10px',
    color:      'rgba(255,255,255,0.5)',
    flexShrink: 0,
  },
};
