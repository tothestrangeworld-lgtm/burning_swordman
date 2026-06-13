// src/components/TaskReportCard.tsx
// =====================================================================
// 燃えろ剣士 - 修行の記録（通知表）
// 自己評価・先生評価の2行★表示 ＋ 課題別コメントアコーディオン
// =====================================================================

'use client';

import { useMemo, useState } from 'react';
import {
  TaskMasterEntry,
  TaskLogEntry,
  TeacherEvaluationEntry,
  THEME,
} from '@/types';

interface Props {
  taskMaster:    TaskMasterEntry[];
  taskLogs:      TaskLogEntry[];
  teacherEvals?: TeacherEvaluationEntry[];
  windowDays?:  number;
}

interface TaskAggregate {
  taskId:        string;
  taskText:      string;
  count:         number;
  selfScore:     number;
  teacherScore:  number;
  selfCount:     number;
  teacherCount:  number;
}

function normalizeDateStr(dateStr: unknown): string {
  if (dateStr == null || dateStr === '') return '';
  const raw = String(dateStr).split('T')[0].trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const month = isoMatch[2].padStart(2, '0');
    const day   = isoMatch[3].padStart(2, '0');
    return `${isoMatch[1]}-${month}-${day}`;
  }
  if (raw.length >= 10 && raw[4] === '-' && raw[7] === '-') {
    return raw.slice(0, 10);
  }
  return '';
}

function formatEvalDate(dateStr: unknown): string {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return '';
  const month = normalized.slice(5, 7);
  const day   = normalized.slice(8, 10);
  if (!/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return '';
  return `${month}/${day}`;
}

function daysSinceDate(dateStr: unknown): number {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return 999;
  const parts = normalized.split('-').map(Number);
  if (parts.length < 3) return 999;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const evalUtc  = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.floor((todayUtc - evalUtc) / 86400000);
}

function teacherDisplayName(name: string | undefined | null): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '先生';
  return trimmed.endsWith('先生') ? trimmed : `${trimmed}先生`;
}

function avgScore(logs: TaskLogEntry[]): number {
  if (!logs.length) return 0;
  return logs.reduce((s, l) => s + (l.score ?? 0), 0) / logs.length;
}

function aggregateByTask(
  master:     TaskMasterEntry[],
  logs:       TaskLogEntry[],
  windowDays: number,
): TaskAggregate[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = logs.filter(l => normalizeDateStr(l.date) >= cutoffStr);

  // 自己評価か先生評価かの判定ヘルパー。
  // バックエンド仕様（api.ts）では、
  //   - 自己記録    : evaluator_id = null（→ フロントでは undefined / '' になる）
  //   - 先生評価    : evaluator_id = 先生ID（'self' という文字列は使われない）
  // そのため「evaluator_id が空かどうか」で確実に仕分けする。
  const isSelfLog = (l: TaskLogEntry): boolean => {
    const evalId = (l.evaluator_id ?? '').trim();
    return evalId === '' || evalId === 'self';
  };

  return master.map(m => {
    const matched     = recent.filter(l => l.task_id === m.id);
    const selfLogs    = matched.filter(l => isSelfLog(l));
    const teacherLogs = matched.filter(l => !isSelfLog(l));

    return {
      taskId:       m.id,
      taskText:     m.task_text,
      count:        matched.length,
      selfScore:    avgScore(selfLogs),
      teacherScore: avgScore(teacherLogs),
      selfCount:    selfLogs.length,
      teacherCount: teacherLogs.length,
    };
  });
}

function getLatestComment(
  taskId: string,
  teacherEvals: TeacherEvaluationEntry[],
): TeacherEvaluationEntry | null {
  const withComment = (teacherEvals ?? [])
    .filter(e => e.task_id === taskId && Boolean((e.comment || '').trim()))
    .sort((a, b) => normalizeDateStr(b.date).localeCompare(normalizeDateStr(a.date)));
  return withComment[0] ?? null;
}

function getOverallBadge(avg: number): { label: string; color: string } {
  if (avg >= 4.5) return { label: '極',   color: '#FFD700' };
  if (avg >= 4.0) return { label: '優',   color: '#B22222' };
  if (avg >= 3.0) return { label: '良',   color: '#DC143C' };
  if (avg >= 2.0) return { label: '可',   color: '#FFA07A' };
  if (avg > 0)    return { label: '修行中', color: '#A0A0A0' };
  return            { label: 'これから', color: '#CCCCCC' };
}

function renderDiscreteStars(
  score: number,
  variant: 'self' | 'teacher',
  size = 11,
): React.ReactNode {
  const n = score > 0 ? Math.min(5, Math.max(1, Math.round(score))) : 0;
  if (n === 0) {
    return <span style={styles.noStar}>—</span>;
  }
  const filledColor = variant === 'teacher' ? '#FFB400' : 'rgba(255, 255, 255, 0.74)';
  const emptyColor  = 'rgba(255,255,255,0.15)';

  return (
    <span style={styles.starTrack} aria-label={`${n}つ星`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{
            fontSize:   size,
            lineHeight: 1,
            color:      i <= n ? filledColor : emptyColor,
            textShadow: variant === 'teacher' && i <= n
              ? '0 0 5px rgba(255,215,0,0.65)'
              : 'none',
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function TaskReportCard({
  taskMaster,
  taskLogs,
  teacherEvals = [],
  windowDays = 30,
}: Props) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const aggregates = useMemo(
    () => aggregateByTask(taskMaster, taskLogs, windowDays),
    [taskMaster, taskLogs, windowDays],
  );

  const commentMap = useMemo(() => {
    const map = new Map<string, TeacherEvaluationEntry>();
    taskMaster.forEach(m => {
      const latest = getLatestComment(m.id, teacherEvals);
      if (latest) map.set(m.id, latest);
    });
    return map;
  }, [taskMaster, teacherEvals]);

  const evaluatedTasks = aggregates.filter(a => a.count > 0);
  const blendedOverall = evaluatedTasks.length > 0
    ? evaluatedTasks.reduce((s, a) => {
        const total = a.selfCount + a.teacherCount;
        if (total === 0) return s;
        return s + ((a.selfScore * a.selfCount) + (a.teacherScore * a.teacherCount)) / total;
      }, 0) / evaluatedTasks.length
    : 0;
  const overallBadge = getOverallBadge(blendedOverall);

  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <span style={styles.headerIcon}>📜</span>
        <h3 style={styles.title}>修行の記録</h3>
        <span style={styles.windowBadge}>直近{windowDays}日</span>
      </header>

      <div style={styles.overallBox}>
        <div style={styles.overallLabel}>総合評価</div>
        <div style={styles.overallStars}>
          {renderDiscreteStars(Math.round(blendedOverall), 'teacher', 18)}
        </div>
        <div style={{ ...styles.overallBadge, backgroundColor: overallBadge.color }}>
          {overallBadge.label}
        </div>
        <div style={styles.overallScore}>
          平均 <strong>{blendedOverall.toFixed(1)}</strong> / 5.0
        </div>
      </div>

      <div style={styles.tableHeader}>
        <span style={styles.colTask}>課題</span>
        <span style={styles.colScore}>★評価</span>
        <span style={styles.colCount}>回数</span>
      </div>

      <ul style={styles.list}>
        {aggregates.map((a) => {
          const latestComment = commentMap.get(a.taskId) ?? null;
          const hasComment    = Boolean(latestComment);
          const isExpanded    = expandedTaskId === a.taskId;
          const isNewComment  = hasComment && daysSinceDate(latestComment!.date) <= 3;
          const canExpand     = hasComment;

          return (
            <li key={a.taskId} style={styles.rowWrap}>
              <div style={styles.row}>
                <button
                  type="button"
                  style={{
                    ...styles.taskBtn,
                    ...(canExpand ? styles.taskBtnTappable : {}),
                  }}
                  onClick={() => {
                    if (!canExpand) return;
                    setExpandedTaskId(prev => (prev === a.taskId ? null : a.taskId));
                  }}
                  disabled={!canExpand}
                  aria-expanded={canExpand ? isExpanded : undefined}
                >
                  <span style={styles.taskText}>{a.taskText}</span>
                  {isNewComment && (
                    <span style={styles.newBadge} title="新しい伝言あり！">
                      🔴
                    </span>
                  )}
                  {hasComment && (
                    <span style={styles.tapHint}>
                      {isExpanded ? '▲' : '💬 タップ'}
                    </span>
                  )}
                </button>

                <div style={styles.scoreCol}>
                  {a.selfCount > 0 ? (
                    <div style={styles.scoreLine}>
                      <span style={styles.scoreLineLabel}>自己</span>
                      {renderDiscreteStars(a.selfScore, 'self')}
                    </div>
                  ) : (
                    <div style={styles.scoreLine}>
                      <span style={styles.scoreLineLabel}>自己</span>
                      <span style={styles.noStar}>—</span>
                    </div>
                  )}
                  {a.teacherCount > 0 ? (
                    <div style={styles.scoreLine}>
                      <span style={styles.scoreLineLabel}>先生</span>
                      {renderDiscreteStars(a.teacherScore, 'teacher')}
                    </div>
                  ) : (
                    <div style={styles.scoreLine}>
                      <span style={styles.scoreLineLabel}>先生</span>
                      <span style={styles.noStar}>—</span>
                    </div>
                  )}
                </div>

                <div style={styles.countBox}>
                  <span style={styles.countNum}>{a.count}</span>
                </div>
              </div>

              {hasComment && (
                <div
                  style={{
                    ...styles.commentPanel,
                    maxHeight: isExpanded ? '220px' : '0',
                    opacity:   isExpanded ? 1 : 0,
                    marginTop: isExpanded ? '8px' : '0',
                    padding:   isExpanded ? '12px 14px' : '0 14px',
                  }}
                  aria-hidden={!isExpanded}
                >
                  <div style={styles.commentBubble}>
                    <div style={styles.commentMeta}>
                      <span style={styles.commentDate}>
                        {formatEvalDate(latestComment!.date)}
                      </span>
                      <span style={styles.commentTeacher}>
                        {teacherDisplayName(latestComment!.evaluator_name)}から
                      </span>
                      <span style={styles.commentScore}>
                        ★{latestComment!.score}
                      </span>
                    </div>
                    <p style={styles.commentBody}>
                      {(latestComment!.comment || '').trim()}
                    </p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <footer style={styles.footer}>
        <span>上段★ = 自己評価</span>
        <span style={{ marginLeft: 12 }}>下段★ = 先生評価（ゴールド）</span>
        <span style={{ display: 'block', marginTop: 4 }}>
          💬 先生のコメントがある課題をタップして読もう！
        </span>
      </footer>

      <style>{`
        @keyframes burning_new_badge {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(1.2); }
        }
      `}</style>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.borderSolid}`,
    boxShadow:       '0 6px 24px rgba(0,0,0,0.45)',
  },
  header: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginBottom: '14px',
  },
  headerIcon: {
    fontSize: '20px',
  },
  title: {
    margin:     0,
    fontSize:   '18px',
    fontWeight: 900,
    color:      THEME.text,
    flex:       1,
  },
  windowBadge: {
    fontSize:        '10px',
    fontWeight:      700,
    color:           THEME.textMuted,
    backgroundColor: THEME.bgCardDeep,
    padding:         '2px 8px',
    borderRadius:    '999px',
    border:          `1px solid ${THEME.border}`,
  },
  overallBox: {
    display:        'grid',
    gridTemplateColumns: '1fr',
    gap:            '6px',
    padding:        '12px 14px',
    backgroundColor: THEME.bgCardDeep,
    border:         `1px solid ${THEME.accent}`,
    borderRadius:   '10px',
    textAlign:      'center',
    marginBottom:   '16px',
    boxShadow:      '0 0 16px rgba(255,215,0,0.08)',
  },
  overallLabel: {
    fontSize:      '11px',
    fontWeight:    700,
    color:         THEME.textMuted,
    letterSpacing: '0.15em',
  },
  overallStars: {
    display:        'flex',
    justifyContent: 'center',
  },
  overallBadge: {
    display:         'inline-block',
    margin:          '4px auto 0',
    padding:         '3px 16px',
    borderRadius:    '999px',
    color:           THEME.primaryDark,
    fontSize:        '13px',
    fontWeight:      900,
    letterSpacing:   '0.1em',
    width:           'fit-content',
    boxShadow:       '0 0 10px rgba(255,215,0,0.25)',
  },
  overallScore: {
    fontSize: '12px',
    color:    THEME.textMuted,
  },
  tableHeader: {
    display:        'grid',
    gridTemplateColumns: '1fr 108px 44px',
    gap:            '8px',
    padding:        '6px 8px',
    fontSize:       '11px',
    fontWeight:     700,
    color:          THEME.textSubtle,
    letterSpacing:  '0.1em',
    borderBottom:   `2px solid ${THEME.borderSolid}`,
    marginBottom:   '4px',
  },
  colTask:  { textAlign: 'left' },
  colScore: { textAlign: 'center' },
  colCount: { textAlign: 'center' },
  list: {
    listStyle: 'none',
    margin:    0,
    padding:   0,
  },
  rowWrap: {
    borderBottom: `1px dashed ${THEME.border}`,
  },
  row: {
    display:        'grid',
    gridTemplateColumns: '1fr 108px 44px',
    gap:            '8px',
    alignItems:     'center',
    padding:        '10px 8px',
    fontSize:       '13px',
  },
  taskBtn: {
    display:        'flex',
    alignItems:     'center',
    flexWrap:       'wrap',
    gap:            '6px',
    margin:         0,
    padding:        0,
    border:         'none',
    background:     'none',
    textAlign:      'left',
    cursor:         'default',
    WebkitTapHighlightColor: 'transparent',
  },
  taskBtnTappable: {
    cursor: 'pointer',
  },
  taskText: {
    color:      THEME.text,
    fontWeight: 700,
    lineHeight: 1.4,
    flex:       1,
    minWidth:   0,
  },
  newBadge: {
    fontSize:  '12px',
    flexShrink: 0,
    animation: 'burning_new_badge 1.2s ease-in-out infinite',
  },
  tapHint: {
    fontSize:   '10px',
    fontWeight: 700,
    color:      THEME.accent,
    flexShrink: 0,
  },
  scoreCol: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '3px',
    alignItems:    'center',
  },
  scoreLine: {
    display:    'flex',
    alignItems: 'center',
    gap:        '4px',
    width:      '100%',
    justifyContent: 'flex-end',
  },
  scoreLineLabel: {
    fontSize:   '9px',
    fontWeight: 800,
    color:      THEME.textSubtle,
    width:      '22px',
    flexShrink: 0,
    textAlign:  'right',
  },
  starTrack: {
    display:    'inline-flex',
    gap:        '1px',
    flexShrink: 0,
  },
  noStar: {
    fontSize:  '11px',
    color:     THEME.textSubtle,
  },
  countBox: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
  },
  countNum: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.text,
  },
  commentPanel: {
    overflow:   'hidden',
    transition: 'max-height 0.28s ease, opacity 0.22s ease, margin-top 0.22s ease, padding 0.22s ease',
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingBottom: '10px',
  },
  commentBubble: {
    backgroundColor: THEME.bgBubble,
    border:          `1.5px solid ${THEME.borderSolid}`,
    borderRadius:    '12px',
    padding:         '12px 14px',
    borderLeft:      `4px solid ${THEME.accent}`,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.35)',
  },
  commentMeta: {
    display:    'flex',
    alignItems: 'baseline',
    flexWrap:   'wrap',
    gap:        '6px',
    marginBottom: '8px',
  },
  commentDate: {
    fontSize:   '12px',
    fontWeight: 900,
    color:      THEME.accent,
  },
  commentTeacher: {
    fontSize:   '12px',
    fontWeight: 800,
    color:      THEME.textMuted,
  },
  commentScore: {
    fontSize:   '12px',
    fontWeight: 900,
    color:      '#FFB400',
    textShadow: '0 0 6px rgba(255,215,0,0.45)',
  },
  commentBody: {
    margin:     0,
    fontSize:   '14px',
    fontWeight: 800,
    color:      THEME.text,
    lineHeight: 1.65,
  },
  footer: {
    marginTop:  '12px',
    paddingTop: '10px',
    borderTop:  `1px dashed ${THEME.border}`,
    fontSize:   '11px',
    color:      THEME.textSubtle,
    textAlign:  'center',
  },
};
