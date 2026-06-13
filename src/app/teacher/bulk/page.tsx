// src/app/teacher/bulk/page.tsx
// =====================================================================
// 燃えろ剣士 - 全体評価画面（熱血ダークテーマ版）
// 先生が複数生徒をまとめて評価 → XP5倍ボーナス付与
// =====================================================================

'use client';

export const runtime = 'edge';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useMyTeacherDashboardSWR,
  evaluateBulkStudents,
  useEvaluatedStudentIdsByDateSWR,
} from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME } from '@/types';

import TeacherTaskRater from '@/components/TeacherTaskRater';

/** 自己評価のベースXP（1スコアあたり） */
const BASE_XP_PER_SCORE = 5;
/** 全体評価の倍率 */
const BULK_MULTIPLIER = 5;

// =====================================================================
// 本日の日付（YYYY-MM-DD）をローカルタイム基準で取得するヘルパー
// new Date().toISOString() は UTC 基準のため、JST 深夜帯に前日へズレる。
// ローカルの年月日から直接組み立てることで日付ズレを防ぐ。
// =====================================================================
function getTodayLocal(): string {
  const d  = new Date();
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

interface TaskScoreMap {
  [taskId: string]: number;
}

interface TaskCommentMap {
  [taskId: string]: string;
}

export default function TeacherBulkEvalPage() {
  const router = useRouter();

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
  const { data, isLoading, error, mutate } = useMyTeacherDashboardSWR();

  // -----------------------------------------------------------------
  // 入力ステート
  // -----------------------------------------------------------------
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [taskScores, setTaskScores]         = useState<TaskScoreMap>({});
  const [taskComments, setTaskComments]     = useState<TaskCommentMap>({});
  // ★ 追加: 評価対象日（初期値は本日・ローカル基準）。カレンダーで過去日も選択可能。
  const [evalDate, setEvalDate]             = useState<string>(getTodayLocal());
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState('');
  const [success, setSuccess]               = useState<{ xp: number; count: number } | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedCommentTaskId, setExpandedCommentTaskId] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // ★ 追加: 選択日（evalDate）基準の「評価済み生徒ID」を取得。
  //         evalDate が変わるたびに自動で再取得され、二重評価を防止する。
  // -----------------------------------------------------------------
  const {
    data: evaluatedStudentIdsForDate,
    mutate: mutateEvaluatedStudentIds,
  } = useEvaluatedStudentIdsByDateSWR(teacherId, evalDate);

  // ★ 追加: 評価済み生徒IDが更新されたら、選択中リストから自動的に取り除く。
  //         （日付を切り替えた際、その日すでに評価済みの生徒が選択に残らないように）
  useEffect(() => {
    if (!evaluatedStudentIdsForDate || evaluatedStudentIdsForDate.length === 0) {
      return;
    }
    const evaluatedSet = new Set(evaluatedStudentIdsForDate);
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (evaluatedSet.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [evaluatedStudentIdsForDate]);

  // -----------------------------------------------------------------
  // XP合計プレビュー（スコア × ベース5 × 倍率5 → 1人あたりXP）
  // -----------------------------------------------------------------
  const xpPreview = useMemo(() => {
    return Object.values(taskScores)
      .filter(s => s > 0)
      .reduce((sum, s) => sum + s * BASE_XP_PER_SCORE * BULK_MULTIPLIER, 0);
  }, [taskScores]);

  const evalCount = useMemo(() => {
    return Object.values(taskScores).filter(s => s > 0).length;
  }, [taskScores]);

  // -----------------------------------------------------------------
  // ハンドラ：生徒選択
  // -----------------------------------------------------------------
  const toggleStudent = (studentId: string) => {
    // ★ 追加: 選択日にすでに評価済みの生徒は選択させない（二重評価防止）。
    const evaluatedSet = new Set(evaluatedStudentIdsForDate ?? []);
    if (evaluatedSet.has(studentId)) {
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    // ★ 修正: 評価済み判定を「選択日（evalDate）基準」に変更する。
    //         本日固定の evaluated_today_by_me ではなく、
    //         選択した日付に対してこの先生が評価済みの生徒を除外する。
    const evaluatedSet = new Set(evaluatedStudentIdsForDate ?? []);
    const selectableIds = data.students
      .filter((s) => !evaluatedSet.has(s.user_id))
      .map((s) => s.user_id);

    // すでに選択可能な全員が選ばれていれば全解除、そうでなければ全選択。
    const allSelectableSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.has(id));

    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  // -----------------------------------------------------------------
  // ハンドラ：課題評価
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

  // -----------------------------------------------------------------
  // ハンドラ：送信
  // -----------------------------------------------------------------
  const handleSubmit = async () => {
    if (submitting) return;
    if (selectedIds.size === 0) {
      setSubmitError('門下生を1人以上選んでください');
      return;
    }
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

        await evaluateBulkStudents({
          student_ids: Array.from(selectedIds),
          // ★ 追加: 選択中の評価対象日を渡す（全選択生徒に同じ日付で一括適用）。
          date:        evalDate,
          evaluations,
        });
  
        const grantedCount = selectedIds.size;
        const grantedXp    = xpPreview;
  
        setTaskScores({});
        setTaskComments({});
        setSelectedIds(new Set());
        setExpandedCommentTaskId(null);
  
        setSuccess({ xp: grantedXp, count: grantedCount });
  
        mutate();
        // ★ 追加: 選択日の評価済み生徒IDを再取得し、即座に二重評価を防ぐ。
        mutateEvaluatedStudentIds();
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
  // ローディング / エラー
  // -----------------------------------------------------------------
  if (!user || isLoading || !data) {
    return (
      <div style={styles.loadingBox}>
        <div style={styles.loadingFlame}>⚔️</div>
        <p style={styles.loadingText}>道場の記録を呼び出し中…</p>
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

  const taskMaster = data.taskMaster ?? [];
  const sortedTasks = [...taskMaster].sort((a, b) => a.display_order  - b.display_order );

  // ★ 修正: 評価済み判定を「選択日（evalDate）基準」に変更する。
  //         本日固定の evaluated_today_by_me ではなく、
  //         選択した日付にこの先生が評価済みの生徒を母数から除外する。
  const evaluatedStudentSet = new Set(evaluatedStudentIdsForDate ?? []);
  const selectableStudents = data.students.filter(
    (s) => !evaluatedStudentSet.has(s.user_id),
  );
  const allSelected =
    selectableStudents.length > 0 &&
    selectableStudents.every((s) => selectedIds.has(s.user_id));

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
            <span style={styles.headerLogo}>⚔️</span>
            <span style={styles.headerTitle}>全体評価</span>
          </div>
          <div style={{ width: 60 }} />
        </header>

        {/* 説明バナー */}
        <section style={styles.bannerCard}>
          <div style={styles.bannerIcon}>🔥</div>
          <div style={styles.bannerBody}>
            <div style={styles.bannerTitle}>道場全体に修行値を授ける</div>
            <div style={styles.bannerDetail}>
              選んだ門下生全員に、評価した課題のXPをまとめて付与します（×5倍ボーナス）。
            </div>
          </div>
        </section>

        {/* ★ 追加: 日付選択（過去の稽古をさかのぼって一括評価できる） */}
        <section style={styles.dateCard}>
          <label htmlFor="bulk-eval-date" style={styles.dateLabel}>
            <span style={styles.dateLabelIcon}>📅</span>
            <span>いつの評価？</span>
          </label>
          <input
            id="bulk-eval-date"
            type="date"
            value={evalDate}
            max={getTodayLocal()}
            onChange={(e) => setEvalDate(e.target.value || getTodayLocal())}
            style={styles.dateInput}
          />
        </section>

        {/* 区切り：生徒選択 */}
        <Divider label="👥 門下生をえらぶ" />

        {/* 生徒選択カード */}
        <section style={styles.studentSection}>
          <div style={styles.studentSelectHeader}>
            <span style={styles.studentSelectCount}>
              {/* ★ 修正: 母数を「選択可能（未評価）な人数」に変更 */}
              選択中：<strong style={styles.studentSelectCountNum}>{selectedIds.size}</strong> / {selectableStudents.length} 名
            </span>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                ...styles.toggleAllBtn,
                ...(allSelected ? styles.toggleAllBtnActive : {}),
              }}
              // ★ 追加: 選択可能な生徒が1人もいなければ「全員選択」を無効化
              disabled={selectableStudents.length === 0}
            >
              {allSelected ? '✗ 全員 解除' : '✓ 全員 選択'}
            </button>
          </div>

          <div style={styles.studentGrid}>
            {data.students.map((s) => {
              // ★ 修正: 「選択日（evalDate）基準」でこの先生が評価済みかを判定する。
              //         本日固定の evaluated_today_by_me ではなく、選択日の評価済みを参照。
              const isDone = evaluatedStudentSet.has(s.user_id);
              const isSelected = !isDone && selectedIds.has(s.user_id);
              return (
                <label
                  key={s.user_id}
                  style={{
                    ...styles.studentTile,
                    ...(isSelected ? styles.studentTileActive : {}),
                    // ★ 追加: 評価済みはグレーアウト＋カーソル変更
                    ...(isDone ? styles.studentTileDone : {}),
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleStudent(s.user_id)}
                    style={styles.hiddenCheckbox}
                    // ★ 追加: 評価済みはチェックボックス自体を無効化
                    disabled={isDone}
                  />
                  {isDone ? (
                    // ★ 追加: 評価済みバッジ（右上）
                    <div style={styles.tileDoneBadge}>評価済</div>
                  ) : (
                    <div style={{
                      ...styles.tileCheckBadge,
                      ...(isSelected ? styles.tileCheckBadgeActive : {}),
                    }}>
                      {isSelected ? '✓' : ''}
                    </div>
                  )}
                  <div style={styles.tileIcon}>
                    {isDone ? '✅' : isSelected ? '⚔️' : '👤'}
                  </div>
                  <div style={{
                    ...styles.tileName,
                    ...(isSelected ? styles.tileNameActive : {}),
                    ...(isDone ? styles.tileNameDone : {}),
                  }}>
                    {s.name}
                  </div>
                  {s.grade && (
                    <div style={{
                      ...styles.tileGrade,
                      ...(isSelected ? styles.tileGradeActive : {}),
                    }}>
                      {s.grade}年
                    </div>
                  )}
                </label>
              );
            })}
          </div>

          {data.students.length === 0 && (
            <div style={styles.emptyStudents}>
              門下生が登録されていません
            </div>
          )}
        </section>

        {/* 区切り：課題評価 */}
        <Divider label="📝 評価" />

        {/* 課題評価リスト */}
        <section style={styles.taskSection}>
          <div style={styles.taskHeader}>
            <span style={styles.taskIcon}>⚔️</span>
            <h3 style={styles.taskTitle}>課題の評価</h3>
            <span style={styles.taskCount}>
              {evalCount}/{sortedTasks.length} 評価中
            </span>
          </div>
          <div style={styles.taskList}>
            {sortedTasks.map((task, i) => (
              <TeacherTaskRater
                key={task.id}
                index={i}
                taskId={task.id}
                taskText={task.task_text}
                score={taskScores[task.id] ?? 0}
                alreadyEvaluated={false}
                multiplier={BULK_MULTIPLIER}
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

          {sortedTasks.length === 0 && (
            <div style={styles.emptyTasks}>
              課題マスタが登録されていません
            </div>
          )}
        </section>

        {/* フッター余白 */}
        <div style={{ height: 200 }} />
      </div>

      {/* 固定フッター */}
      <footer style={styles.fixedFooter}>
        <div style={styles.footerInner}>
          <div style={styles.previewBar}>
            <div style={styles.previewLeft}>
              <span style={styles.previewIcon}>🔥</span>
              <span style={styles.previewLabel}>1人あたりの経験値</span>
            </div>
            <div style={styles.previewRight}>
              <span style={styles.previewXp}>+{xpPreview}</span>
              <span style={styles.previewUnit}>XP</span>
              <span style={styles.previewBoost}>×{BULK_MULTIPLIER}!</span>
            </div>
          </div>

          <div style={styles.previewSubBar}>
            <span style={styles.previewSubLabel}>対象人数</span>
            <span style={styles.previewSubValue}>{selectedIds.size} 名</span>
            <span style={styles.previewSubSep}>×</span>
            <span style={styles.previewSubLabel}>評価課題</span>
            <span style={styles.previewSubValue}>{evalCount} 個</span>
          </div>

          {submitError && (
            <div role="alert" style={styles.errorBox}>
              ⚠️ {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedIds.size === 0 || evalCount === 0}
            style={{
              ...styles.submitBtn,
              ...(submitting || selectedIds.size === 0 || evalCount === 0
                ? styles.submitBtnDisabled
                : {}),
            }}
            onTouchStart={(e) => {
              if (!submitting && selectedIds.size > 0 && evalCount > 0) {
                e.currentTarget.style.transform = 'scale(0.97)';
              }
            }}
            onTouchEnd={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseDown={(e) => {
              if (!submitting && selectedIds.size > 0 && evalCount > 0) {
                e.currentTarget.style.transform = 'scale(0.97)';
              }
            }}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {submitting ? (
              <>
                <span style={styles.spinner} aria-hidden="true" />
                <span>送信中…</span>
              </>
            ) : selectedIds.size === 0 ? (
              <span>👥 門下生をえらぼう</span>
            ) : evalCount === 0 ? (
              <span>🤔 課題を評価しよう</span>
            ) : (
              <>
                <span style={styles.submitIcon}>⚡</span>
                <span>{selectedIds.size}名にまとめて送信！</span>
                <span style={styles.submitBoostBadge}>×{BULK_MULTIPLIER}倍</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* 成功モーダル */}
      {success && (
        <SuccessModal
          xp={success.xp}
          count={success.count}
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
        @keyframes burning_tile_pop {
          0%   { transform: scale(0.92); }
          60%  { transform: scale(1.04); }
          100% { transform: scale(1); }
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
  xp, count, onContinue, onBack,
}: {
  xp:         number;
  count:      number;
  onContinue: () => void;
  onBack:     () => void;
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
        <h2 style={modalStyles.title}>全体評価完了！</h2>
        <p style={modalStyles.subtitle}>
          <strong style={{ color: '#FFD700' }}>{count}名</strong> の門下生に修行値を授けた
        </p>

        <div style={modalStyles.xpBox}>
          <div style={modalStyles.xpLabel}>1人あたりの経験値</div>
          <div style={modalStyles.xpValueRow}>
            <span style={modalStyles.xpPlus}>+</span>
            <span style={modalStyles.xpValue}>{xp}</span>
            <span style={modalStyles.xpUnit}>XP</span>
          </div>
          <div style={modalStyles.xpBoost}>道場ボーナス ×5倍！</div>
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
    fontSize:      '16px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.05em',
    textShadow:    '0 0 8px rgba(255,215,0,0.4)',
  },

  // === 説明バナー ===
  bannerCard: {
    display:         'flex',
    alignItems:      'center',
    gap:             '12px',
    padding:         '12px 14px',
    backgroundColor: THEME.bgCard,
    borderRadius:    '12px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.45), inset 0 0 24px rgba(178,34,34,0.10)',
  },
  bannerIcon: {
    fontSize:   '32px',
    flexShrink: 0,
    filter:     'drop-shadow(0 0 8px rgba(255,68,68,0.5))',
  },
  bannerBody: {
    flex: 1,
  },
  bannerTitle: {
    fontSize:      '14px',
    fontWeight:    900,
    color:         '#FFD700',
    marginBottom:  '4px',
    textShadow:    '0 0 4px rgba(255,215,0,0.4)',
    letterSpacing: '0.05em',
  },
  bannerDetail: {
    fontSize:   '12px',
    color:      'rgba(255,255,255,0.85)',
    lineHeight: 1.5,
  },

  // === 日付選択カード ===
  dateCard: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    gap:             '12px',
    backgroundColor: THEME.bgCard,
    borderRadius:    '12px',
    padding:         '12px 14px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 4px 16px rgba(178,34,34,0.30), inset 0 0 24px rgba(178,34,34,0.10)',
    flexWrap:        'wrap',
  },
  dateLabel: {
    display:       'flex',
    alignItems:    'center',
    gap:           '6px',
    fontSize:      '14px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.05em',
    textShadow:    '0 0 6px rgba(255,215,0,0.4)',
  },
  dateLabelIcon: {
    fontSize: '18px',
  },
  dateInput: {
    flex:            '1 1 160px',
    minWidth:        '150px',
    padding:         '10px 12px',
    fontSize:        '16px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.30)',
    border:          `2px solid ${THEME.primary}`,
    borderRadius:    '8px',
    outline:         'none',
    letterSpacing:   '0.05em',
    colorScheme:     'dark',
    WebkitTapHighlightColor: 'transparent',
    boxShadow:       'inset 0 0 10px rgba(178,34,34,0.25)',
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

  // === 生徒選択セクション ===
  studentSection: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '14px 12px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 6px 24px rgba(0,0,0,0.55), inset 0 0 30px rgba(178,34,34,0.10)',
  },
  studentSelectHeader: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            '10px',
    marginBottom:   '12px',
    paddingBottom:  '8px',
    borderBottom:   `2px solid ${THEME.primary}`,
    flexWrap:       'wrap',
  },
  studentSelectCount: {
    fontSize:      '13px',
    fontWeight:    700,
    color:         'rgba(255,255,255,0.85)',
    letterSpacing: '0.05em',
  },
  studentSelectCountNum: {
    fontSize:   '18px',
    fontWeight: 900,
    color:      '#FFD700',
    textShadow: '0 0 6px rgba(255,215,0,0.5)',
    margin:     '0 4px',
  },
  toggleAllBtn: {
    padding:         '8px 16px',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          `2px solid ${THEME.primary}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    letterSpacing:   '0.05em',
    minHeight:       '38px',
    boxShadow:       '0 2px 8px rgba(178,34,34,0.30)',
    transition:      'all 0.15s ease',
  },
  toggleAllBtnActive: {
    backgroundColor: '#FFD700',
    color:           '#2D0B0B',
    border:          '2px solid #FFD700',
    boxShadow:       '0 2px 12px rgba(255,215,0,0.50), 0 0 16px rgba(255,215,0,0.35)',
    textShadow:      'none',
  },

  // === 生徒タイル（マトリクス） ===
  studentGrid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap:                 '8px',
  },
  studentTile: {
    position:        'relative',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '4px',
    padding:         '10px 6px',
    minHeight:       '92px',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border:          '2px solid rgba(255,255,255,0.15)',
    borderRadius:    '10px',
    cursor:          'pointer',
    transition:      'all 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
    userSelect:      'none',
  },
  studentTileActive: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    border:          '2px solid #FFD700',
    boxShadow:       '0 0 16px rgba(255,215,0,0.40), inset 0 0 12px rgba(255,215,0,0.15)',
    animation:       'burning_tile_pop 0.25s ease-out',
  },
  hiddenCheckbox: {
    position: 'absolute',
    width:    '1px',
    height:   '1px',
    opacity:  0,
    pointerEvents: 'none',
  },
  tileCheckBadge: {
    position:        'absolute',
    top:             '4px',
    right:           '4px',
    width:           '20px',
    height:          '20px',
    borderRadius:    '50%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    border:          '1.5px solid rgba(255,255,255,0.25)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '12px',
    fontWeight:      900,
    color:           '#2D0B0B',
    transition:      'all 0.15s ease',
  },
  tileCheckBadgeActive: {
    backgroundColor: '#FFD700',
    border:          '1.5px solid #FFD700',
    boxShadow:       '0 0 8px rgba(255,215,0,0.7)',
  },
  tileIcon: {
    fontSize:   '24px',
    lineHeight: 1,
    filter:     'drop-shadow(0 0 4px rgba(0,0,0,0.5))',
  },
  tileName: {
    fontSize:      '13px',
    fontWeight:    900,
    color:         '#FFFFFF',
    textAlign:     'center',
    lineHeight:    1.2,
    letterSpacing: '0.02em',
    textShadow:    '0 1px 2px rgba(0,0,0,0.6)',
    wordBreak:     'break-all',
  },
  tileNameActive: {
    color:      '#FFD700',
    textShadow: '0 0 6px rgba(255,215,0,0.6), 0 1px 2px rgba(0,0,0,0.6)',
  },
  tileGrade: {
    fontSize:        '10px',
    fontWeight:      700,
    color:           'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding:         '1px 6px',
    borderRadius:    '999px',
    border:          '1px solid rgba(255,255,255,0.15)',
  },
  tileGradeActive: {
    color:           '#2D0B0B',
    backgroundColor: '#FFD700',
    border:          '1px solid #FFD700',
  },

  // ★ 追加: 本日評価済みの生徒タイル（選択不可・グレーアウト）
  studentTileDone: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    border:          '2px dashed rgba(127,255,170,0.45)',
    cursor:          'not-allowed',
    opacity:         0.65,
    boxShadow:       'none',
  },
  // ★ 追加: 「評価済」バッジ（右上・緑系）
  tileDoneBadge: {
    position:        'absolute',
    top:             '4px',
    right:           '4px',
    padding:         '2px 6px',
    borderRadius:    '999px',
    backgroundColor: 'rgba(30,124,58,0.85)',
    border:          '1px solid #7FFFAA',
    fontSize:        '9px',
    fontWeight:      900,
    color:           '#EAFFF0',
    letterSpacing:   '0.05em',
    textShadow:      '0 0 4px rgba(127,255,170,0.6)',
    lineHeight:      1.2,
    whiteSpace:      'nowrap',
  },
  // ★ 追加: 評価済みタイルの名前（緑がかった淡色）
  tileNameDone: {
    color:      'rgba(234,255,240,0.75)',
    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  },

  emptyStudents: {
    padding:    '24px',
    textAlign:  'center',
    fontSize:   '13px',
    color:      'rgba(255,255,255,0.65)',
    fontWeight: 700,
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
  emptyTasks: {
    padding:    '24px',
    textAlign:  'center',
    fontSize:   '13px',
    color:      'rgba(255,255,255,0.65)',
    fontWeight: 700,
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
  previewSubBar: {
    display:        'flex',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            '6px',
    padding:        '4px 10px',
    fontSize:       '11px',
    color:          'rgba(255,255,255,0.75)',
    fontWeight:     700,
    letterSpacing:  '0.05em',
  },
  previewSubLabel: {
    color: 'rgba(255,255,255,0.6)',
  },
  previewSubValue: {
    color:      '#FFD700',
    fontWeight: 900,
    fontSize:   '13px',
    textShadow: '0 0 4px rgba(255,215,0,0.4)',
  },
  previewSubSep: {
    color:      'rgba(255,255,255,0.4)',
    fontWeight: 900,
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
    fontSize:        '17px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          '2px solid #FFD700',
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 16px rgba(255,215,0,0.30), 0 0 24px rgba(178,34,34,0.40)`,
    letterSpacing:   '0.08em',
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
