// types/index.ts
// =====================================================================
// 燃えよ剣士 - 型定義・経験値/修行度ロジック
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
  grade:    number; // 1〜6（teacherは0）
}

export interface UserStatus {
  total_xp:            number;
  level:               number;
  last_practice_date?: string | null;
  /** 得意技ID（T001/T002/T003） */
  favorite_technique?: string;
  /** かけ声（10文字以内） */
  catchphrase?:        string;
}

// =====================================================================
// 固定課題（task_master）
// =====================================================================

export interface TaskMasterEntry {
  id:           string; // K001 など
  taskText:     string;
  displayOrder: number;
  gradeMin:     number; // 対象学年下限
}

// =====================================================================
// 技マスター（3技固定）
// =====================================================================

export type TechniqueId = 'T001' | 'T002' | 'T003';

export interface TechniqueMasterEntry {
  id:           TechniqueId;
  name:         '面' | '小手' | '胴';
  displayOrder: number;
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
  date:         string;
  task_id:      string;
  task_text:    string; // GASがJOINして返却
  score:        number; // 1〜5
  xp_earned:    number;
  /** 'self' または 先生ID */
  evaluator_id: string;
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

export interface TeacherEvaluationEntry {
  teacher_id:  string;
  teacher_name: string;
  student_id:  string;
  task_id:     string;
  task_text:   string;
  date:        string;
  score:       number;       // 1〜5
  xp_granted:  number;       // ×10適用済み
  comment?:    string;
}

/** 先生が評価UIで送信するペイロード */
export interface TeacherEvalPayload {
  action:      'evaluateStudent';
  student_id:  string;
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
  taskMaster:       TaskMasterEntry[];
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
  grade:        number;
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
}

export interface TeacherDashboardData {
  teacher:  User;
  students: StudentSummary[];
}

/** 先生が個別生徒画面に入った際のデータ */
export interface StudentDetailData {
  student:       User;
  status:        UserStatus;
  taskMaster:    TaskMasterEntry[];
  recentLogs:    TaskLogEntry[];      // 直近30日
  techniques:    Technique[];
  /** 先生が今日すでに評価した課題ID（連打防止） */
  todayEvaluatedTaskIds: string[];
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
// テーマカラー（白×臙脂）
// =====================================================================

export const THEME = {
  primary:    '#B22222', // 臙脂色（ファイアブリック）
  primaryDark:'#8B1A1A',
  bg:         '#FFFFFF',
  bgSoft:     '#FFF8F8',
  bgPattern:  '#FBEFEF', // ★追加：和紙風背景パターン色
  text:       '#2B2B2B',
  textMuted:  '#777777',
  accent:     '#FFD700', // 金色（先生評価のキラキラ演出用）
  border:     '#E5D8D8',
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
