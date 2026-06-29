// types/index.ts
// =====================================================================
// 燃えろ剣士 - 型定義・経験値/修行度ロジック
// 百錬自得から継承しつつ、小学生向けに大幅シンプル化
// =====================================================================

// =====================================================================
// 基本ユーザー型
// =====================================================================

export type UserRole = 'student' | 'teacher';

export interface User {
  id:       string;
  name:     string;
  role:     UserRole;
  grade?:   string; // 1〜6（teacherは0）。Supabase users.grade に対応
}

export interface UserStatus {
  total_xp:            number;
  level:               number;
  last_practice_date?: string | null;
  /** 経験値減衰の最終適用日（Supabase user_status.last_decay_date） */
  last_decay_date?:    string | null;
  /** 得意技ID（T001/T002/T003） */
  favorite_technique?: string;
  /** かけ声（10文字以内） */
  catchphrase:         string;
}

// =====================================================================
// 固定課題（task_master）
// =====================================================================

export interface TaskMasterEntry {
  id:            string; // K001 など（task_master.id）
  task_text:     string; // task_master.task_text
  display_order: number; // task_master.display_order
  grade_min:     number; // task_master.grade_min（対象学年下限）
}

// =====================================================================
// 技マスター（3技固定）
// =====================================================================

export type TechniqueId = 'T001' | 'T002' | 'T003';

export interface TechniqueMasterEntry {
  id:           TechniqueId;
  name:         string; // Supabase technique_master.name（面 / 小手 / 胴）
  displayOrder: number; // technique_master.display_order に対応
}

// =====================================================================
// 量・質（3段階）
// =====================================================================

export type QuantityLevel = 1 | 2 | 3; // 1:少ない / 2:普通 / 3:多い
export type QualityLevel  = 1 | 2 | 3; // 1:まぐれ / 2:普通 / 3:会心

export const QUANTITY_LABELS: Record<QuantityLevel, string> = {
  1: '少ない',
  2: 'ふつう',
  3: '多い',
};

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  1: 'まぐれ当たり',
  2: 'ふつうの一撃',
  3: '会心の一撃！',
};

// =====================================================================
// ログ系
// =====================================================================

export interface TaskLogEntry {
  id?:          string;  // task_logs.id（PK）
  user_id?:     string;  // task_logs.user_id
  date:         string;  // task_logs.date
  task_id:      string;  // task_logs.task_id
  task_text?:   string;  // task_master との結合で付与（DB列ではない）
  score:        number;  // task_logs.score（1〜5）
  xp_earned:    number;  // task_logs.xp_earned
  /** 'self' または 先生ID（task_logs.evaluator_id） */
  evaluator_id?:   string;
  evaluator_name?: string; // users との結合で付与（DB列ではない）
  comment?:        string;  // task_logs.comment
}

export interface TechniqueLogEntry {
  date:         string;
  technique_id: TechniqueId;
  quantity:     QuantityLevel;
  quality:      QualityLevel;
  xp_earned:    number;
}

export interface Technique {
  id:            TechniqueId;
  name:          string;
  points:        number;
  last_quantity: QuantityLevel | null;
  last_quality:  QualityLevel | null;
}

export interface XpHistoryEntry {
  date:           string;
  type:           'gain' | 'decay' | 'teacher_eval' | 'minigame';
  amount:         number;
  reason:         string;
  total_xp_after: number;
  level:          number;
}

// =====================================================================
// 先生評価
// =====================================================================

/** task_logs の先生評価行（GAS: _getTaskLogs_ と同型） */
export interface TeacherEvaluationEntry {
  date:           string;
  task_id:        string;
  task_text:      string;
  score:          number;
  xp_earned:      number;
  evaluator_id:   string;
  evaluator_name?: string;
  comment?:       string;
}

/** 先生が評価UIで送信するペイロード */
export interface TeacherEvalPayload {
  action:      'evaluateStudent';
  student_id:  string;
  /** 評価対象日（YYYY-MM-DD）。未指定の場合は当日として扱う（カレンダーからの遡り評価に対応） */
  date?:       string;
  evaluations: Array<{
    task_id: string;
    score:   number;
    comment?: string;
  }>;
}

export interface TeacherEvalResponse {
  xp_granted:    number;
  student_level: number;
  evaluated_count: number;
}

// =====================================================================
// 実績バッジ
// =====================================================================

export interface AchievementMasterEntry {
  id:             string;
  name:           string;
  conditionType:  'total_practices' | 'teacher_evals' | 'technique_points';
  conditionValue: number;
  description:    string;
  hint:           string;
  iconType:       string;
}

/**
 * Supabase achievement_master テーブルの生行型。
 * api.ts で AchievementMasterEntry / Achievement へ変換するために使用。
 */
export interface AchievementMasterRow {
  achievement_id:  string;
  name:            string;
  condition_type:  'total_practices' | 'teacher_evals' | 'technique_points';
  condition_value: number;
  description:     string;
  hint:            string;
  icon_type:       string;
}

export interface Achievement {
  id:          string;
  name:        string;
  description: string;
  hint:        string;
  iconType:    string;
  isUnlocked:  boolean;
  unlockedAt:  string | null;
}

// =====================================================================
// 称号（修行度に対応）
// =====================================================================

export interface TitleMasterEntry {
  level: number;
  title: string;
}

// =====================================================================
// saveLog ペイロード（生徒側の自己記録）
// =====================================================================

export interface SaveLogPayload {
  action: 'saveLog';
  date:   string;
  /** 課題評価。生徒の自己評価。 */
  taskEvals?: Array<{
    task_id: string;
    score:   number;
  }>;
  /** 技の記録 */
  techniques?: Array<{
    technique_id: TechniqueId;
    quantity:     QuantityLevel;
    quality:      QualityLevel;
  }>;
}

export interface SaveLogResponse {
  xp_earned:        number;
  xp_from_tasks?:   number;
  xp_from_techniques?: number;
  total_xp:         number;
  level:            number;
  newAchievements?: Achievement[];
}

// =====================================================================
// 生徒ダッシュボード
// =====================================================================

export interface NextLevelInfo {
  required: number | null;
  title:    string;
}

export interface DecayInfo {
  applied:       number;
  days_absent:   number;
  today_penalty: number;
}

export interface DashboardData {
  user:             User;
  status:           UserStatus;
  taskMaster:       TaskMasterEntry[]; // 先生が設定する固定課題（パラレルフェッチで常に配列）
  techniqueMaster:  TechniqueMasterEntry[];
  titleMaster:      TitleMasterEntry[];
  taskLogs:         TaskLogEntry[];
  techniqueLogs:    TechniqueLogEntry[];
  techniques:       Technique[];      // 三角レーダー用
  xpHistory:        XpHistoryEntry[];
  teacherEvals:     TeacherEvaluationEntry[]; // 自分が受けた先生評価
  decay?:           DecayInfo;
  nextLevelXp:      NextLevelInfo;
  achievements:     Achievement[];
}

// =====================================================================
// 先生用ダッシュボード（門下生一覧）
// =====================================================================

export interface StudentSummary {
  user_id:      string;
  name:         string;
  grade?:       string;
  level:        number;
  total_xp:     number;
  last_practice_date?: string | null;
    /** 三角レーダー用の累計ポイント */
  techniquePoints: {
    T001: number; // 面
    T002: number; // 小手
    T003: number; // 胴
  };
  /** 何日前に稽古したか（先生のアラート用） */
  daysSinceLastPractice: number | null;
  /** 本日、ログイン中の先生が既にこの生徒を評価済みか（全体評価の1日1回制限用） */
  evaluated_today_by_me?: boolean;
}

export interface TeacherDashboardData {
  teacher:  User;
  students: StudentSummary[];
  titleMaster: TitleMasterEntry[]; // ★追加
  taskMaster: TaskMasterEntry[];
}

/** 先生が個別生徒画面に入った際のデータ */
export interface StudentDetailData {
  student:       User;
  status:        UserStatus;
  taskMaster:    TaskMasterEntry[];
  titleMaster:   TitleMasterEntry[];   // ★追加
  recentLogs:    TaskLogEntry[];      // 直近30日
  techniques:    Technique[];
  /** 先生が今日すでに評価した課題ID（連打防止） */
  todayEvaluatedTaskIds: string[];
  teacherEvals?: TeacherEvaluationEntry[]; // ★追加
}

// =====================================================================
// ミニゲーム「刹那ノ見切」（小学生緩和版）
// =====================================================================

export type MinigameRank = 'S' | 'A' | 'B' | 'C' | 'F';

export interface MinigameScoreEntry {
  id:           string;
  created_at:   string;
  average_time: number;
  rank:         MinigameRank;
  earned_xp:    number;
}

export interface MinigameStatus {
  todayPlayed:    number; // 0〜3
  bestTimeMs:     number | null;
  recentScores:   MinigameScoreEntry[];
}

export interface SaveMinigamePayload {
  action:       'saveMinigameResult';
  average_time: number;
  rank:         MinigameRank;
  successCount: number; // 0〜3本
}

export interface SaveMinigameResponse {
  earned_xp: number;
  total_xp:  number;
  level:     number;
  rank:      MinigameRank;
}

/** ヒロイック技名カットイン用 */
export const HEROIC_CUTIN_LABELS: Record<TechniqueId, string> = {
  T001: '超絶・神速面ッ！！',
  T002: '烈火・閃光小手ッ！！',
  T003: '奥義・雷鳴胴ッ！！',
};

// =====================================================================
// 共通レスポンス型
// =====================================================================

export interface GASResponse<T> {
  status:   'ok' | 'error';
  data?:    T;
  message?: string;
}

// =====================================================================
// 経験値テーブル（小学生向けに緩やかに）
// レベル上限を50に抑え、序盤の達成感を強化
// xpForLevel(n) = floor(50 * (n-1)^1.6)
// =====================================================================

export const MAX_LEVEL = 50;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 1.6));
}

export function calcLevelFromXp(xp: number): number {
  let level = 1;
  for (let n = 1; n <= MAX_LEVEL; n++) {
    if (xp >= xpForLevel(n)) level = n;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

export function calcProgressPercent(xp: number): number {
  const level = calcLevelFromXp(xp);
  if (level >= MAX_LEVEL) return 100;
  const current = xpForLevel(level);
  const next    = xpForLevel(level + 1);
  return Math.round(((xp - current) / (next - current)) * 100);
}

// =====================================================================
// 称号導出
// =====================================================================

const DEFAULT_TITLES: Record<number, string> = {
  1:  'みならい剣士',
  5:  '元気の剣士',
  10: '炎の剣士',
  15: '雷の剣士',
  20: '風神の剣士',
  25: '不動の剣士',
  30: '天才剣士',
  40: '剣の達人',
  50: '剣聖',
};

export function titleForLevel(level: number, master?: TitleMasterEntry[]): string {
  const table = (master && master.length > 0)
    ? Object.fromEntries(master.map(e => [e.level, e.title]))
    : DEFAULT_TITLES;
  let title = Object.values(table)[0] ?? 'みならい剣士';
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (level >= lv) title = table[lv];
    else break;
  }
  return title;
}

export function nextTitleLevel(
  level: number,
  master?: TitleMasterEntry[],
): { level: number; title: string } | null {
  const table = (master && master.length > 0)
    ? Object.fromEntries(master.map(e => [e.level, e.title]))
    : DEFAULT_TITLES;
  for (const lv of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    if (lv > level) return { level: lv, title: table[lv] };
  }
  return null;
}

// =====================================================================
// 経験値計算ヘルパー
// =====================================================================

/** 課題評価XP（自己） */
export function calcSelfTaskXp(score: number): number {
  return score * 5;
}

/** 課題評価XP（先生からの×10ボーナス） */
export const TEACHER_EVAL_MULTIPLIER = 10;

export function calcTeacherTaskXp(score: number): number {
  return calcSelfTaskXp(score) * TEACHER_EVAL_MULTIPLIER;
}

/** 技の記録XP */
export function calcTechniqueXp(quantity: QuantityLevel, quality: QualityLevel): number {
  return quantity * quality * 3; // 1×1×3=3 〜 3×3×3=27
}

// =====================================================================
// ミニゲームランク判定（緩和版）
// =====================================================================

export function calcMinigameRank(
  successCount: number,
  averageTimeMs: number,
): { rank: MinigameRank; xp: number } {
  if (successCount === 0) return { rank: 'F', xp: 2 };
  if (successCount === 3 && averageTimeMs < 500)  return { rank: 'S', xp: 30 };
  if (successCount === 3 && averageTimeMs < 700)  return { rank: 'A', xp: 20 };
  if (successCount === 3 || averageTimeMs < 900)  return { rank: 'B', xp: 10 };
  return { rank: 'C', xp: 5 };
}

// =====================================================================
// テーマカラー（臙脂ベース×白差し・熱血ダーク）
// =====================================================================

export const THEME = {
  primary:     '#FF4444', // 炎のハイライト
  primaryDark: '#8B0000', // 深い熱血色
  bg:          '#8B0000', // 画面背景（ベース）
  bgSoft:      '#9B1C1C', // 画面背景（グラデーション先）
  bgCard:      '#5A0B0B', // カード背景
  bgCardDeep:  '#4A0505', // より深いカード
  bgInk:       '#0A0202', // 漆黒（技の修得チャート内）
  bgBubble:    '#3D1010', // コメント吹き出し
  text:        '#FFFFFF',
  textMuted:   '#FFEAE2', // 淡い炎色・クリーム
  textSubtle:  'rgba(255,234,226,0.6)',
  accent:      '#FFD700',
  border:      'rgba(255,255,255,0.35)',
  borderSolid: '#FFFFFF',
  bgPattern:   '#7A1515',
} as const;

// =====================================================================
// レベル別カラー（修行度バッジの色変化）
// =====================================================================

export function levelColor(level: number): string {
  if (level >= 50) return '#FFD700'; // 剣聖：金
  if (level >= 40) return '#B22222'; // 達人：臙脂
  if (level >= 25) return '#DC143C'; // 不動：紅
  if (level >= 15) return '#FF4500'; // 雷：橙赤
  if (level >= 10) return '#FF6347'; // 炎：トマト
  if (level >= 5)  return '#FFA07A'; // 元気：薄橙
  return '#A0A0A0';                  // 見習い：灰
}

// =====================================================================
// ログイン用ユーザー一覧（公開エンドポイント用）
// 個人情報を最小限に絞った軽量版
// =====================================================================
export interface UserListEntry {
  id:    string;
  name:  string;
  role:  UserRole;
  grade?: string; // teacher は未設定 / student は "1"〜"6"
}

export interface UserListResponse {
  users: UserListEntry[];
}
