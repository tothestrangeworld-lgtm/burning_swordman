// src/app/teacher/[studentId]/page.tsx
// =====================================================================
// 燃えよ剣士 - 個別生徒評価画面（熱血ダークテーマ版・日付表示修正）
// 先生がスマホでサクサク評価→XP10倍ボーナス付与
// =====================================================================

'use client';

export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  useStudentDetailSWR,
  evaluateStudent,
  useMyTeacherDashboardSWR,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import {
  THEME,
  TitleMasterEntry,
  titleForLevel,
  levelColor,
  calcTeacherTaskXp,
  TeacherEvalPayload,
} from '@/types';

import TeacherTaskRater from '@/components/TeacherTaskRater';

interface TaskScoreMap {
  [taskId: string]: number;
}

interface TaskCommentMap {
  [taskId: string]: string;
}

// 学年表示
function formatGrade(grade: number): string {
  if (!grade || grade < 1 || grade > 6) return '';
  return `${grade}年生`;
}

// =====================================================================
// ★ 日付の短縮表示（MM/dd 形式に安全変換）
// GASから返るフォーマットのバラつきに対応：
//   - "2026-05-27"          → "05/27"
//   - "Mon May 27 2026..."  → "05/27"
//   - "2026-05-27T10:30Z"   → "05/27"
// =====================================================================
function formatShortDate(rawDate: string): string {
  if (!rawDate) return '';

  // 1. "YYYY-MM-DD" 形式が含まれているかチェック（最優先・最高速）
  const ymdMatch = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) return `${ymdMatch[2]}/${ymdMatch[3]}`;

  // 2. JS標準のDateとしてパース（"Mon May 27 2026..." 等のGAS形式に対応）
  const d = new Date(rawDate);
  if (!isNaN(d.getTime())) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}`;
  }

  // 3. どちらもダメならフォールバック
  return rawDate.slice(0, 5);
}

export default function TeacherEvalPage() {
  const router = useRouter();
  const params = useParams<{ studentId: string }>();
  const studentId = params?.studentId ?? null;

  // -----------------------------------------------------------------
  // 認証ガード
  // -----------------------------------------------------------------
  useEffect(() => {
    const user = getAuthUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'teacher') {
      router.replace('/');
      return;
    }
  }, [router]);

  const user = typeof window !== 'undefined' ? getAuthUser() : null;
  const teacherId = user?.role === 'teacher' ? user.id : null;

  // -----------------------------------------------------------------
  // データ取得
  // -----------------------------------------------------------------
  const { data, isLoading, error, mutate } = useStudentDetailSWR(teacherId, studentId);
  const { mutate: mutateTeacherList }      = useMyTeacherDashboardSWR();

  // -----------------------------------------------------------------
  // 入力ステート
  // -----------------------------------------------------------------
  const [taskScores, setTaskScores]     = useState<TaskScoreMap>({});
  const [taskComments, setTaskComments] = useState<TaskCommentMap>({});
  const [submitting, setSubmitting]     = useState(false);
  const [submitError,setSubmitError]    = useState('');
  const [success,    setSuccess]        = useState<{ xp: number } | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedCommentTaskId, setExpandedCommentTaskId] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // XP合計プレビュー
  // -----------------------------------------------------------------
  const xpPreview = useMemo(() => {
    return Object.values(taskScores)
      .filter(s => s > 0)
      .reduce((sum, s) => sum + calcTeacherTaskXp(s), 0);
  }, [taskScores]);

  const evalCount = useMemo(() => {
    return Object.values(taskScores).filter(s => s > 0).length;
  }, [taskScores]);

  // -----------------------------------------------------------------
  // ハンドラ
  // -----------------------------------------------------------------
  const handleScoreChange = (taskId: string, score: number) => {
    setTaskScores(prev => {
      if (score === 0) {
        const { [taskId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [taskId]: score };
    });
    if (score === 0) {
      setTaskComments(prev => {
        const { [taskId]: _, ...rest } = prev;
        return rest;
      });
      setExpandedCommentTaskId(prev => (prev === taskId ? null : prev));
    }
  };

  const handleCommentChange = (taskId: string, value: string) => {
    setTaskComments(prev => {
      const trimmed = value.slice(0, 200);
      if (!trimmed.trim()) {
        const { [taskId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [taskId]: trimmed };
    });
  };

  const handleSubmit = async () => {
    if (submitting || !studentId) return;
    if (evalCount === 0) {
      setSubmitError('課題を1つ以上評価してください');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    try {
      const evaluations = Object.entries(taskScores)
        .filter(([, s]) => s > 0)
        .map(([task_id, score]) => {
          const taskComment = (taskComments[task_id] || '').trim();
          return {
            task_id,
            score,
            ...(taskComment ? { comment: taskComment } : {}),
          };
        });

      const payload: TeacherEvalPayload = {
        action:      'evaluateStudent',
        student_id:  studentId,
        evaluations,
      };

      const result = await evaluateStudent(payload);

      setTaskScores({});
      setTaskComments({});
      setExpandedCommentTaskId(null);

      setSuccess({
        xp: result.xp_granted ?? xpPreview,
      });

      mutate();
      mutateTeacherList();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '評価の送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuccessContinue = () => {
    setSuccess(null);
  };

  const handleSuccessBack = () => {
    setSuccess(null);
    router.replace('/teacher');
  };

  // -----------------------------------------------------------------
  // ローディング
  // -----------------------------------------------------------------
  if (!user || isLoading || !data) {
    return (
      <div style={styles.loadingBox}>
        <div style={styles.loadingFlame}>🥋</div>
        <p style={styles.loadingText}>門下生のきろくを呼び出し中…</p>
        <style>{`
          @keyframes burning_load_flame {
            0%, 100% { transform: scale(1) rotate(-3deg); }
            50%      { transform: scale(1.15) rotate(3deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingBox}>
        <div style={{ fontSize: 48 }}>😣</div>
        <p style={styles.loadingText}>データを読み込めません</p>
        <button
          style={styles.errorBtn}
          onClick={() => router.replace('/teacher')}
        >
          一覧にもどる
        </button>
      </div>
    );
  }

  const { student, status, taskMaster, recentLogs, todayEvaluatedTaskIds = [] } = data;
  const titleMaster: TitleMasterEntry[] = data.titleMaster ?? [];
  const sortedTasks = [...taskMaster].sort((a, b) => a.displayOrder - b.displayOrder);
  const evaluableTasks = sortedTasks.filter(t => !todayEvaluatedTaskIds.includes(t.id));
  const allTasksDone = evaluableTasks.length === 0;
  const lvColor = levelColor(status.level);
  const title   = titleForLevel(status.level, titleMaster);
  const gradeLabel = formatGrade(student.grade);

  // -----------------------------------------------------------------
  // メインビュー
  // -----------------------------------------------------------------
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヘッダー */}
        <header style={styles.headerBar}>
          <button
            type="button"
            onClick={() => router.replace('/teacher')}
            style={styles.backBtn}
            aria-label="一覧にもどる"
          >
            ← もどる
          </button>
          <div style={styles.headerTitleBox}>
            <span style={styles.headerLogo}>📝</span>
            <span style={styles.headerTitle}>門下生を評価</span>
          </div>
          <div style={{ width: 60 }} />
        </header>

        {/* 生徒ステータスカード */}
        <section style={styles.studentCard}>
          <div style={styles.studentTop}>
            <div style={styles.studentIcon}>⚔️</div>
            <div style={styles.studentInfo}>
              <div style={styles.studentNameRow}>
                <span style={styles.studentName}>{student.name}</span>
                {gradeLabel && (
                  <span style={styles.studentGrade}>{gradeLabel}</span>
                )}
              </div>
              <div style={{
                ...styles.studentTitle,
                color: lvColor,
                textShadow: `0 0 6px ${lvColor}88`,
              }}>
                {title}
              </div>
            </div>
            <div style={styles.studentLevel}>
              <span style={styles.studentLvLabel}>修行度</span>
              <span style={{
                ...styles.studentLvNum,
                color: lvColor,
                textShadow: `0 0 8px ${lvColor}AA`,
              }}>
                Lv.{status.level}
              </span>
            </div>
          </div>

          <div style={styles.studentBottom}>
            <div style={styles.studentXpBox}>
              <span style={styles.studentXpLabel}>累計修行値</span>
              <span style={styles.studentXpNum}>
                {status.total_xp.toLocaleString()} XP
              </span>
            </div>
            {status.catchphrase && (
              <div style={styles.studentCatchphrase}>
                💬「{status.catchphrase}」
              </div>
            )}
          </div>
        </section>

        {/* 直近の稽古ログ */}
        {recentLogs && recentLogs.length > 0 && (
          <section style={styles.recentSection}>
            <div style={styles.recentHeader}>
              <span style={styles.recentIcon}>📜</span>
              <h3 style={styles.recentTitle}>最近のがんばり</h3>
            </div>
            <ul style={styles.recentList}>
              {recentLogs.slice(0, 5).map((log, i) => (
                <li key={i} style={styles.recentItem}>
                  <span style={styles.recentDate}>
                    {/* ★ 修正：安全な日付パース関数を使用 */}
                    {formatShortDate(log.date)}
                  </span>
                  <span style={styles.recentText}>
                    {log.task_text}
                    <span style={styles.recentScore}>
                      {' '}★{log.score}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 区切り */}
        <Divider label="📝 きょうの評価" />

        {/* 全評価済みアラート */}
        {allTasksDone && (
          <div style={styles.allDoneBox}>
            <span style={styles.allDoneIcon}>✅</span>
            <div>
              <div style={styles.allDoneTitle}>きょうは評価済み！</div>
              <div style={styles.allDoneDetail}>
                すべての課題を評価しました。明日また稽古を見守ろう。
              </div>
            </div>
          </div>
        )}

        {/* 課題評価リスト */}
        <section style={styles.taskSection}>
          <div style={styles.taskHeader}>
            <span style={styles.taskIcon}>⚔️</span>
            <h3 style={styles.taskTitle}>課題の評価</h3>
            <span style={styles.taskCount}>
              {evalCount}/{evaluableTasks.length} 評価中
            </span>
          </div>
          <div style={styles.taskList}>
            {sortedTasks.map((task, i) => (
              <TeacherTaskRater
                key={task.id}
                index={i}
                taskId={task.id}
                taskText={task.taskText}
                score={taskScores[task.id] ?? 0}
                alreadyEvaluated={todayEvaluatedTaskIds.includes(task.id)}
                onChange={(score) => handleScoreChange(task.id, score)}
                criteriaExpanded={expandedTaskId === task.id}
                onToggleCriteria={() =>
                  setExpandedTaskId(prev => (prev === task.id ? null : task.id))
                }
                comment={taskComments[task.id] ?? ''}
                onCommentChange={(value) => handleCommentChange(task.id, value)}
                commentExpanded={expandedCommentTaskId === task.id}
                onToggleComment={() =>
                  setExpandedCommentTaskId(prev => (prev === task.id ? null : task.id))
                }
              />
            ))}
          </div>
        </section>

        {/* フッター余白 */}
        <div style={{ height: 160 }} />
      </div>

      {/* 固定フッター */}
      {!allTasksDone && (
        <footer style={styles.fixedFooter}>
          <div style={styles.footerInner}>
            <div style={styles.previewBar}>
              <div style={styles.previewLeft}>
                <span style={styles.previewIcon}>🔥</span>
                <span style={styles.previewLabel}>付与する経験値</span>
              </div>
              <div style={styles.previewRight}>
                <span style={styles.previewXp}>+{xpPreview}</span>
                <span style={styles.previewUnit}>XP</span>
                <span style={styles.previewBoost}>×10!</span>
              </div>
            </div>

            {submitError && (
              <div role="alert" style={styles.errorBox}>
                ⚠️ {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || evalCount === 0}
              style={{
                ...styles.submitBtn,
                ...(submitting || evalCount === 0 ? styles.submitBtnDisabled : {}),
              }}
              onTouchStart={(e) => {
                if (!submitting && evalCount > 0) {
                  e.currentTarget.style.transform = 'scale(0.97)';
                }
              }}
              onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
              onMouseDown={(e) => {
                if (!submitting && evalCount > 0) {
                  e.currentTarget.style.transform = 'scale(0.97)';
                }
              }}
              onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {submitting ? (
                <>
                  <span style={styles.spinner} aria-hidden="true" />
                  <span>送信中…</span>
                </>
              ) : evalCount === 0 ? (
                <>
                  <span>🤔 課題を評価しよう</span>
                </>
              ) : (
                <>
                  <span style={styles.submitIcon}>⚡</span>
                  <span>評価を送信！</span>
                  <span style={styles.submitBoostBadge}>×10倍</span>
                </>
              )}
            </button>
          </div>
        </footer>
      )}

      {/* 成功モーダル */}
      {success && (
        <SuccessModal
          xp={success.xp}
          studentName={student.name}
          onContinue={handleSuccessContinue}
          onBack={handleSuccessBack}
        />
      )}

      <style>{`
        @keyframes burning_record_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes burning_boost_pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// 区切り
// =====================================================================
function Divider({ label }: { label: string }) {
  return (
    <div style={styles.divider}>
      <div style={styles.dividerLine} />
      <span style={styles.dividerLabel}>{label}</span>
      <div style={styles.dividerLine} />
    </div>
  );
}

// =====================================================================
// 成功モーダル
// =====================================================================
function SuccessModal({
  xp, studentName, onContinue, onBack,
}: {
  xp:          number;
  studentName: string;
  onContinue:  () => void;
  onBack:      () => void;
}) {
  return (
    <div style={modalStyles.overlay} role="dialog" aria-modal="true">
      <style>{`
        @keyframes burning_success_in {
          from { transform: scale(0.7) translateY(20px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes burning_success_aura {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes burning_success_xp {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div style={modalStyles.modal}>
        <div style={modalStyles.aura} aria-hidden="true" />

        <div style={modalStyles.checkmark}>✅</div>
        <h2 style={modalStyles.title}>評価完了！</h2>
        <p style={modalStyles.subtitle}>
          <strong style={{ color: '#FFD700' }}>{studentName}</strong> に修行値を授けた
        </p>

        <div style={modalStyles.xpBox}>
          <div style={modalStyles.xpLabel}>付与した経験値</div>
          <div style={modalStyles.xpValueRow}>
            <span style={modalStyles.xpPlus}>+</span>
            <span style={modalStyles.xpValue}>{xp}</span>
            <span style={modalStyles.xpUnit}>XP</span>
          </div>
          <div style={modalStyles.xpBoost}>師範ボーナス ×10倍！</div>
        </div>

        <div style={modalStyles.btnRow}>
          <button
            type="button"
            onClick={onContinue}
            style={modalStyles.continueBtn}
          >
            ⚔️ 続けて評価
          </button>
          <button
            type="button"
            onClick={onBack}
            style={modalStyles.backBtn}
          >
            一覧にもどる
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// スタイル
// =====================================================================
const styles: Record<string, React.CSSProperties> = {
  // === 土台 ===
  outer: {
    position:        'relative',
    minHeight:       '100vh',
    width:           '100%',
    backgroundColor: THEME.bg,
  },
  bgPattern: {
    position: 'fixed',
    inset:    0,
    background: `
      radial-gradient(circle at 15% 8%, rgba(255,68,68,0.22) 0%, transparent 38%),
      radial-gradient(circle at 85% 92%, rgba(255,215,0,0.10) 0%, transparent 35%),
      radial-gradient(circle at 50% 50%, rgba(0,0,0,0.18) 0%, transparent 70%),
      linear-gradient(180deg, ${THEME.bgSoft} 0%, ${THEME.bg} 55%, ${THEME.primaryDark} 100%)
    `,
    zIndex:        0,
    pointerEvents: 'none',
  },
  container: {
    position:      'relative',
    zIndex:        1,
    maxWidth:      '720px',
    margin:        '0 auto',
    padding:       '12px 14px 0',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },

  // === ヘッダーバー ===
  headerBar: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '10px 12px',
    backgroundColor: THEME.bgCard,
    borderRadius:   '12px',
    border:         `2px solid ${THEME.primary}`,
    boxShadow:      '0 4px 16px rgba(178,34,34,0.30), inset 0 0 30px rgba(178,34,34,0.10)',
  },
  backBtn: {
    padding:         '6px 12px',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          `1.5px solid ${THEME.primary}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    minWidth:        '60px',
    letterSpacing:   '0.05em',
  },
  headerTitleBox: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  headerLogo: {
    fontSize: '20px',
  },
  headerTitle: {
    fontSize:   '16px',
    fontWeight: 900,
    color:      '#FFD700',
    letterSpacing: '0.05em',
    textShadow: '0 0 8px rgba(255,215,0,0.4)',
  },

  // === 生徒カード ===
  studentCard: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '14px 16px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.45), inset 0 0 24px rgba(178,34,34,0.10)',
  },
  studentTop: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
  },
  studentIcon: {
    fontSize:    '36px',
    flexShrink:  0,
    filter:      'drop-shadow(0 0 8px rgba(255,215,0,0.4))',
  },
  studentInfo: {
    flex:     1,
    minWidth: 0,
  },
  studentNameRow: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        '8px',
    flexWrap:   'wrap',
  },
  studentName: {
    fontSize:      '20px',
    fontWeight:    900,
    color:         '#FFFFFF',
    letterSpacing: '0.02em',
    textShadow:    '0 1px 2px rgba(0,0,0,0.5)',
  },
  studentGrade: {
    fontSize:        '11px',
    fontWeight:      700,
    color:           'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding:         '2px 8px',
    borderRadius:    '999px',
    border:          '1px solid rgba(255,255,255,0.2)',
  },
  studentTitle: {
    fontSize:   '13px',
    fontWeight: 900,
    marginTop:  '3px',
  },
  studentLevel: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    flexShrink:     0,
  },
  studentLvLabel: {
    fontSize:      '9px',
    fontWeight:    700,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: '0.15em',
  },
  studentLvNum: {
    fontSize:   '24px',
    fontWeight: 900,
    lineHeight: 1.1,
  },
  studentBottom: {
    marginTop:     '12px',
    paddingTop:    '10px',
    borderTop:     '1px dashed rgba(255,255,255,0.18)',
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  },
  studentXpBox: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'baseline',
  },
  studentXpLabel: {
    fontSize:      '11px',
    fontWeight:    700,
    color:         'rgba(255,255,255,0.65)',
    letterSpacing: '0.1em',
  },
  studentXpNum: {
    fontSize:   '15px',
    fontWeight: 900,
    color:      '#FFD700',
    textShadow: '0 0 6px rgba(255,215,0,0.5)',
  },
  studentCatchphrase: {
    fontSize:        '12px',
    color:           '#FFD700',
    fontStyle:       'italic',
    backgroundColor: 'rgba(255,215,0,0.10)',
    padding:         '6px 10px',
    borderRadius:    '6px',
    border:          `1px dashed ${THEME.accent}`,
    textShadow:      '0 0 4px rgba(255,215,0,0.4)',
  },

  // === 最近の稽古 ===
  recentSection: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '12px',
    padding:         '12px 14px',
    border:          '1px solid rgba(255,255,255,0.15)',
    boxShadow:       '0 2px 12px rgba(0,0,0,0.40)',
  },
  recentHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          '6px',
    marginBottom: '8px',
  },
  recentIcon: {
    fontSize: '16px',
  },
  recentTitle: {
    margin:        0,
    fontSize:      '13px',
    fontWeight:    900,
    color:         '#FFD700',
    textShadow:    '0 0 4px rgba(255,215,0,0.4)',
    letterSpacing: '0.05em',
  },
  recentList: {
    listStyle:     'none',
    margin:        0,
    padding:       0,
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  },
  recentItem: {
    display:     'flex',
    alignItems:  'baseline',
    gap:         '8px',
    fontSize:    '12px',
    paddingLeft: '8px',
    borderLeft:  `2px solid ${THEME.primary}`,
  },
  recentDate: {
    fontSize:   '10px',
    fontWeight: 800,
    color:      '#FFD700',
    flexShrink: 0,
    minWidth:   '38px',
    textShadow: '0 0 4px rgba(255,215,0,0.4)',
  },
  recentText: {
    color:      '#FFFFFF',
    lineHeight: 1.5,
    flex:       1,
  },
  recentScore: {
    color:      '#FFD700',
    fontWeight: 900,
    fontSize:   '12px',
    textShadow: '0 0 4px rgba(255,215,0,0.5)',
  },

  // === 区切り ===
  divider: {
    display:      'flex',
    alignItems:   'center',
    gap:          '10px',
    marginTop:    '4px',
    marginBottom: '-4px',
  },
  dividerLine: {
    flex:       1,
    height:     '2px',
    background: `linear-gradient(90deg, transparent, ${THEME.primary} 50%, transparent)`,
  },
  dividerLabel: {
    fontSize:        '12px',
    fontWeight:      900,
    color:           '#FFD700',
    letterSpacing:   '0.15em',
    padding:         '4px 12px',
    backgroundColor: THEME.bgCard,
    border:          `1px solid ${THEME.primary}`,
    borderRadius:    '999px',
    textShadow:      '0 0 6px rgba(255,215,0,0.4)',
    boxShadow:       '0 0 12px rgba(178,34,34,0.30)',
  },

  // === 全評価済み ===
  allDoneBox: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
    padding:    '14px',
    backgroundColor: 'rgba(30,124,58,0.18)',
    border:     '1px solid #7FFFAA',
    borderLeft: '4px solid #7FFFAA',
    borderRadius: '10px',
    boxShadow:  'inset 0 0 16px rgba(30,124,58,0.20)',
  },
  allDoneIcon: {
    fontSize:    '28px',
    flexShrink:  0,
    filter:      'drop-shadow(0 0 6px rgba(127,255,170,0.5))',
  },
  allDoneTitle: {
    fontSize:     '14px',
    fontWeight:   900,
    color:        '#7FFFAA',
    marginBottom: '2px',
    textShadow:   '0 0 6px rgba(127,255,170,0.5)',
  },
  allDoneDetail: {
    fontSize:   '12px',
    color:      'rgba(255,255,255,0.85)',
    lineHeight: 1.5,
  },

  // === 課題セクション ===
  taskSection: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '14px 12px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 6px 24px rgba(0,0,0,0.55), inset 0 0 30px rgba(178,34,34,0.10)',
  },
  taskHeader: {
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
    marginBottom:  '12px',
    paddingBottom: '8px',
    borderBottom:  `2px solid ${THEME.primary}`,
  },
  taskIcon: {
    fontSize: '20px',
  },
  taskTitle: {
    margin:        0,
    fontSize:      '17px',
    fontWeight:    900,
    color:         '#FFD700',
    flex:          1,
    letterSpacing: '0.05em',
    textShadow:    '0 0 6px rgba(255,215,0,0.4)',
  },
  taskCount: {
    fontSize:        '11px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding:         '3px 10px',
    borderRadius:    '999px',
    border:          '1px solid rgba(255,255,255,0.2)',
    letterSpacing:   '0.05em',
  },
  taskList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },

  // === 固定フッター ===
  fixedFooter: {
    position:        'fixed',
    bottom:          'calc(64px + env(safe-area-inset-bottom, 0))',
    left:            0,
    right:           0,
    backgroundColor: THEME.bgCard,
    borderTop:       `3px solid ${THEME.primary}`,
    boxShadow:       '0 -4px 24px rgba(178,34,34,0.40)',
    zIndex:          50,
  },
  footerInner: {
    maxWidth:      '720px',
    margin:        '0 auto',
    padding:       '10px 14px 12px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
  },
  previewBar: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         '8px 14px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    '8px',
    border:          `1px solid ${THEME.primary}`,
    boxShadow:       'inset 0 0 12px rgba(178,34,34,0.20)',
  },
  previewLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  previewIcon: {
    fontSize: '18px',
  },
  previewLabel: {
    fontSize:   '13px',
    fontWeight: 700,
    color:      'rgba(255,255,255,0.8)',
  },
  previewRight: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        '4px',
  },
  previewXp: {
    fontSize:   '24px',
    fontWeight: 900,
    color:      '#FFD700',
    lineHeight: 1,
    textShadow: '0 0 8px rgba(255,215,0,0.6)',
  },
  previewUnit: {
    fontSize:   '13px',
    fontWeight: 900,
    color:      '#FFFFFF',
  },
  previewBoost: {
    fontSize:        '11px',
    fontWeight:      900,
    color:           '#2D0B0B',
    backgroundColor: '#FFD700',
    padding:         '2px 6px',
    borderRadius:    '4px',
    marginLeft:      '4px',
    animation:       'burning_boost_pulse 1.4s ease-in-out infinite',
    boxShadow:       '0 0 10px rgba(255,215,0,0.7)',
  },
  errorBox: {
    padding:         '8px 12px',
    backgroundColor: 'rgba(220,20,60,0.18)',
    border:          '1px solid #FF5555',
    borderRadius:    '6px',
    color:           '#FFCCCC',
    fontSize:        '12px',
    fontWeight:      900,
    textShadow:      '0 1px 2px rgba(0,0,0,0.5)',
  },
  submitBtn: {
    width:           '100%',
    minHeight:       '54px',
    padding:         '14px',
    fontSize:        '18px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 16px rgba(255,215,0,0.30), 0 0 24px rgba(178,34,34,0.40)`,
    letterSpacing:   '0.1em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
    WebkitTapHighlightColor: 'transparent',
    textShadow:      '0 1px 2px rgba(0,0,0,0.6)',
  },
  submitBtnDisabled: {
    opacity:    0.65,
    cursor:     'not-allowed',
    background: `linear-gradient(180deg, #5A2C2C 0%, #3A1818 100%)`,
    boxShadow:  '0 4px 0 #1A0505',
    color:      'rgba(255,255,255,0.85)',
    border:     '2px solid rgba(255,255,255,0.25)',
  },
  submitIcon: {
    fontSize: '22px',
  },
  submitBoostBadge: {
    fontSize:        '12px',
    fontWeight:      900,
    color:           '#2D0B0B',
    backgroundColor: '#FFD700',
    padding:         '3px 8px',
    borderRadius:    '4px',
    boxShadow:       '0 0 10px rgba(255,215,0,0.8)',
  },
  spinner: {
    display:        'inline-block',
    width:          '20px',
    height:         '20px',
    border:         '3px solid rgba(255,255,255,0.4)',
    borderTopColor: '#FFFFFF',
    borderRadius:   '50%',
    animation:      'burning_record_spin 0.8s linear infinite',
  },

  // === ローディング ===
  loadingBox: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '32px',
    backgroundColor: THEME.bg,
    background: `
      radial-gradient(circle at 50% 30%, rgba(178,34,34,0.20) 0%, transparent 50%),
      linear-gradient(180deg, ${THEME.bgSoft} 0%, ${THEME.bg} 100%)
    `,
    textAlign:      'center',
  },
  loadingFlame: {
    fontSize:     '64px',
    animation:    'burning_load_flame 1.4s ease-in-out infinite',
    marginBottom: '16px',
    filter:       'drop-shadow(0 0 12px rgba(255,68,68,0.6))',
  },
  loadingText: {
    fontSize:      '15px',
    fontWeight:    900,
    color:         '#FFD700',
    margin:        0,
    textShadow:    '0 0 6px rgba(255,215,0,0.5)',
    letterSpacing: '0.1em',
  },
  errorBtn: {
    marginTop:     '20px',
    padding:       '12px 28px',
    fontSize:      '15px',
    fontWeight:    900,
    color:         '#FFFFFF',
    background:    `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:        '2px solid #FFD700',
    borderRadius:  '8px',
    cursor:        'pointer',
    letterSpacing: '0.05em',
  },
};

// =====================================================================
// 成功モーダル スタイル
// =====================================================================
const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position:        'fixed',
    inset:           0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '20px',
    zIndex:          1000,
    backdropFilter:  'blur(4px)',
  },
  modal: {
    position:        'relative',
    width:           '100%',
    maxWidth:        '420px',
    backgroundColor: THEME.bgCard,
    borderRadius:    '20px',
    border:          '3px solid #FFD700',
    padding:         '28px 24px 24px',
    boxShadow:       '0 16px 64px rgba(0,0,0,0.7), 0 0 32px rgba(255,215,0,0.35), 0 0 48px rgba(178,34,34,0.40)',
    animation:       'burning_success_in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    overflow:        'hidden',
    textAlign:       'center',
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
      rgba(255,215,0,0.30) 60deg,
      transparent 120deg,
      rgba(178,34,34,0.30) 180deg,
      transparent 240deg,
      rgba(255,215,0,0.30) 300deg,
      transparent 360deg
    )`,
    animation:     'burning_success_aura 8s linear infinite',
    pointerEvents: 'none',
    zIndex:        0,
  },
  checkmark: {
    position:     'relative',
    fontSize:     '56px',
    marginBottom: '8px',
    filter:       'drop-shadow(0 0 12px rgba(127,255,170,0.7))',
  },
  title: {
    position:      'relative',
    margin:        0,
    fontSize:      '26px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.08em',
    textShadow:    '0 0 12px rgba(255,215,0,0.7), 2px 2px 0 rgba(178,34,34,0.5)',
  },
  subtitle: {
    position: 'relative',
    margin:   '8px 0 16px',
    fontSize: '13px',
    color:    'rgba(255,255,255,0.85)',
  },
  xpBox: {
    position:        'relative',
    backgroundColor: 'rgba(255,215,0,0.10)',
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    padding:         '14px',
    marginBottom:    '20px',
    boxShadow:       'inset 0 0 16px rgba(255,215,0,0.18), 0 0 16px rgba(255,215,0,0.30)',
  },
  xpLabel: {
    fontSize:      '11px',
    fontWeight:    700,
    color:         'rgba(255,255,255,0.7)',
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
    color:      '#FFD700',
    textShadow: '0 0 8px rgba(255,215,0,0.6)',
  },
  xpValue: {
    fontSize:    '52px',
    fontWeight:  900,
    color:       '#FFD700',
    lineHeight:  1,
    textShadow:  '0 0 12px rgba(255,215,0,0.8), 2px 2px 0 rgba(178,34,34,0.5)',
    animation:   'burning_success_xp 0.6s ease-out',
  },
  xpUnit: {
    fontSize:   '20px',
    fontWeight: 900,
    color:      '#FFFFFF',
  },
  xpBoost: {
    fontSize:      '12px',
    fontWeight:    900,
    color:         '#FFD700',
    marginTop:     '4px',
    letterSpacing: '0.1em',
    textShadow:    '0 0 6px rgba(255,215,0,0.5)',
  },
  btnRow: {
    position:      'relative',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
  },
  continueBtn: {
    minHeight:     '48px',
    padding:       '12px',
    fontSize:      '15px',
    fontWeight:    900,
    color:         '#FFFFFF',
    background:    `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:        '2px solid #FFD700',
    borderRadius:  '10px',
    cursor:        'pointer',
    boxShadow:     `0 4px 0 ${THEME.primaryDark}, 0 0 16px rgba(255,215,0,0.40)`,
    letterSpacing: '0.05em',
    textShadow:    '0 1px 2px rgba(0,0,0,0.6)',
  },
  backBtn: {
    minHeight:       '44px',
    padding:         '10px',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          `1.5px solid ${THEME.primary}`,
    borderRadius:    '8px',
    cursor:          'pointer',
    letterSpacing:   '0.05em',
  },
};
