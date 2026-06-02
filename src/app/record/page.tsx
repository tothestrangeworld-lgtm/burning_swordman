// src/app/record/page.tsx
// =====================================================================
// 燃えよ剣士 - 修行記録画面
// 小学生剣士が「ポチポチ→記録！」で修行を可視化する核心画面
// =====================================================================

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMyDashboardSWR, saveLog } from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import {
  THEME,
  TechniqueId,
  QuantityLevel,
  QualityLevel,
  SaveLogPayload,
  SaveLogResponse,
  calcSelfTaskXp,
  calcTechniqueXp,
} from '@/types';

import TaskRater          from '@/components/TaskRater';
import TechniqueRecorder  from '@/components/TechniqueRecorder';
import ResultModal        from '@/components/ResultModal';

// 入力ステート
interface TaskScoreMap {
  [taskId: string]: number; // 0=未評価, 1〜5
}

interface TechInput {
  quantity: QuantityLevel | 0;
  quality:  QualityLevel  | 0;
}

interface TechInputMap {
  [techId: string]: TechInput;
}

export default function RecordPage() {
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
    if (user.role === 'teacher') {
      router.replace('/teacher');
      return;
    }
  }, [router]);

  // -----------------------------------------------------------------
  // ダッシュボードデータ取得（マスター情報を再利用）
  // -----------------------------------------------------------------
  const { data, isLoading, error, mutate } = useMyDashboardSWR();

  // -----------------------------------------------------------------
  // 入力ステート
  // -----------------------------------------------------------------
  const [taskScores, setTaskScores] = useState<TaskScoreMap>({});
  const [techInputs, setTechInputs] = useState<TechInputMap>({});

  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult]           = useState<SaveLogResponse | null>(null);
  const [prevLevel, setPrevLevel]     = useState(1);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // XP合計プレビュー
  // -----------------------------------------------------------------
  const xpPreview = useMemo(() => {
    const fromTasks = Object.values(taskScores)
      .filter(s => s > 0)
      .reduce((sum, s) => sum + calcSelfTaskXp(s), 0);

    const fromTechs = Object.values(techInputs)
      .filter(t => t.quantity > 0 && t.quality > 0)
      .reduce((sum, t) => sum + calcTechniqueXp(
        t.quantity as QuantityLevel,
        t.quality  as QualityLevel,
      ), 0);

    return {
      fromTasks,
      fromTechs,
      total: fromTasks + fromTechs,
    };
  }, [taskScores, techInputs]);

  // 入力数カウント
  const inputCount = useMemo(() => {
    const taskCount = Object.values(taskScores).filter(s => s > 0).length;
    const techCount = Object.values(techInputs).filter(
      t => t.quantity > 0 && t.quality > 0,
    ).length;
    return { taskCount, techCount, total: taskCount + techCount };
  }, [taskScores, techInputs]);

  // -----------------------------------------------------------------
  // ハンドラ
  // -----------------------------------------------------------------
  const handleTaskChange = (taskId: string, score: number) => {
    setTaskScores(prev => {
      if (score === 0) {
        const { [taskId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [taskId]: score };
    });
  };

  const handleTechChange = (techId: TechniqueId, q: QuantityLevel | 0, ql: QualityLevel | 0) => {
    setTechInputs(prev => {
      if (q === 0 && ql === 0) {
        const { [techId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [techId]: { quantity: q, quality: ql } };
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (inputCount.total === 0) {
      setSubmitError('課題か技を1つは記録しよう！');
      return;
    }

    setSubmitError('');
    setSubmitting(true);
    setPrevLevel(data?.status.level ?? 1);

    try {
      const today = new Date().toISOString().slice(0, 10);

      const taskEvals = Object.entries(taskScores)
        .filter(([, s]) => s > 0)
        .map(([task_id, score]) => ({ task_id, score }));

      const techniques = Object.entries(techInputs)
        .filter(([, t]) => t.quantity > 0 && t.quality > 0)
        .map(([technique_id, t]) => ({
          technique_id: technique_id as TechniqueId,
          quantity:     t.quantity as QuantityLevel,
          quality:      t.quality  as QualityLevel,
        }));

      const payload: SaveLogPayload = {
        action: 'saveLog',
        date:   today,
        ...(taskEvals.length  ? { taskEvals  } : {}),
        ...(techniques.length ? { techniques } : {}),
      };

      const res = await saveLog(payload);
      setResult(res);

      // ダッシュボードキャッシュ更新
      mutate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '記録に失敗しました';
      setSubmitError(msg);
      setSubmitting(false);
    }
  };

  const handleResultClose = () => {
    setResult(null);
    setSubmitting(false);
    router.replace('/');
  };

  // -----------------------------------------------------------------
  // ローディング
  // -----------------------------------------------------------------
  if (isLoading || !data) {
    return (
      <div style={styles.loadingBox}>
        <div style={styles.loadingFlame}>🔥</div>
        <p style={styles.loadingText}>修行の準備中…</p>
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
        <p style={styles.loadingText}>道場に繋がらないよ…</p>
        <button
          style={styles.errorRetry}
          onClick={() => router.replace('/')}
        >
          ホームにもどる
        </button>
      </div>
    );
  }

  const { taskMaster, techniqueMaster } = data;
  const sortedTasks = [...taskMaster].sort((a, b) => a.displayOrder - b.displayOrder);
  const sortedTechs = [...techniqueMaster].sort((a, b) => a.displayOrder - b.displayOrder);

  // -----------------------------------------------------------------
  // メインビュー
  // -----------------------------------------------------------------
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヘッダーバー */}
        <header style={styles.headerBar}>
          <button
            type="button"
            onClick={() => router.replace('/')}
            style={styles.backBtn}
            aria-label="もどる"
          >
            ← もどる
          </button>
          <div style={styles.headerTitleBox}>
            <span style={styles.headerLogo}>📝</span>
            <span style={styles.headerTitle}>修行を記録する</span>
          </div>
          <div style={{ width: 60 }} />
        </header>

        {/* イントロ */}
        <section style={styles.introCard}>
          <div style={styles.introIcon}>⚔️</div>
          <h2 style={styles.introTitle}>
            今日の稽古をきろくしよう！
          </h2>
          <p style={styles.introSub}>
            できたところを ★ でつけて、技は「量」と「質」で記録だ！
          </p>
        </section>

        {/* === 1. 固定課題セクション === */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>📜</span>
            <h3 style={styles.sectionTitle}>きょうの課題</h3>
            <span style={styles.sectionCount}>
              {inputCount.taskCount}/{sortedTasks.length} 評価ずみ
            </span>
          </div>

          <div style={styles.cardList}>
            {sortedTasks.map((task, i) => (
              <TaskRater
                key={task.id}
                index={i}
                taskId={task.id}
                taskText={task.taskText}
                score={taskScores[task.id] ?? 0}
                onChange={(score) => handleTaskChange(task.id, score)}
                criteriaExpanded={expandedTaskId === task.id}
                onToggleCriteria={() =>
                  setExpandedTaskId(prev => (prev === task.id ? null : task.id))
                }
              />
            ))}
          </div>
        </section>

        {/* === 2. 技セクション === */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionIcon}>⚔️</span>
            <h3 style={styles.sectionTitle}>きょうの技</h3>
            <span style={styles.sectionCount}>
              {inputCount.techCount}/{sortedTechs.length} 記録ずみ
            </span>
          </div>

          <div style={styles.cardList}>
            {sortedTechs.map((tech) => {
              const input = techInputs[tech.id] ?? { quantity: 0, quality: 0 };
              return (
                <TechniqueRecorder
                  key={tech.id}
                  techniqueId={tech.id}
                  techniqueName={tech.name}
                  quantity={input.quantity}
                  quality={input.quality}
                  onChange={(q, ql) => handleTechChange(tech.id, q, ql)}
                />
              );
            })}
          </div>
        </section>

        {/* 余白（フローティングボタン分） */}
        <div style={{ height: 140 }} />
      </div>

      {/* === 固定フッター（記録ボタン） === */}
      <footer style={styles.fixedFooter}>
        <div style={styles.footerInner}>
          {/* XPプレビュー */}
          <div style={styles.previewBar}>
            <div style={styles.previewLeft}>
              <span style={styles.previewIcon}>🔥</span>
              <span style={styles.previewLabel}>獲得予定</span>
            </div>
            <div style={styles.previewRight}>
              <span style={styles.previewXp}>+{xpPreview.total}</span>
              <span style={styles.previewUnit}>XP</span>
            </div>
          </div>

          {/* エラー */}
          {submitError && (
            <div role="alert" style={styles.errorBox}>
              ⚠️ {submitError}
            </div>
          )}

          {/* 記録ボタン */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || inputCount.total === 0}
            style={{
              ...styles.submitBtn,
              ...(submitting || inputCount.total === 0 ? styles.submitBtnDisabled : {}),
            }}
            onTouchStart={(e) => {
              if (!submitting && inputCount.total > 0) {
                e.currentTarget.style.transform = 'scale(0.97)';
              }
            }}
            onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseDown={(e) => {
              if (!submitting && inputCount.total > 0) {
                e.currentTarget.style.transform = 'scale(0.97)';
              }
            }}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {submitting ? (
              <>
                <span style={styles.spinner} aria-hidden="true" />
                <span>修行中…</span>
              </>
            ) : inputCount.total === 0 ? (
              <>
                <span>🤔 何か記録してね</span>
              </>
            ) : (
              <>
                <span style={styles.submitIcon}>⚔️</span>
                <span>記録する！</span>
                <span style={styles.submitSubIcon}>🔥</span>
              </>
            )}
          </button>
        </div>
      </footer>

      {/* 結果モーダル */}
      <ResultModal
        open={result !== null}
        result={result}
        prevLevel={prevLevel}
        titleMaster={data.titleMaster}
        onClose={handleResultClose}
      />

      <style>{`
        @keyframes burning_record_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outer: {
    position:        'relative',
    minHeight:       '100vh',
    width:           '100%',
    backgroundColor: THEME.bgSoft,
  },
  bgPattern: {
    position: 'fixed',
    inset:    0,
    background: `
      radial-gradient(circle at 10% 5%, rgba(178,34,34,0.04) 0%, transparent 30%),
      radial-gradient(circle at 90% 95%, rgba(255,215,0,0.04) 0%, transparent 30%),
      linear-gradient(180deg, ${THEME.bg} 0%, ${THEME.bgSoft} 100%)
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
    gap:           '14px',
  },

  // ヘッダーバー
  headerBar: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '10px 12px',
    backgroundColor: '#FFFFFF',
    borderRadius:   '12px',
    border:         `2px solid ${THEME.primary}`,
    boxShadow:      '0 2px 8px rgba(178,34,34,0.10)',
  },
  backBtn: {
    padding:         '6px 12px',
    fontSize:        '13px',
    fontWeight:      700,
    color:           THEME.primaryDark,
    backgroundColor: '#FFFFFF',
    border:          `1.5px solid ${THEME.primary}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    minWidth:        '60px',
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
    color:      THEME.primary,
    letterSpacing: '0.05em',
  },

  // イントロ
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '14px',
    padding:         '16px',
    border:          `2px dashed ${THEME.primary}`,
    textAlign:       'center',
  },
  introIcon: {
    fontSize: '40px',
    marginBottom: '4px',
  },
  introTitle: {
    margin:     '4px 0 6px',
    fontSize:   '18px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },
  introSub: {
    margin:    0,
    fontSize:  '13px',
    color:     THEME.textMuted,
    lineHeight: 1.5,
  },

  // セクション共通
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius:    '16px',
    padding:         '16px 14px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       `0 4px 16px rgba(178, 34, 34, 0.08)`,
  },
  sectionHeader: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom:  `2px solid ${THEME.primary}`,
  },
  sectionIcon: {
    fontSize: '20px',
  },
  sectionTitle: {
    margin:     0,
    fontSize:   '17px',
    fontWeight: 900,
    color:      THEME.primaryDark,
    flex:       1,
  },
  sectionCount: {
    fontSize:        '11px',
    fontWeight:      700,
    color:           THEME.textMuted,
    backgroundColor: '#FFF8F8',
    padding:         '3px 10px',
    borderRadius:    '999px',
    border:          `1px solid ${THEME.border}`,
  },
  cardList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },

  // 固定フッター
  fixedFooter: {
    position:        'fixed',
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: '#FFFFFF',
    borderTop:       `3px solid ${THEME.primary}`,
    boxShadow:       '0 -4px 16px rgba(178,34,34,0.15)',
    zIndex:          10,
  },
  footerInner: {
    maxWidth:      '720px',
    margin:        '0 auto',
    padding:       '12px 14px 14px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
  },
  previewBar: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        '8px 14px',
    backgroundColor: '#FFF8F8',
    borderRadius:   '8px',
    border:         `1px solid ${THEME.primary}`,
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
    color:      THEME.textMuted,
  },
  previewRight: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        '2px',
  },
  previewXp: {
    fontSize:   '24px',
    fontWeight: 900,
    color:      THEME.primary,
    lineHeight: 1,
  },
  previewUnit: {
    fontSize:   '13px',
    fontWeight: 900,
    color:      THEME.primaryDark,
  },
  errorBox: {
    padding:         '8px 12px',
    backgroundColor: '#FDECEA',
    border:          `1px solid #C0392B`,
    borderRadius:    '6px',
    color:           '#C0392B',
    fontSize:        '12px',
    fontWeight:      700,
  },
  submitBtn: {
    width:           '100%',
    minHeight:       '60px',
    padding:         '14px',
    fontSize:        '20px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, #D94545 0%, ${THEME.primary} 50%, ${THEME.primaryDark} 100%)`,
    border:          `2px solid ${THEME.primaryDark}`,
    borderRadius:    '12px',
    cursor:          'pointer',
    boxShadow:       `0 4px 0 ${THEME.primaryDark}, 0 6px 12px rgba(178,34,34,0.3)`,
    letterSpacing:   '0.1em',
    transition:      'transform 0.08s ease',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '10px',
    WebkitTapHighlightColor: 'transparent',
  },
  submitBtnDisabled: {
    opacity:    0.5,
    cursor:     'not-allowed',
    background: `linear-gradient(180deg, #C99 0%, #A77 100%)`,
    boxShadow:  '0 4px 0 #855',
  },
  submitIcon: {
    fontSize: '22px',
  },
  submitSubIcon: {
    fontSize: '20px',
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

  // ローディング
  loadingBox: {
    minHeight:      '100vh',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '32px',
    backgroundColor: THEME.bgSoft,
  },
  loadingFlame: {
    fontSize:  '64px',
    animation: 'burning_load_flame 1.4s ease-in-out infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize:   '15px',
    fontWeight: 700,
    color:      THEME.primaryDark,
    margin:     0,
  },
  errorRetry: {
    marginTop:       '20px',
    padding:         '12px 28px',
    fontSize:        '15px',
    fontWeight:      900,
    color:           '#FFFFFF',
    background:      `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:          'none',
    borderRadius:    '8px',
    cursor:          'pointer',
  },
};
