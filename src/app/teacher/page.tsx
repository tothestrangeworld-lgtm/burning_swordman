// src/app/teacher/page.tsx
// =====================================================================
// 燃えよ剣士 - 先生ダッシュボード（熱血ダークテーマ版）
// 先生がスマホで担当生徒を一覧→タップして個別評価へ
// =====================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMyTeacherDashboardSWR } from '@/lib/api';
import { getAuthUser } from '@/lib/auth';
import { THEME, TitleMasterEntry } from '@/types';

import StudentListCard from '@/components/StudentListCard';

type SortKey = 'name' | 'level' | 'recent' | 'pinch';

export default function TeacherHomePage() {
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

  // -----------------------------------------------------------------
  // データ取得
  // -----------------------------------------------------------------
  const { data, isLoading, error, mutate } = useMyTeacherDashboardSWR();

  // -----------------------------------------------------------------
  // 検索・並べ替え
  // -----------------------------------------------------------------
  const [searchText, setSearchText] = useState('');
  const [sortKey,    setSortKey]    = useState<SortKey>('pinch');

  // 経過日数計算
  const daysSinceFn = (dateStr?: string | null): number => {
    if (!dateStr) return 9999;
    const last = new Date(dateStr);
    if (isNaN(last.getTime())) return 9999;
    return Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000));
  };

  // 学年表示
  const formatGrade = (grade: number): string => {
    if (!grade || grade < 1 || grade > 6) return '';
    return `${grade}年生`;
  };

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    let list = [...data.students];

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        formatGrade(s.grade).toLowerCase().includes(q),
      );
    }

    switch (sortKey) {
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        break;
      case 'level':
        list.sort((a, b) => b.level - a.level);
        break;
      case 'recent':
        list.sort((a, b) =>
          daysSinceFn(a.last_practice_date) - daysSinceFn(b.last_practice_date),
        );
        break;
      case 'pinch':
        list.sort((a, b) =>
          daysSinceFn(b.last_practice_date) - daysSinceFn(a.last_practice_date),
        );
        break;
    }

    return list;
  }, [data, searchText, sortKey]);

  const pinchCount = useMemo(() => {
    if (!data?.students) return 0;
    return data.students.filter(s =>
      daysSinceFn(s.last_practice_date) >= 3,
    ).length;
  }, [data]);

  const titleMaster: TitleMasterEntry[] = data?.titleMaster ?? [];

  // -----------------------------------------------------------------
  // ローディング
  // -----------------------------------------------------------------
  if (!user || isLoading || !data) {
    return <TeacherSkeleton />;
  }

  if (error) {
    return (
      <div style={styles.errorBox}>
        <div style={styles.errorIcon}>😣</div>
        <h2 style={styles.errorTitle}>道場に繋がらないよ…</h2>
        <p style={styles.errorMessage}>
          {error instanceof Error ? error.message : 'データの読み込みに失敗しました'}
        </p>
        <button
          style={styles.retryBtn}
          onClick={() => mutate()}
        >
          もう一度ためす
        </button>
      </div>
    );
  }

  const SORT_OPTIONS: { key: SortKey; label: string; emoji: string }[] = [
    { key: 'pinch',  label: 'ピンチ順',  emoji: '🔥' },
    { key: 'recent', label: '最近順',    emoji: '⏱' },
    { key: 'level',  label: 'レベル順',  emoji: '⚔️' },
    { key: 'name',   label: '名前順',    emoji: '📛' },
  ];

  // -----------------------------------------------------------------
  // メインビュー
  // -----------------------------------------------------------------
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />

      <div style={styles.container}>
        {/* ヘッダーバー */}
        <header style={styles.headerBar}>
          <div style={styles.headerLeft}>
            <span style={styles.headerLogo}>🥋</span>
            <span style={styles.headerTitle}>師範ダッシュボード</span>
          </div>
        </header>

        {/* 先生プロフィール */}
        <section style={styles.teacherCard}>
          <div style={styles.teacherIcon}>👨‍🏫</div>
          <div style={styles.teacherInfo}>
            <div style={styles.teacherLabel}>師範</div>
            <div style={styles.teacherName}>{data.teacher.name} 先生</div>
            <div style={styles.teacherStat}>
              門下生 <strong style={{ color: '#FFFFFF' }}>{data.students.length}名</strong>
              {pinchCount > 0 && (
                <>
                  {' '} ／ ピンチ
                  <strong style={{
                    color: '#FF6B6B',
                    marginLeft: 4,
                    textShadow: '0 0 6px rgba(255,107,107,0.6)',
                  }}>
                    {pinchCount}名
                  </strong>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ピンチアラート */}
        {pinchCount > 0 && (
          <div style={styles.alertBox}>
            <span style={styles.alertIcon}>🔥</span>
            <div>
              <div style={styles.alertTitle}>サボってる門下生がいるぞ！</div>
              <div style={styles.alertDetail}>
                3日以上稽古していない生徒が
                <strong style={{
                  color: '#FF6B6B',
                  margin: '0 4px',
                  textShadow: '0 0 6px rgba(255,107,107,0.6)',
                }}>
                  {pinchCount}名
                </strong>
                います。声をかけてあげよう。
              </div>
            </div>
          </div>
        )}

        {/* 検索・並べ替え */}
        <section style={styles.searchSection}>
          <input
            type="text"
            placeholder="🔍 門下生を検索（名前・学年）"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.searchInput}
            aria-label="門下生を検索"
          />
          <div style={styles.sortRow}>
            {SORT_OPTIONS.map(opt => {
              const active = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortKey(opt.key)}
                  style={{
                    ...styles.sortBtn,
                    ...(active ? styles.sortBtnActive : {}),
                  }}
                  aria-pressed={active}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 区切り */}
        <Divider label={`👥 門下生（${filteredStudents.length}名）`} />

        {/* 生徒一覧 */}
        {filteredStudents.length === 0 ? (
          <div style={styles.emptyBox}>
            {searchText.trim() ? (
              <>
                <div style={styles.emptyIcon}>🔍</div>
                <p style={styles.emptyText}>
                  「{searchText}」に一致する門下生はいません
                </p>
                <button
                  style={styles.clearSearchBtn}
                  onClick={() => setSearchText('')}
                >
                  検索をクリア
                </button>
              </>
            ) : (
              <>
                <div style={styles.emptyIcon}>🥺</div>
                <p style={styles.emptyText}>
                  まだ担当の門下生がいません
                </p>
              </>
            )}
          </div>
        ) : (
          <div style={styles.studentList}>
            {filteredStudents.map(student => (
              <StudentListCard
                key={student.user_id}
                student={student}
                titleMaster={titleMaster}
              />
            ))}
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

// =====================================================================
// 区切り線
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
// スケルトン
// =====================================================================
function TeacherSkeleton() {
  return (
    <div style={styles.outer}>
      <div style={styles.bgPattern} aria-hidden="true" />
      <div style={styles.container}>
        <div style={styles.skeletonLogo}>
          <div style={styles.skeletonFlame}>🥋</div>
          <h2 style={styles.skeletonTitle}>道場の準備中…</h2>
          <div style={styles.skeletonSpinner} />
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={styles.skeletonCard}>
            <div style={{ ...styles.skeletonBlock, width: '60%', height: 20, marginBottom: 8 }} />
            <div style={{ ...styles.skeletonBlock, width: '40%', height: 14, marginBottom: 12 }} />
            <div style={{ ...styles.skeletonBlock, width: '100%', height: 28 }} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes burning_skel_pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        @keyframes burning_skel_flame {
          0%, 100% { transform: scale(1) rotate(-3deg); }
          50%      { transform: scale(1.1) rotate(3deg); }
        }
        @keyframes burning_skel_spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
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
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  headerLogo: {
    fontSize:    '24px',
    filter:      'drop-shadow(0 0 6px rgba(255,215,0,0.4))',
  },
  headerTitle: {
    fontSize:      '17px',
    fontWeight:    900,
    color:         '#FFD700',
    letterSpacing: '0.05em',
    textShadow:    '0 0 8px rgba(255,215,0,0.5), 0 1px 2px rgba(0,0,0,0.5)',
  },

  // === 先生プロフィール ===
  teacherCard: {
    display:         'flex',
    alignItems:      'center',
    gap:             '14px',
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '14px 16px',
    border:          `2px solid ${THEME.primary}`,
    boxShadow:       '0 4px 16px rgba(0,0,0,0.45), inset 0 0 24px rgba(178,34,34,0.10)',
  },
  teacherIcon: {
    fontSize:    '40px',
    flexShrink:  0,
    filter:      'drop-shadow(0 0 8px rgba(255,215,0,0.4))',
  },
  teacherInfo: {
    flex:    1,
    minWidth: 0,
  },
  teacherLabel: {
    fontSize:        '10px',
    fontWeight:      900,
    color:           '#2D0B0B',
    backgroundColor: '#FFD700',
    padding:         '2px 10px',
    borderRadius:    '4px',
    display:         'inline-block',
    letterSpacing:   '0.1em',
    boxShadow:       '0 0 8px rgba(255,215,0,0.5)',
  },
  teacherName: {
    fontSize:      '20px',
    fontWeight:    900,
    color:         '#FFFFFF',
    marginTop:     '4px',
    letterSpacing: '0.02em',
    textShadow:    '0 1px 2px rgba(0,0,0,0.5), 0 0 8px rgba(255,215,0,0.3)',
  },
  teacherStat: {
    fontSize:  '12px',
    color:     'rgba(255,255,255,0.75)',
    marginTop: '2px',
  },

  // === アラート ===
  alertBox: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '12px',
    padding:    '12px 14px',
    backgroundColor: 'rgba(255,68,68,0.18)',
    border:     `1px solid ${THEME.primary}`,
    borderLeft: `4px solid ${THEME.primary}`,
    borderRadius: '10px',
    boxShadow:  'inset 0 0 16px rgba(178,34,34,0.20), 0 0 12px rgba(255,68,68,0.20)',
  },
  alertIcon: {
    fontSize:    '24px',
    flexShrink:  0,
    filter:      'drop-shadow(0 0 6px rgba(255,68,68,0.6))',
  },
  alertTitle: {
    fontSize:     '14px',
    fontWeight:   900,
    color:        '#FF6B6B',
    marginBottom: '2px',
    textShadow:   '0 0 6px rgba(255,107,107,0.6)',
    letterSpacing: '0.05em',
  },
  alertDetail: {
    fontSize:   '12px',
    color:      '#FFFFFF',
    lineHeight: 1.5,
  },

  // === 検索・ソート ===
  searchSection: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '12px',
    padding:         '12px',
    border:          '1px solid rgba(255,255,255,0.15)',
    display:         'flex',
    flexDirection:   'column',
    gap:             '10px',
    boxShadow:       '0 2px 12px rgba(0,0,0,0.40)',
  },
  searchInput: {
    width:           '100%',
    padding:         '10px 14px',
    fontSize:        '14px',
    fontFamily:      'inherit',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.35)',
    border:          '1.5px solid rgba(255,255,255,0.2)',
    borderRadius:    '8px',
    outline:         'none',
    boxSizing:       'border-box',
    boxShadow:       'inset 0 0 12px rgba(0,0,0,0.5)',
  },
  sortRow: {
    display:  'flex',
    gap:      '6px',
    flexWrap: 'wrap',
  },
  sortBtn: {
    flex:           1,
    minWidth:       '70px',
    minHeight:      '38px',
    padding:        '6px 10px',
    fontSize:       '12px',
    fontWeight:     800,
    fontFamily:     'inherit',
    color:          'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    border:         '1.5px solid rgba(255,255,255,0.2)',
    borderRadius:   '999px',
    cursor:         'pointer',
    transition:     'all 0.15s ease',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '4px',
    WebkitTapHighlightColor: 'transparent',
  },
  sortBtnActive: {
    color:           '#2D0B0B', // ★ 黒文字（金背景に対する高コントラスト）
    backgroundColor: '#FFD700', // ★ 金背景（暗闇で映える）
    borderColor:     '#FFD700',
    fontWeight:      900,
    boxShadow:       '0 0 12px rgba(255,215,0,0.7), 0 0 20px rgba(255,215,0,0.30)',
    textShadow:      '0 1px 1px rgba(255,255,255,0.5)',
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

  // === 生徒一覧 ===
  studentList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },

  // === 空状態 ===
  emptyBox: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '32px 16px',
    border:          '2px dashed rgba(255,255,255,0.2)',
    textAlign:       'center',
    boxShadow:       '0 2px 12px rgba(0,0,0,0.40)',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color:    'rgba(255,255,255,0.7)',
    margin:   '0 0 12px',
  },
  clearSearchBtn: {
    padding:         '8px 20px',
    fontSize:        '13px',
    fontWeight:      900,
    color:           '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border:          `1.5px solid ${THEME.primary}`,
    borderRadius:    '999px',
    cursor:          'pointer',
    letterSpacing:   '0.05em',
  },

  // === エラー ===
  errorBox: {
    minHeight:       '100vh',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '32px',
    backgroundColor: THEME.bg,
    background: `
      radial-gradient(circle at 50% 30%, rgba(178,34,34,0.20) 0%, transparent 50%),
      linear-gradient(180deg, ${THEME.bgSoft} 0%, ${THEME.bg} 100%)
    `,
    textAlign:       'center',
  },
  errorIcon: {
    fontSize:     '56px',
    marginBottom: '12px',
    filter:       'drop-shadow(0 0 8px rgba(255,68,68,0.4))',
  },
  errorTitle: {
    fontSize:      '20px',
    fontWeight:    900,
    color:         '#FFD700',
    margin:        '0 0 8px',
    textShadow:    '0 0 8px rgba(255,215,0,0.5)',
    letterSpacing: '0.05em',
  },
  errorMessage: {
    fontSize: '14px',
    color:    'rgba(255,255,255,0.75)',
    margin:   '0 0 20px',
  },
  retryBtn: {
    padding:       '12px 28px',
    fontSize:      '15px',
    fontWeight:    900,
    color:         '#FFFFFF',
    background:    `linear-gradient(180deg, ${THEME.primary} 0%, ${THEME.primaryDark} 100%)`,
    border:        '2px solid #FFD700',
    borderRadius:  '8px',
    cursor:        'pointer',
    letterSpacing: '0.05em',
    boxShadow:     '0 4px 16px rgba(255,215,0,0.30)',
  },

  // === スケルトン ===
  skeletonLogo: {
    textAlign: 'center',
    padding:   '40px 20px 20px',
  },
  skeletonFlame: {
    fontSize:    '56px',
    animation:   'burning_skel_flame 1.4s ease-in-out infinite',
    filter:      'drop-shadow(0 0 12px rgba(255,68,68,0.5))',
  },
  skeletonTitle: {
    fontSize:      '15px',
    fontWeight:    900,
    color:         '#FFD700',
    margin:        '12px 0 16px',
    textShadow:    '0 0 6px rgba(255,215,0,0.5)',
    letterSpacing: '0.1em',
  },
  skeletonSpinner: {
    display:        'inline-block',
    width:          '32px',
    height:         '32px',
    border:         '4px solid rgba(255,255,255,0.15)',
    borderTopColor: '#FFD700',
    borderRadius:   '50%',
    animation:      'burning_skel_spin 0.9s linear infinite',
    boxShadow:      '0 0 12px rgba(255,215,0,0.4)',
  },
  skeletonCard: {
    backgroundColor: THEME.bgCard,
    borderRadius:    '14px',
    padding:         '16px',
    border:          '2px solid rgba(255,255,255,0.15)',
    boxShadow:       '0 2px 12px rgba(0,0,0,0.40)',
  },
  skeletonBlock: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius:    '6px',
    animation:       'burning_skel_pulse 1.4s ease-in-out infinite',
  },
};
