// src/components/TaskReportCard.tsx
// =====================================================================
// 燃えよ剣士 - 修行のきろく（通知表）
// 固定課題の直近評価を★分布・平均で表示
// =====================================================================

'use client';

import { TaskMasterEntry, TaskLogEntry, THEME } from '@/types';

interface Props {
  taskMaster: TaskMasterEntry[];
  taskLogs:   TaskLogEntry[];
  /** 直近何日分の評価を集計するか（デフォルト30日） */
  windowDays?: number;
}

interface TaskAggregate {
  taskId:    string;
  taskText:  string;
  count:     number;
  avgScore:  number;     // 0〜5
  selfCount: number;
  teacherCount: number;
}

function aggregateByTask(
  master:  TaskMasterEntry[],
  logs:    TaskLogEntry[],
  windowDays: number,
): TaskAggregate[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recent = logs.filter(l => (l.date ?? '').slice(0, 10) >= cutoffStr);

  return master.map(m => {
    const matched = recent.filter(l => l.task_id === m.id);
    const sum     = matched.reduce((s, l) => s + (l.score ?? 0), 0);
    const teacherCount = matched.filter(l => l.evaluator_id !== 'self').length;

    return {
      taskId:       m.id,
      taskText:     m.taskText,
      count:        matched.length,
      avgScore:     matched.length > 0 ? sum / matched.length : 0,
      selfCount:    matched.length - teacherCount,
      teacherCount,
    };
  });
}

export default function TaskReportCard({
  taskMaster, taskLogs, windowDays = 30,
}: Props) {
  const aggregates = aggregateByTask(taskMaster, taskLogs, windowDays);

  // 全体平均
  const evaluatedTasks = aggregates.filter(a => a.count > 0);
  const overallAvg = evaluatedTasks.length > 0
    ? evaluatedTasks.reduce((s, a) => s + a.avgScore, 0) / evaluatedTasks.length
    : 0;

  // 全体評価バッジ
  const overallBadge = getOverallBadge(overallAvg);

  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <span style={styles.headerIcon}>📜</span>
        <h3 style={styles.title}>修行のきろく</h3>
        <span style={styles.windowBadge}>直近{windowDays}日</span>
      </header>

      {/* 全体平均バッジ */}
      <div style={styles.overallBox}>
        <div style={styles.overallLabel}>総合評価</div>
        <div style={styles.overallStars}>
          {renderStars(overallAvg, 22)}
        </div>
        <div style={{ ...styles.overallBadge, backgroundColor: overallBadge.color }}>
          {overallBadge.label}
        </div>
        <div style={styles.overallScore}>
          平均 <strong>{overallAvg.toFixed(1)}</strong> / 5.0
        </div>
      </div>

      {/* 課題別の通知表 */}
      <div style={styles.tableHeader}>
        <span style={styles.colTask}>課題</span>
        <span style={styles.colScore}>修行度</span>
        <span style={styles.colCount}>回数</span>
      </div>

      <ul style={styles.list}>
        {aggregates.map((a) => (
          <li key={a.taskId} style={styles.row}>
            <div style={styles.taskText}>{a.taskText}</div>
            <div style={styles.scoreBox}>
              {a.count > 0 ? (
                <>
                  <div style={styles.starsRow}>{renderStars(a.avgScore, 14)}</div>
                  <div style={styles.scoreNum}>{a.avgScore.toFixed(1)}</div>
                </>
              ) : (
                <div style={styles.notYet}>未挑戦</div>
              )}
            </div>
            <div style={styles.countBox}>
              <span style={styles.countNum}>{a.count}</span>
              {a.teacherCount > 0 && (
                <span style={styles.teacherBadge} title="先生評価あり">
                  ⭐{a.teacherCount}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* 凡例 */}
      <footer style={styles.footer}>
        <span>★ = 自己評価</span>
        <span style={{ marginLeft: 12 }}>
          <span style={styles.legendTeacher}>⭐</span> = 先生評価
        </span>
      </footer>
    </section>
  );
}

// 全体評価バッジ
function getOverallBadge(avg: number): { label: string; color: string } {
  if (avg >= 4.5) return { label: '極',   color: '#FFD700' };
  if (avg >= 4.0) return { label: '優',   color: '#B22222' };
  if (avg >= 3.0) return { label: '良',   color: '#DC143C' };
  if (avg >= 2.0) return { label: '可',   color: '#FFA07A' };
  if (avg > 0)    return { label: '修行中', color: '#A0A0A0' };
  return            { label: 'これから', color: '#CCCCCC' };
}

// ★を描画
function renderStars(score: number, size: number): React.ReactNode {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} style={{ fontSize: size, color: '#FFB400', textShadow: '0 0 2px rgba(255,180,0,0.5)' }}>★</span>
      ))}
      {half && (
        <span style={{ fontSize: size, color: '#FFB400', opacity: 0.6 }}>★</span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} style={{ fontSize: size, color: '#E5D8D8' }}>★</span>
      ))}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '20px 18px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       `0 4px 16px rgba(178, 34, 34, 0.10)`,
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
    color:      THEME.primaryDark,
    flex:       1,
  },
  windowBadge: {
    fontSize:        '10px',
    fontWeight:      700,
    color:           THEME.textMuted,
    backgroundColor: '#FFF8F8',
    padding:         '2px 8px',
    borderRadius:    '999px',
    border:          `1px solid ${THEME.border}`,
  },

  overallBox: {
    display:        'grid',
    gridTemplateColumns: '1fr',
    gap:            '6px',
    padding:        '12px 14px',
    backgroundColor: '#FFFEF0',
    border:         `1px solid ${THEME.accent}`,
    borderRadius:   '10px',
    textAlign:      'center',
    marginBottom:   '16px',
  },
  overallLabel: {
    fontSize:      '11px',
    fontWeight:    700,
    color:         THEME.textMuted,
    letterSpacing: '0.15em',
  },
  overallStars: {
    fontSize: '24px',
  },
  overallBadge: {
    display:         'inline-block',
    margin:          '4px auto 0',
    padding:         '3px 16px',
    borderRadius:    '999px',
    color:           '#FFFFFF',
    fontSize:        '13px',
    fontWeight:      900,
    letterSpacing:   '0.1em',
    width:           'fit-content',
    boxShadow:       '0 2px 4px rgba(0,0,0,0.1)',
  },
  overallScore: {
    fontSize: '12px',
    color:    THEME.textMuted,
  },

  tableHeader: {
    display:        'grid',
    gridTemplateColumns: '1fr 90px 60px',
    gap:            '8px',
    padding:        '6px 8px',
    fontSize:       '11px',
    fontWeight:     700,
    color:          THEME.textMuted,
    letterSpacing:  '0.1em',
    borderBottom:   `2px solid ${THEME.primary}`,
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
  row: {
    display:        'grid',
    gridTemplateColumns: '1fr 90px 60px',
    gap:            '8px',
    alignItems:     'center',
    padding:        '10px 8px',
    borderBottom:   `1px dashed ${THEME.border}`,
    fontSize:       '13px',
  },
  taskText: {
    color:      THEME.text,
    fontWeight: 600,
    lineHeight: 1.4,
  },
  scoreBox: {
    textAlign: 'center',
  },
  starsRow: {
    fontSize: '14px',
  },
  scoreNum: {
    fontSize:   '11px',
    fontWeight: 700,
    color:      THEME.primaryDark,
    marginTop:  '2px',
  },
  notYet: {
    fontSize:   '11px',
    color:      '#BBB',
    fontStyle:  'italic',
  },
  countBox: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '2px',
  },
  countNum: {
    fontSize:   '14px',
    fontWeight: 900,
    color:      THEME.text,
  },
  teacherBadge: {
    fontSize:   '10px',
    color:      THEME.primaryDark,
    fontWeight: 700,
  },

  footer: {
    marginTop:  '12px',
    paddingTop: '10px',
    borderTop:  `1px dashed ${THEME.border}`,
    fontSize:   '11px',
    color:      THEME.textMuted,
    textAlign:  'center',
  },
  legendTeacher: {
    color: THEME.primary,
  },
};
