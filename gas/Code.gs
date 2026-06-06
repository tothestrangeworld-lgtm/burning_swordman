// =====================================================================
// 燃えろ剣士 - GAS Backend (Code.gs)
// Phase 1.5: 初期化 + 取得系API + 更新系API + ルーティング
// Phase 4.1: getUserList (公開ログイン用) を追加
// Phase 5.0: evaluateBulkStudents（全体評価/一括評価）API追加
// Phase 6.0: ミニゲーム『刹那ノ見切』API追加（1日5回・ランキング）
// =====================================================================

const SS_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

// 経験値計算定数
const TEACHER_EVAL_MULTIPLIER = 10;  // 個別評価倍率
const BULK_EVAL_MULTIPLIER    = 5;   // ★ 全体評価倍率（Phase 5）
const SELF_TASK_XP_PER_SCORE  = 5;
const TECHNIQUE_XP_FACTOR     = 3;
const MAX_LEVEL               = 50;
const DECAY_THRESHOLD_DAYS    = 3;
const DECAY_RATE              = 0.02;

// ログ取得の上限件数
const TASK_LOG_LIMIT_DAYS     = 90;
const TECH_LOG_LIMIT_DAYS     = 90;
const XP_HISTORY_LIMIT        = 90;
const STUDENT_DETAIL_LOG_DAYS = 30;

// ★ Phase 6: ミニゲーム定数
const MINIGAME_DAILY_LIMIT    = 5;   // 1日5回
const MINIGAME_RANKING_LIMIT  = 10;  // ランキング表示件数
const MINIGAME_XP_TABLE = {          // ランク別獲得XP
  S: 50,
  A: 30,
  B: 20,
  C: 10,
  F: 0,
};

// =====================================================================
// 全シートのスキーマ定義（initMasterData で使用）
// =====================================================================
const SHEET_SCHEMAS = {
  users: ['id', 'name', 'passcode', 'role', 'grade'],
  user_status: [
    'user_id', 'total_xp', 'level',
    'last_practice_date', 'last_decay_date',
    'favorite_technique', 'catchphrase',
  ],
  task_logs: [
    'user_id', 'date', 'task_id', 'score',
    'xp_earned', 'evaluator_id', 'comment',
  ],
  technique_logs: [
    'user_id', 'date', 'technique_id',
    'quantity', 'quality', 'xp_earned',
  ],
  user_techniques: [
    'user_id', 'technique_id', 'points',
    'last_quantity', 'last_quality',
  ],
  xp_history: [
    'user_id', 'date', 'type', 'amount',
    'reason', 'total_xp_after', 'level',
  ],
  user_achievements: ['user_id', 'achievement_id', 'unlocked_at'],
  minigame_scores: [
    'id', 'user_id', 'created_at',
    'average_time', 'rank', 'earned_xp',
  ],
  push_subscriptions: ['user_id', 'subscription_json', 'updated_at'],
  task_master: ['id', 'task_text', 'display_order', 'grade_min'],
  technique_master: ['id', 'name', 'display_order'],
  title_master: ['level', 'title'],
  achievement_master: [
    'achievement_id', 'name', 'condition_type',
    'condition_value', 'description', 'hint', 'icon_type',
  ],
  error_logs: ['timestamp', 'level', 'action', 'message', 'detail'],
};

// 初期マスタデータ
const INITIAL_TASK_MASTER = [
  ['K001', '大きな声を出す', 1, 1],
  ['K002', '正しいすり足をする', 2, 1],
  ['K003', '打つときに両手をぎゅっと絞る', 3, 1],
  ['K004', 'まっすぐ振りかぶって打つ', 4, 2],
  ['K005', '打ったあとに素早く抜け、残心する', 5, 3],
];

const INITIAL_TECHNIQUE_MASTER = [
  ['T001', '面',   1],
  ['T002', '小手', 2],
  ['T003', '胴',   3],
];

const INITIAL_TITLE_MASTER = [
  [1,  'みならい剣士'],
  [5,  'はじまりの剣士'],
  [10, '炎の剣士'],
  [15, '疾風の剣士'],
  [20, '雷鳴の剣士'],
  [25, '鬼神の剣士'],
  [30, '天才剣士'],
  [40, '剣の達人'],
  [50, '剣聖'],
];

// =====================================================================
// 0. 初期化スクリプト（手動実行用）
// =====================================================================
function initMasterData() {
  const ss = SpreadsheetApp.openById(SS_ID);
  const created = [];
  const skipped = [];

  // 全シート作成 + ヘッダー設定
  Object.keys(SHEET_SCHEMAS).forEach(sheetName => {
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      const headers = SHEET_SCHEMAS[sheetName];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#FFE4E1');
      sh.setFrozenRows(1);
      created.push(sheetName);
    } else {
      skipped.push(sheetName);
    }
  });

  // マスターデータの流し込み（既存行があればスキップ）
  _seedMaster_('task_master',      INITIAL_TASK_MASTER);
  _seedMaster_('technique_master', INITIAL_TECHNIQUE_MASTER);
  _seedMaster_('title_master',     INITIAL_TITLE_MASTER);

  Logger.log('=== initMasterData 完了 ===');
  Logger.log('新規作成シート: ' + (created.join(', ') || 'なし'));
  Logger.log('既存スキップ: '   + (skipped.join(', ') || 'なし'));

  return {
    created: created,
    skipped: skipped,
    message: '初期化が完了しました',
  };
}

function _seedMaster_(sheetName, rows) {
  const sh = _sheet_(sheetName);
  // 既にデータ行があればスキップ（冪等性確保）
  if (sh.getLastRow() > 1) return;
  if (rows.length === 0) return;
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

// =====================================================================
// エントリーポイント：doGet（参照系）
// ★ Phase 6: getMinigameStatus / getMinigameRanking を追加
// =====================================================================
function doGet(e) {
  let params = {};
  try {
    params = e.parameter || {};
    const action = params.action;
    let result;

    switch (action) {
      case 'getUserList':
        result = getUserList();
        break;
      case 'getDashboard':
        result = getDashboard(params.user_id);
        break;
      case 'getTeacherDashboard':
        result = getTeacherDashboard(params.teacher_id);
        break;
      case 'getStudentDetail':
        result = getStudentDetail(params.teacher_id, params.student_id);
        break;
      // ★ Phase 6.0 追加：ミニゲーム
      case 'getMinigameStatus':
        result = getMinigameStatus(params.user_id);
        break;
      case 'getMinigameRanking':
        result = getMinigameRanking();
        break;
      default:
        throw new Error('未知のアクション: ' + action);
    }

    return _jsonResponse_({ status: 'ok', data: result });

  } catch (err) {
    _logError_('doGet:' + (params.action || 'unknown'), err.message,
      JSON.stringify(params).slice(0, 500));
    return _jsonResponse_({ status: 'error', message: err.message });
  }
}

// =====================================================================
// エントリーポイント：doPost（更新系）
// ★ Phase 6: saveMinigameResult を追加
// =====================================================================
function doPost(e) {
  let payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let result;

    switch (action) {
      case 'login':
        result = login(payload);
        break;
      case 'saveLog':
        result = saveLog(payload);
        break;
      case 'evaluateStudent':
        result = evaluateStudent(payload);
        break;
      // ★ Phase 5.0 追加：全体評価（一括評価）
      case 'evaluateBulkStudents':
        result = evaluateBulkStudents(payload);
        break;
      // ★ Phase 6.0 追加：ミニゲーム結果保存
      case 'saveMinigameResult':
        result = saveMinigameResult(payload);
        break;
      default:
        throw new Error('未知のアクション: ' + action);
    }

    return _jsonResponse_({ status: 'ok', data: result });

  } catch (err) {
    _logError_('doPost:' + (payload.action || 'unknown'), err.message,
      JSON.stringify(payload).slice(0, 500));
    return _jsonResponse_({ status: 'error', message: err.message });
  }
}

// =====================================================================
// 0-A. getUserList : ログイン画面用のユーザー一覧（公開エンドポイント）
//      個人情報は最小限：id, name, role, grade のみ返却（passcodeは絶対除外）
// =====================================================================
function getUserList() {
  const sh = _sheet_('users');
  const data = sh.getDataRange().getValues();
  const users = [];

  for (let i = 1; i < data.length; i++) {
    const id   = String(data[i][0] || '').trim();
    const name = String(data[i][1] || '').trim();
    const role = String(data[i][3] || '').trim();

    // 必須項目が欠けている行はスキップ
    if (!id || !name || !role) continue;
    // 想定外のロール値は除外
    if (role !== 'student' && role !== 'teacher') continue;

    users.push({
      id:    id,
      name:  name,
      role:  role,
      grade: Number(data[i][4]) || 0,
    });
  }

  return { users: users };
}

// =====================================================================
// 0. login : パスコード認証
//    - user_id と passcode の完全一致でユーザー情報を返す
//    - パスコードは絶対にレスポンスに含めない
// =====================================================================
function login(payload) {
  const userId   = (payload.user_id || '').toString().trim();
  const passcode = (payload.passcode || '').toString().trim();

  if (!userId)   throw new Error('剣士IDを入力してください');
  if (!passcode) throw new Error('合言葉を入力してください');

  const sh = _sheet_('users');
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    if (id !== userId) continue;

    const dbPasscode = String(data[i][2] || '').trim();
    if (dbPasscode !== passcode) {
      throw new Error('合言葉がちがいます');
    }

    // 認証成功
    return {
      id:    data[i][0],
      name:  data[i][1],
      role:  data[i][3],
      grade: Number(data[i][4]) || 0,
    };
  }

  throw new Error('剣士IDが見つかりません');
}

// =====================================================================
// 1. saveLog : 生徒の自己記録
// =====================================================================
function saveLog(payload) {
  const userId = payload.user_id;
  if (!userId) throw new Error('user_idが指定されていません');

  const user = _getUser_(userId);
  if (!user) throw new Error('ユーザーが見つかりません: ' + userId);
  if (user.role !== 'student') throw new Error('生徒のみが自己記録できます');

  const today = _todayStr_();
  const now   = _nowStr_();

  const decayInfo = _applyDecayIfNeeded_(userId);

  let xpFromTasks      = 0;
  let xpFromTechniques = 0;

  // 課題評価（自己）
  if (Array.isArray(payload.taskEvals)) {
    const taskLogSheet = _sheet_('task_logs');
    payload.taskEvals.forEach(item => {
      _validateScore_(item.score);
      const xp = item.score * SELF_TASK_XP_PER_SCORE;
      xpFromTasks += xp;
      taskLogSheet.appendRow([
        userId, now, item.task_id, item.score, xp, 'self', '',
      ]);
    });
  }

  // 技の記録
  if (Array.isArray(payload.techniques)) {
    const techLogSheet = _sheet_('technique_logs');
    payload.techniques.forEach(item => {
      _validateTechniqueId_(item.technique_id);
      _validateLevel3_(item.quantity, '量');
      _validateLevel3_(item.quality,  '質');

      const xp = item.quantity * item.quality * TECHNIQUE_XP_FACTOR;
      xpFromTechniques += xp;

      techLogSheet.appendRow([
        userId, now, item.technique_id,
        item.quantity, item.quality, xp,
      ]);
      _upsertUserTechnique_(userId, item.technique_id, xp,
        item.quantity, item.quality);
    });
  }

  const totalXpEarned = xpFromTasks + xpFromTechniques;
  const updated = _addXpToUser_(
    userId,
    totalXpEarned,
    'gain',
    `自己記録（課題:${xpFromTasks} 技:${xpFromTechniques}）`,
  );
  _updateLastPracticeDate_(userId, today);
  const newAchievements = _checkAchievements_(userId);

  return {
    xp_earned:          totalXpEarned,
    xp_from_tasks:      xpFromTasks,
    xp_from_techniques: xpFromTechniques,
    total_xp:           updated.total_xp,
    level:              updated.level,
    newAchievements:    newAchievements,
    decay:              decayInfo,
  };
}

// =====================================================================
// 2. evaluateStudent : 先生からの個別評価（10倍XP）
// =====================================================================
function evaluateStudent(payload) {
  const teacherId = payload.teacher_id;
  const studentId = payload.student_id;

  if (!teacherId) throw new Error('teacher_idが指定されていません');
  if (!studentId) throw new Error('student_idが指定されていません');
  if (!Array.isArray(payload.evaluations) || payload.evaluations.length === 0) {
    throw new Error('evaluationsが空です');
  }

  const teacher = _getUser_(teacherId);
  const student = _getUser_(studentId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new Error('先生権限がありません');
  }
  if (!student || student.role !== 'student') {
    throw new Error('評価対象が生徒ではありません');
  }

  const now   = _nowStr_();
  const today = _todayStr_();

  const todayEvaluatedKeys =
    _getTeacherTodayEvaluatedKeys_(teacherId, studentId, today);

  const taskLogSheet = _sheet_('task_logs');
  let totalXpGranted = 0;
  let evaluatedCount = 0;
  const skippedTaskIds = [];

  payload.evaluations.forEach(ev => {
    _validateScore_(ev.score);
    if (todayEvaluatedKeys.has(ev.task_id)) {
      skippedTaskIds.push(ev.task_id);
      return;
    }

    const xp = ev.score * SELF_TASK_XP_PER_SCORE * TEACHER_EVAL_MULTIPLIER;
    totalXpGranted += xp;
    evaluatedCount++;

    const comment = (ev.comment || '').toString().slice(0, 30);

    taskLogSheet.appendRow([
      studentId, now, ev.task_id, ev.score, xp, teacherId, comment,
    ]);
  });

  const updated = _addXpToUser_(
    studentId,
    totalXpGranted,
    'teacher_eval',
    `先生「${teacher.name}」から★評価！（${evaluatedCount}件）`,
  );

  const newAchievements = _checkAchievements_(studentId);

  return {
    xp_granted:       totalXpGranted,
    student_level:    updated.level,
    student_total_xp: updated.total_xp,
    evaluated_count:  evaluatedCount,
    skipped_task_ids: skippedTaskIds,
    newAchievements:  newAchievements,
  };
}

// =====================================================================
// ★★★ Phase 5.0：evaluateBulkStudents 全体評価（一括評価/5倍XP） ★★★
// =====================================================================
function evaluateBulkStudents(payload) {
  // ====== 1. パラメータ検証 ======
  const teacherId  = payload.teacher_id;
  const studentIds = payload.student_ids;

  if (!teacherId) throw new Error('teacher_idが指定されていません');
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new Error('生徒IDの配列が空です');
  }
  if (!Array.isArray(payload.evaluations) || payload.evaluations.length === 0) {
    throw new Error('evaluationsが空です');
  }

  const teacher = _getUser_(teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new Error('先生権限がありません');
  }

  // 評価データの事前バリデーション（1度で全部チェック）
  payload.evaluations.forEach(ev => {
    _validateScore_(ev.score);
    if (!ev.task_id) throw new Error('task_idが空の評価データがあります');
  });

  // ====== 2. 一括取得（パフォーマンス最適化の要） ======
  const now   = _nowStr_();
  const today = _todayStr_();

  const allUsersMap = _getAllUsersMap_();

  const userStatusSheet = _sheet_('user_status');
  const userStatusData  = userStatusSheet.getDataRange().getValues();
  const userStatusRowMap = {};
  for (let i = 1; i < userStatusData.length; i++) {
    const uid = userStatusData[i][0];
    if (!uid) continue;
    userStatusRowMap[uid] = {
      rowIndex:           i + 1,
      total_xp:           Number(userStatusData[i][1]) || 0,
      level:              Number(userStatusData[i][2]) || 1,
      last_practice_date: userStatusData[i][3] || '',
      last_decay_date:    userStatusData[i][4] || '',
      favorite_technique: userStatusData[i][5] || '',
      catchphrase:        userStatusData[i][6] || '',
    };
  }

  const taskLogSheet = _sheet_('task_logs');
  const taskLogData  = taskLogSheet.getDataRange().getValues();

  const todayEvaluatedKeySet = new Set();
  for (let i = 1; i < taskLogData.length; i++) {
    const logUserId      = taskLogData[i][0];
    const logDateStr     = String(taskLogData[i][1]).slice(0, 10);
    const logTaskId      = taskLogData[i][2];
    const logEvaluatorId = taskLogData[i][5];
    if (logEvaluatorId === teacherId && logDateStr === today) {
      todayEvaluatedKeySet.add(logUserId + '|' + logTaskId);
    }
  }

  // ====== 3. 各生徒について評価処理（メモリ上で計算） ======
  const newTaskLogRows = [];
  const newXpHistoryRows = [];
  const userStatusUpdates = [];
  const results = [];
  const failures = [];
  let totalXpGrantedAll = 0;
  let processedCount = 0;

  const uniqueStudentIds = Array.from(new Set(studentIds));

  uniqueStudentIds.forEach(studentId => {
    try {
      const student = allUsersMap[studentId];
      if (!student) {
        failures.push({ student_id: studentId, reason: '生徒が見つかりません' });
        return;
      }
      if (student.role !== 'student') {
        failures.push({ student_id: studentId, reason: '対象が生徒ではありません' });
        return;
      }

      let xpForThisStudent = 0;
      let evalCountForThisStudent = 0;
      let skippedCountForThisStudent = 0;

      payload.evaluations.forEach(ev => {
        const dedupeKey = studentId + '|' + ev.task_id;
        if (todayEvaluatedKeySet.has(dedupeKey)) {
          skippedCountForThisStudent++;
          return;
        }

        const xp = ev.score * SELF_TASK_XP_PER_SCORE * BULK_EVAL_MULTIPLIER;
        xpForThisStudent += xp;
        evalCountForThisStudent++;

        const comment = (ev.comment || '').toString().slice(0, 30);

        newTaskLogRows.push([
          studentId, now, ev.task_id, ev.score, xp, teacherId, comment,
        ]);

        todayEvaluatedKeySet.add(dedupeKey);
      });

      let currentStatus = userStatusRowMap[studentId];
      let needNewRow = false;
      if (!currentStatus) {
        needNewRow = true;
        currentStatus = {
          rowIndex:           -1,
          total_xp:           0,
          level:              1,
          last_practice_date: '',
          last_decay_date:    '',
          favorite_technique: '',
          catchphrase:        '',
        };
      }

      const newTotalXp = Math.max(0, currentStatus.total_xp + xpForThisStudent);
      const newLevel   = _calcLevelFromXp_(newTotalXp);

      userStatusUpdates.push({
        studentId:    studentId,
        rowIndex:     currentStatus.rowIndex,
        needNewRow:   needNewRow,
        newTotalXp:   newTotalXp,
        newLevel:     newLevel,
        prevDate:     currentStatus.last_practice_date,
        prevDecay:    currentStatus.last_decay_date,
        prevFavTech:  currentStatus.favorite_technique,
        prevCatch:    currentStatus.catchphrase,
      });

      if (xpForThisStudent > 0) {
        newXpHistoryRows.push([
          studentId,
          now,
          'teacher_bulk_eval',
          xpForThisStudent,
          `先生「${teacher.name}」から全体評価！（${evalCountForThisStudent}件・×${BULK_EVAL_MULTIPLIER}倍）`,
          newTotalXp,
          newLevel,
        ]);
      }

      userStatusRowMap[studentId] = Object.assign({}, currentStatus, {
        total_xp: newTotalXp,
        level:    newLevel,
      });

      results.push({
        student_id:    studentId,
        student_name:  student.name,
        xp_granted:    xpForThisStudent,
        new_total_xp:  newTotalXp,
        new_level:     newLevel,
        skipped_count: skippedCountForThisStudent,
      });

      totalXpGrantedAll += xpForThisStudent;
      processedCount++;

    } catch (e) {
      failures.push({
        student_id: studentId,
        reason:     e.message || '不明なエラー',
      });
    }
  });

  // ====== 4. 一括書き込み ======
  if (newTaskLogRows.length > 0) {
    const startRow = taskLogSheet.getLastRow() + 1;
    taskLogSheet
      .getRange(startRow, 1, newTaskLogRows.length, newTaskLogRows[0].length)
      .setValues(newTaskLogRows);
  }

  userStatusUpdates.forEach(upd => {
    if (upd.needNewRow) {
      userStatusSheet.appendRow([
        upd.studentId,
        upd.newTotalXp,
        upd.newLevel,
        upd.prevDate,
        upd.prevDecay,
        upd.prevFavTech,
        upd.prevCatch,
      ]);
    } else {
      userStatusSheet.getRange(upd.rowIndex, 2).setValue(upd.newTotalXp);
      userStatusSheet.getRange(upd.rowIndex, 3).setValue(upd.newLevel);
    }
  });

  if (newXpHistoryRows.length > 0) {
    const xpHistorySheet = _sheet_('xp_history');
    const startRow = xpHistorySheet.getLastRow() + 1;
    xpHistorySheet
      .getRange(startRow, 1, newXpHistoryRows.length, newXpHistoryRows[0].length)
      .setValues(newXpHistoryRows);
  }

  // ====== 5. レスポンス組み立て ======
  const xpPerStudent = processedCount > 0
    ? Math.floor(totalXpGrantedAll / processedCount)
    : 0;

  return {
    processed_count:  processedCount,
    failed_count:     failures.length,
    failures:         failures,
    total_xp_granted: totalXpGrantedAll,
    xp_per_student:   xpPerStudent,
    multiplier:       BULK_EVAL_MULTIPLIER,
    evaluated_count:  payload.evaluations.length,
    results:          results,
  };
}

// =====================================================================
// 3. getDashboard : 生徒用ダッシュボード
// =====================================================================
function getDashboard(userId) {
  if (!userId) throw new Error('user_idが指定されていません');

  const user = _getUser_(userId);
  if (!user) throw new Error('ユーザーが見つかりません');
  if (user.role !== 'student') throw new Error('生徒のみが利用できます');

  const decayInfo = _applyDecayIfNeeded_(userId);

  const statusRaw = _getOrCreateUserStatus_(userId);
  const status = {
    total_xp:           statusRaw.total_xp,
    level:              statusRaw.level,
    last_practice_date: statusRaw.last_practice_date || null,
    favorite_technique: statusRaw.favorite_technique || '',
    catchphrase:        statusRaw.catchphrase || '',
  };

  const taskMaster      = _getTaskMaster_();
  const techniqueMaster = _getTechniqueMaster_();
  const titleMaster     = _getTitleMaster_();
  const taskMap         = _toMap_(taskMaster, 'id');

  const userMap = _getAllUsersMap_();

  const taskLogs = _getTaskLogs_(userId, TASK_LOG_LIMIT_DAYS, taskMap, userMap);
  const techniqueLogs = _getTechniqueLogs_(userId, TECH_LOG_LIMIT_DAYS);
  const xpHistory = _getXpHistory_(userId, XP_HISTORY_LIMIT);

  const teacherEvalLogs = taskLogs.filter(l => l.evaluator_id !== 'self');

  const techniques = _getUserTechniques_(userId, techniqueMaster);

  const nextLevelXp = _calcNextLevelInfo_(status.total_xp, status.level, titleMaster);

  const achievements = _getUserAchievementsWithMaster_(userId);

  return {
    user:            user,
    status:          status,
    taskMaster:      taskMaster,
    techniqueMaster: techniqueMaster,
    titleMaster:     titleMaster,
    taskLogs:        taskLogs,
    techniqueLogs:   techniqueLogs,
    techniques:      techniques,
    xpHistory:       xpHistory,
    teacherEvals:    teacherEvalLogs,
    decay:           decayInfo,
    nextLevelXp:     nextLevelXp,
    achievements:    achievements,
  };
}

// =====================================================================
// 4. getTeacherDashboard : 先生用ダッシュボード（門下生一覧）
// =====================================================================
function getTeacherDashboard(teacherId) {
  if (!teacherId) throw new Error('teacher_idが指定されていません');

  const teacher = _getUser_(teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new Error('先生権限がありません');
  }

  const allUsers = _getAllUsers_();
  const students = allUsers.filter(u => u.role === 'student');

  const statusMap = _getAllUserStatusMap_();
  const techPointsMap = _getAllTechniquePointsMap_();
  const titleMaster = _getTitleMaster_();
  const taskMaster = _getTaskMaster_();

  const today = new Date(_todayStr_());

  const summaries = students.map(s => {
    const st = statusMap[s.id] || {
      total_xp: 0, level: 1, last_practice_date: '',
    };
    const techPoints = techPointsMap[s.id] || {};
    const lastDateStr = st.last_practice_date || null;
    let daysSince = null;
    if (lastDateStr) {
      const last = new Date(lastDateStr);
      daysSince = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    }

    return {
      user_id:  s.id,
      name:     s.name,
      grade:    s.grade,
      level:    st.level,
      total_xp: st.total_xp,
      last_practice_date: lastDateStr,
      techniquePoints: {
        T001: techPoints['T001'] || 0,
        T002: techPoints['T002'] || 0,
        T003: techPoints['T003'] || 0,
      },
      daysSinceLastPractice: daysSince,
    };
  });

  summaries.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.name.localeCompare(b.name, 'ja');
  });

  return {
    teacher:     teacher,
    students:    summaries,
    titleMaster: titleMaster,
    taskMaster:  taskMaster,
  };
}

// =====================================================================
// 5. getStudentDetail : 先生が個別生徒を開いた際のデータ
// =====================================================================
function getStudentDetail(teacherId, studentId) {
  if (!teacherId) throw new Error('teacher_idが指定されていません');
  if (!studentId) throw new Error('student_idが指定されていません');

  const teacher = _getUser_(teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new Error('先生権限がありません');
  }
  const student = _getUser_(studentId);
  if (!student || student.role !== 'student') {
    throw new Error('対象が生徒ではありません');
  }

  const statusRaw = _getOrCreateUserStatus_(studentId);
  const status = {
    total_xp:           statusRaw.total_xp,
    level:              statusRaw.level,
    last_practice_date: statusRaw.last_practice_date || null,
    favorite_technique: statusRaw.favorite_technique || '',
    catchphrase:        statusRaw.catchphrase || '',
  };

  const taskMaster      = _getTaskMaster_();
  const techniqueMaster = _getTechniqueMaster_();
  const titleMaster     = _getTitleMaster_();
  const taskMap         = _toMap_(taskMaster, 'id');
  const userMap         = _getAllUsersMap_();

  const recentLogs = _getTaskLogs_(studentId, STUDENT_DETAIL_LOG_DAYS, taskMap, userMap);

  const techniques = _getUserTechniques_(studentId, techniqueMaster);

  const today = _todayStr_();
  const todayEvaluatedKeys = _getTeacherTodayEvaluatedKeys_(teacherId, studentId, today);
  const todayEvaluatedTaskIds = Array.from(todayEvaluatedKeys);

  return {
    student:               student,
    status:                status,
    taskMaster:            taskMaster,
    techniqueMaster:       techniqueMaster,
    titleMaster:           titleMaster,
    recentLogs:            recentLogs,
    techniques:            techniques,
    todayEvaluatedTaskIds: todayEvaluatedTaskIds,
  };
}

// =====================================================================
// === マスタ取得ヘルパー ===
// =====================================================================

function _getTaskMaster_() {
  const sh = _sheet_('task_master');
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      id:           data[i][0],
      taskText:     data[i][1],
      displayOrder: Number(data[i][2]) || 0,
      gradeMin:     Number(data[i][3]) || 1,
    });
  }
  result.sort((a, b) => a.displayOrder - b.displayOrder);
  return result;
}

function _getTechniqueMaster_() {
  const sh = _sheet_('technique_master');
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      id:           data[i][0],
      name:         data[i][1],
      displayOrder: Number(data[i][2]) || 0,
    });
  }
  result.sort((a, b) => a.displayOrder - b.displayOrder);
  return result;
}

function _getTitleMaster_() {
  const sh = _sheet_('title_master');
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      level: Number(data[i][0]),
      title: data[i][1],
    });
  }
  result.sort((a, b) => a.level - b.level);
  return result;
}

// =====================================================================
// === ログ取得ヘルパー ===
// =====================================================================

function _getTaskLogs_(userId, limitDays, taskMap, userMap) {
  const sh = _sheet_('task_logs');
  const data = sh.getDataRange().getValues();
  const cutoff = _daysAgo_(limitDays);
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== userId) continue;
    const dateStr = String(data[i][1] || '');
    if (dateStr < cutoff) continue;

    const taskId      = data[i][2];
    const evaluatorId = data[i][5] || 'self';
    const taskInfo    = taskMap[taskId];

    let evaluatorName = '';
    if (evaluatorId !== 'self' && userMap[evaluatorId]) {
      evaluatorName = userMap[evaluatorId].name;
    }

    result.push({
      date:           dateStr,
      task_id:        taskId,
      task_text:      taskInfo ? taskInfo.taskText : '(削除済み)',
      score:          Number(data[i][3]) || 0,
      xp_earned:      Number(data[i][4]) || 0,
      evaluator_id:   evaluatorId,
      evaluator_name: evaluatorName,
      comment:        data[i][6] || '',
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

function _getTechniqueLogs_(userId, limitDays) {
  const sh = _sheet_('technique_logs');
  const data = sh.getDataRange().getValues();
  const cutoff = _daysAgo_(limitDays);
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== userId) continue;
    const dateStr = String(data[i][1] || '');
    if (dateStr < cutoff) continue;
    result.push({
      date:         dateStr,
      technique_id: data[i][2],
      quantity:     Number(data[i][3]) || 0,
      quality:      Number(data[i][4]) || 0,
      xp_earned:    Number(data[i][5]) || 0,
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

function _getXpHistory_(userId, limit) {
  const sh = _sheet_('xp_history');
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== userId) continue;
    result.push({
      date:           String(data[i][1] || ''),
      type:           data[i][2] || 'gain',
      amount:         Number(data[i][3]) || 0,
      reason:         data[i][4] || '',
      total_xp_after: Number(data[i][5]) || 0,
      level:          Number(data[i][6]) || 1,
    });
  }
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result.slice(0, limit);
}

function _getUserTechniques_(userId, techniqueMaster) {
  const sh = _sheet_('user_techniques');
  const data = sh.getDataRange().getValues();
  const userTechMap = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== userId) continue;
    userTechMap[data[i][1]] = {
      points:        Number(data[i][2]) || 0,
      last_quantity: Number(data[i][3]) || null,
      last_quality:  Number(data[i][4]) || null,
    };
  }
  return techniqueMaster.map(tm => {
    const r = userTechMap[tm.id] || { points: 0, last_quantity: null, last_quality: null };
    return {
      id:            tm.id,
      name:          tm.name,
      points:        r.points,
      last_quantity: r.last_quantity,
      last_quality:  r.last_quality,
    };
  });
}

function _getUserAchievementsWithMaster_(userId) {
  const masterSh = _sheet_('achievement_master');
  const masterData = masterSh.getDataRange().getValues();
  const userSh = _sheet_('user_achievements');
  const userData = userSh.getDataRange().getValues();

  const unlockedMap = {};
  for (let i = 1; i < userData.length; i++) {
    if (userData[i][0] === userId) {
      unlockedMap[userData[i][1]] = userData[i][2] || '';
    }
  }

  const result = [];
  for (let i = 1; i < masterData.length; i++) {
    if (!masterData[i][0]) continue;
    const id = masterData[i][0];
    const isUnlocked = !!unlockedMap[id];
    result.push({
      id:          id,
      name:        masterData[i][1],
      description: masterData[i][4] || '',
      hint:        masterData[i][5] || '',
      iconType:    masterData[i][6] || '',
      isUnlocked:  isUnlocked,
      unlockedAt:  isUnlocked ? unlockedMap[id] : null,
    });
  }
  return result;
}

// =====================================================================
// === ユーザー集合取得ヘルパー ===
// =====================================================================

function _getAllUsers_() {
  const sh = _sheet_('users');
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    result.push({
      id:    data[i][0],
      name:  data[i][1],
      role:  data[i][3],
      grade: Number(data[i][4]) || 0,
    });
  }
  return result;
}

function _getAllUsersMap_() {
  const users = _getAllUsers_();
  const map = {};
  users.forEach(u => { map[u.id] = u; });
  return map;
}

function _getAllUserStatusMap_() {
  const sh = _sheet_('user_status');
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    map[data[i][0]] = {
      total_xp:           Number(data[i][1]) || 0,
      level:              Number(data[i][2]) || 1,
      last_practice_date: data[i][3] || '',
      last_decay_date:    data[i][4] || '',
      favorite_technique: data[i][5] || '',
      catchphrase:        data[i][6] || '',
    };
  }
  return map;
}

function _getAllTechniquePointsMap_() {
  const sh = _sheet_('user_techniques');
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const userId = data[i][0];
    const techId = data[i][1];
    if (!userId || !techId) continue;
    if (!map[userId]) map[userId] = {};
    map[userId][techId] = Number(data[i][2]) || 0;
  }
  return map;
}

// =====================================================================
// === レベル/称号関連 ===
// =====================================================================

function _calcNextLevelInfo_(totalXp, currentLevel, titleMaster) {
  if (currentLevel >= MAX_LEVEL) {
    return { required: null, title: '剣聖' };
  }
  const nextLevel = currentLevel + 1;
  const nextXp    = _xpForLevel_(nextLevel);
  const required  = Math.max(0, nextXp - totalXp);
  const nextTitle = _titleForLevel_(nextLevel, titleMaster);
  return { required: required, title: nextTitle };
}

function _titleForLevel_(level, titleMaster) {
  let title = titleMaster.length > 0 ? titleMaster[0].title : 'みならい剣士';
  for (const t of titleMaster) {
    if (level >= t.level) title = t.title;
    else break;
  }
  return title;
}

// =====================================================================
// === 共通ユーティリティ ===
// =====================================================================

function _sheet_(name) {
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('シートが見つかりません: ' + name);
  return sh;
}

function _jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function _nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function _daysAgo_(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function _toMap_(arr, keyField) {
  const map = {};
  arr.forEach(item => { map[item[keyField]] = item; });
  return map;
}

function _validateScore_(score) {
  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error('scoreは1〜5の整数で指定してください: ' + score);
  }
}

function _validateLevel3_(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3) {
    throw new Error(`${label}は1〜3の整数で指定してください: ` + value);
  }
}

function _validateTechniqueId_(id) {
  if (!['T001', 'T002', 'T003'].includes(id)) {
    throw new Error('技IDが不正です: ' + id);
  }
}

function _getUser_(userId) {
  const sh = _sheet_('users');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return {
        id:    data[i][0],
        name:  data[i][1],
        role:  data[i][3],
        grade: Number(data[i][4]) || 0,
      };
    }
  }
  return null;
}

function _getOrCreateUserStatus_(userId) {
  const sh = _sheet_('user_status');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return {
        rowIndex: i + 1,
        userId:   data[i][0],
        total_xp: Number(data[i][1]) || 0,
        level:    Number(data[i][2]) || 1,
        last_practice_date: data[i][3] || '',
        last_decay_date:    data[i][4] || '',
        favorite_technique: data[i][5] || '',
        catchphrase:        data[i][6] || '',
      };
    }
  }
  sh.appendRow([userId, 0, 1, '', '', '', '']);
  return {
    rowIndex: sh.getLastRow(),
    userId:   userId,
    total_xp: 0,
    level:    1,
    last_practice_date: '',
    last_decay_date:    '',
    favorite_technique: '',
    catchphrase:        '',
  };
}

function _addXpToUser_(userId, xpDelta, type, reason) {
  const sh = _sheet_('user_status');
  const status = _getOrCreateUserStatus_(userId);
  const newTotal = Math.max(0, status.total_xp + xpDelta);
  const newLevel = _calcLevelFromXp_(newTotal);

  sh.getRange(status.rowIndex, 2).setValue(newTotal);
  sh.getRange(status.rowIndex, 3).setValue(newLevel);

  _sheet_('xp_history').appendRow([
    userId, _nowStr_(), type, xpDelta, reason, newTotal, newLevel,
  ]);

  return { total_xp: newTotal, level: newLevel };
}

function _updateLastPracticeDate_(userId, dateStr) {
  const sh = _sheet_('user_status');
  const status = _getOrCreateUserStatus_(userId);
  sh.getRange(status.rowIndex, 4).setValue(dateStr);
}

function _xpForLevel_(level) {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 1.6));
}

function _calcLevelFromXp_(xp) {
  let level = 1;
  for (let n = 1; n <= MAX_LEVEL; n++) {
    if (xp >= _xpForLevel_(n)) level = n;
    else break;
  }
  return Math.min(level, MAX_LEVEL);
}

function _upsertUserTechnique_(userId, techId, addPoints, lastQuantity, lastQuality) {
  const sh = _sheet_('user_techniques');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][1] === techId) {
      const newPoints = (Number(data[i][2]) || 0) + addPoints;
      sh.getRange(i + 1, 3).setValue(newPoints);
      sh.getRange(i + 1, 4).setValue(lastQuantity);
      sh.getRange(i + 1, 5).setValue(lastQuality);
      return;
    }
  }
  sh.appendRow([userId, techId, addPoints, lastQuantity, lastQuality]);
}

function _getTeacherTodayEvaluatedKeys_(teacherId, studentId, todayStr) {
  const sh = _sheet_('task_logs');
  const data = sh.getDataRange().getValues();
  const keys = new Set();
  for (let i = 1; i < data.length; i++) {
    const userId      = data[i][0];
    const dateStr     = String(data[i][1]).slice(0, 10);
    const taskId      = data[i][2];
    const evaluatorId = data[i][5];
    if (userId === studentId && evaluatorId === teacherId && dateStr === todayStr) {
      keys.add(taskId);
    }
  }
  return keys;
}

function _applyDecayIfNeeded_(userId) {
  const status = _getOrCreateUserStatus_(userId);
  if (!status.last_practice_date) return null;

  const today = new Date(_todayStr_());
  const last  = new Date(status.last_practice_date);
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

  if (diffDays < DECAY_THRESHOLD_DAYS) return null;
  if (status.last_decay_date === _todayStr_()) return null;

  const penalty = Math.ceil(status.total_xp * DECAY_RATE);
  if (penalty <= 0) return null;

  _addXpToUser_(userId, -penalty, 'decay',
    `${diffDays}日間稽古がなく経験値が減りました`);

  const sh = _sheet_('user_status');
  sh.getRange(status.rowIndex, 5).setValue(_todayStr_());

  return {
    applied:       penalty,
    days_absent:   diffDays,
    today_penalty: penalty,
  };
}

function _checkAchievements_(userId) {
  // TODO: Phase 6 で本実装
  return [];
}

function _logError_(action, message, detail) {
  try {
    const sh = _sheet_('error_logs');
    sh.appendRow([
      _nowStr_(),
      'ERROR',
      action,
      message,
      String(detail).slice(0, 500),
    ]);
    if (sh.getLastRow() > 1001) {
      sh.deleteRows(2, 50);
    }
  } catch (e) {
    // サイレントに
  }
}

// =====================================================================
// ★★★ Phase 6: ミニゲーム『刹那ノ見切』バックエンド ★★★
// =====================================================================
//
// 仕様:
//  - 門下生（生徒）専用のボーナスXP獲得ミニゲーム
//  - 1日5回まで（Asia/Tokyo 日付境界でリセット）
//  - ランク別獲得XP: S=50 / A=30 / B=20 / C=10 / F=0
//  - 既存の _addXpToUser_ を再利用して総XPへ加算＆レベルアップ判定
//  - minigame_scores シート（SHEET_SCHEMAS で定義済み）に履歴を記録
//    列: id, user_id, created_at, average_time, rank, earned_xp
//  - ランキング: 生徒ごとのベストタイム（最小 average_time）上位10名
// =====================================================================

/**
 * 日付値を Asia/Tokyo の YYYY-MM-DD 文字列へ変換
 */
function _mgDateStr_(val) {
  if (!val) return '';
  try {
    if (val instanceof Date) {
      return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    const s = String(val);
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
  } catch (e) {
    // フォールスルー
  }
  return '';
}

// =====================================================================
// 6-1. getMinigameStatus : 本日のプレイ状況＆自己ベストを取得
// =====================================================================
function getMinigameStatus(userId) {
  if (!userId) throw new Error('user_idが指定されていません');

  const user = _getUser_(userId);
  if (!user) throw new Error('ユーザーが見つかりません: ' + userId);
  if (user.role !== 'student') {
    throw new Error('門下生のみがミニゲームを利用できます');
  }

  const today = _todayStr_();
  const sh = _sheet_('minigame_scores');
  const data = sh.getDataRange().getValues();

  // 列: id(0), user_id(1), created_at(2), average_time(3), rank(4), earned_xp(5)
  let todayPlayed = 0;
  let bestTimeMs  = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;

    if (_mgDateStr_(data[i][2]) === today) {
      todayPlayed++;
    }

    const t = Number(data[i][3]);
    if (Number.isFinite(t) && t > 0) {
      if (bestTimeMs === null || t < bestTimeMs) {
        bestTimeMs = t;
      }
    }
  }

  const remaining = Math.max(0, MINIGAME_DAILY_LIMIT - todayPlayed);

  return {
    todayPlayed: todayPlayed,
    dailyLimit:  MINIGAME_DAILY_LIMIT,
    remaining:   remaining,
    locked:      todayPlayed >= MINIGAME_DAILY_LIMIT,
    bestTimeMs:  bestTimeMs,
  };
}

// =====================================================================
// 6-2. saveMinigameResult : 試合結果を保存し、ランクに応じたXPを付与
// =====================================================================
function saveMinigameResult(payload) {
  const userId = payload.user_id;
  if (!userId) throw new Error('user_idが指定されていません');

  // ── 1. ユーザー＆権限チェック ──
  const user = _getUser_(userId);
  if (!user) throw new Error('ユーザーが見つかりません: ' + userId);
  if (user.role !== 'student') {
    throw new Error('門下生のみがミニゲームを利用できます');
  }

  // ── 2. 入力検証 ──
  const avgMs = Math.floor(Number(payload.averageTime));
  if (!Number.isFinite(avgMs) || avgMs < 0) {
    throw new Error('averageTimeは0以上の数値で指定してください');
  }

  const rank = String(payload.rank || '').toUpperCase();
  if (!MINIGAME_XP_TABLE.hasOwnProperty(rank)) {
    throw new Error('rankはS/A/B/C/Fのいずれかで指定してください: ' + payload.rank);
  }

  // ── 3. 本日プレイ数チェック（サーバーサイドで再検証） ──
  const today = _todayStr_();
  const sh = _sheet_('minigame_scores');
  const data = sh.getDataRange().getValues();

  let todayPlayed = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] !== userId) continue;
    if (_mgDateStr_(data[i][2]) === today) {
      todayPlayed++;
    }
  }

  if (todayPlayed >= MINIGAME_DAILY_LIMIT) {
    throw new Error(
      '本日の立ち合い上限（' + MINIGAME_DAILY_LIMIT + '本）に達しています',
    );
  }

  // ── 4. 獲得XP決定 ──
  const earnedXp = MINIGAME_XP_TABLE[rank];

  // ── 5. minigame_scores に履歴を記録 ──
  const now = _nowStr_();
  const id  = Utilities.getUuid();
  sh.appendRow([id, userId, now, avgMs, rank, earnedXp]);

  // ── 6. XP加算＆レベルアップ判定 ──
  const beforeStatus = _getOrCreateUserStatus_(userId);
  const beforeLevel  = beforeStatus.level;

  let updated;
  if (earnedXp > 0) {
    const avgSec = (avgMs / 1000).toFixed(3);
    updated = _addXpToUser_(
      userId,
      earnedXp,
      'minigame',
      `刹那ノ見切（${rank}ランク・平均見切り${avgSec}秒）`,
    );
  } else {
    // F ランク（0XP）は xp_history を汚さず、現状ステータスをそのまま返す
    updated = {
      total_xp: beforeStatus.total_xp,
      level:    beforeStatus.level,
    };
  }

  const leveledUp = updated.level > beforeLevel;

  // ── 7. 保存後の状態を返す ──
  const newTodayPlayed = todayPlayed + 1;

  return {
    saved:       true,
    earnedXp:    earnedXp,
    totalXp:     updated.total_xp,
    level:       updated.level,
    leveledUp:   leveledUp,
    todayPlayed: newTodayPlayed,
    remaining:   Math.max(0, MINIGAME_DAILY_LIMIT - newTodayPlayed),
    locked:      newTodayPlayed >= MINIGAME_DAILY_LIMIT,
    averageTime: avgMs,
    rank:        rank,
  };
}

// =====================================================================
// 6-3. getMinigameRanking : 道場内ベストタイム上位10名を取得
//
//   引数: なし
//   戻り値: Array<{ userId, name, bestTimeMs }>
//     - 生徒ごとに最小の average_time（最速）を集計
//     - bestTimeMs 昇順（速い順）で上位10名
//     - 生徒マスタに存在し role==='student' のユーザーのみ対象
// =====================================================================
function getMinigameRanking() {
  const sh = _sheet_('minigame_scores');
  const data = sh.getDataRange().getValues();

  // 生徒情報マップ（id -> { name, role }）
  const usersMap = _getAllUsersMap_();

  // userId -> bestTimeMs（最小値）を集計
  const bestMap = {};
  // 列: id(0), user_id(1), created_at(2), average_time(3), rank(4), earned_xp(5)
  for (let i = 1; i < data.length; i++) {
    const uid = data[i][1];
    if (!uid) continue;

    // 生徒以外（先生・退会者など）は除外
    const u = usersMap[uid];
    if (!u || u.role !== 'student') continue;

    const t = Number(data[i][3]);
    if (!Number.isFinite(t) || t <= 0) continue;

    if (bestMap[uid] === undefined || t < bestMap[uid]) {
      bestMap[uid] = t;
    }
  }

  // 配列化 → 名前解決 → 昇順ソート → 上位10名
  const ranking = Object.keys(bestMap).map(function (uid) {
    const u = usersMap[uid];
    return {
      userId:     uid,
      name:       u ? u.name : uid,
      bestTimeMs: bestMap[uid],
    };
  });

  ranking.sort(function (a, b) {
    return a.bestTimeMs - b.bestTimeMs; // 速い（小さい）ほど上位
  });

  return ranking.slice(0, MINIGAME_RANKING_LIMIT);
}
