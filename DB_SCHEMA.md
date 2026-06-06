# Database Schema (Google Sheets) - 燃えろ剣士

バックエンド（GAS）はスプレッドシートをDBとして利用する。
小学生向けスピンオフ版のため、百錬自得から以下を削除・簡素化：

- ❌ user_tasks（ユーザー個別課題） → ✅ task_master（共通固定課題）に置換
- ❌ EpithetMaster（二つ名）/ MatchupMaster（剣風相性）/ peers_style → 全廃
- ❌ technique_master の SubCategory / ActionType → 廃止（3技のみに固定）
- ✅ role を 'student' / 'teacher' に変更
- ✅ 先生評価ボーナス倍率を ×10 に強化

---

## 1. ユーザー情報・設定

### `users`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | ユーザーID (例: U0001) |
| B | name | string | 剣士名（ニックネーム可） |
| C | passcode | string | ログイン用パスコード(4〜8桁) |
| D | role | string | **'student' or 'teacher'** |
| E | grade | number | 学年（1〜6）。teacher は 0 |

### `user_status`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | total_xp | number | 累計経験値 |
| C | level | number | 修行度（1〜50。小学生向けに上限を抑制） |
| D | last_practice_date | string | 最終稽古日 (YYYY-MM-DD) |
| E | last_decay_date | string | 最終減衰適用日 |
| F | favorite_technique | string | 得意技ID (T001=面 / T002=小手 / T003=胴) |
| G | catchphrase | string | 自分のかけ声（10文字以内、例: 「いざ尋常に！」） |

> **削除項目**: real_rank（段位）/ motto（座右の銘）  
> 小学生には「段位」概念は早く、座右の銘は「かけ声」に変更。

---

## 2. ログ・履歴データ

### `task_logs`（課題評価ログ：自己評価＋先生評価を統合管理）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | 評価対象の生徒ID |
| B | date | string | 稽古日時 (YYYY-MM-DD HH:mm:ss) |
| C | task_id | string | task_master の ID（例: K001） |
| D | score | number | 評価★ (1〜5) |
| E | xp_earned | number | 獲得経験値（先生評価時は ×10 適用済み） |
| F | evaluator_id | string | **'self'=自己評価 / それ以外=先生のuser_id** |
| G | comment | string | ひとこと（任意・30文字以内、主に先生用） |

> 🔑 設計ポイント：
> - `evaluator_id === 'self'` で自己評価/先生評価を判別
> - 先生評価時のみ `xp_earned` に ×10 ボーナスを適用
> - `comment` は自己評価では基本空文字、先生のみ入力UI提供

### `technique_logs`（技の記録）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | date | string | 記録日時 |
| C | technique_id | string | T001/T002/T003 のいずれか |
| D | quantity | number | 量 (1=少ない / 2=普通 / 3=多い) |
| E | quality | number | 質 (1=まぐれ / 2=普通 / 3=会心) |
| F | xp_earned | number | 獲得経験値 |

### `user_techniques`（技の累積）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | technique_id | string | 技ID |
| C | points | number | 累計ポイント（三角レーダー用） |
| D | last_quantity | number | 最後の量 |
| E | last_quality | number | 最後の質 |

> **被打分析（received_technique_logs）は廃止**。小学生に「打たれた原因」を分析させるのは認知負荷が高すぎる。

### `xp_history`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | date | string | 記録日時 |
| C | type | string | 'gain' / 'decay' / 'teacher_eval' / 'minigame' |
| D | amount | number | 増減経験値 |
| E | reason | string | 獲得理由（例: 「先生から★5！」） |
| F | total_xp_after | number | 獲得後累計 |
| G | level | number | 獲得後修行度 |

---

> ❌ Phase 1 修正: teacher_evaluations テーブルは廃止。
>    全ての評価ログは task_logs に統合し、evaluator_id で識別する。

<!-- ### `teacher_evaluations`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | teacher_id | string | 先生のID |
| B | student_id | string | 生徒のID |
| C | task_id | string | 評価対象の固定課題ID |
| D | date | string | 記録日時 |
| E | score | number | ★1〜5 |
| F | xp_granted | number | 生徒に付与した経験値（×10適用済み） |
| G | comment | string | ひとこと（任意・30文字以内） |

> 先生評価が入った瞬間、生徒側にPush通知（Phase 8）。
 -->
---

## 4. 実績・ミニゲーム

### `user_achievements`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | achievement_id | string | 実績ID |
| C | unlocked_at | string | 解除日時 |

### `minigame_scores`（刹那ノ見切：小学生緩和版）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | UUID |
| B | user_id | string | ユーザーID |
| C | created_at | string | 試合終了日時 |
| D | average_time | number | 平均反応速度（ms） |
| E | rank | string | 'S' / 'A' / 'B' / 'C' / 'F' |
| F | earned_xp | number | 付与経験値 |

#### 緩和版ランク判定
| 条件 | ランク | 経験値 |
|:---|:---:|:---:|
| 全本成功 かつ 平均 < **0.50s** | S | 30 |
| 全本成功 かつ 平均 < **0.70s** | A | 20 |
| 全本成功 もしくは 平均 < **0.90s** | B | 10 |
| 1本以上成功 | C | 5 |
| 全本失敗 | F | 2 |

> 制約は百錬自得と同じ：1日3試合まで。

### `push_subscriptions`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | user_id | string | ユーザーID |
| B | subscription_json | string | PushSubscription JSON |
| C | updated_at | string | 最終更新日時 |

---

## 5. マスターデータ

### `task_master`（全員共通の固定課題）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | 課題ID（例: K001） |
| B | task_text | string | 課題の内容 |
| C | display_order | number | 表示順 |
| D | grade_min | number | 対象学年下限（1〜6） |

#### 初期データ案（小学校で習う漢字のみ）
K001 / 大きな声を出す / 1 / 1
K002 / 正しいすり足をする / 2 / 1
K003 / 打つときに両手をぎゅっと絞る / 3 / 1
K004 / まっすぐ振りかぶって打つ / 4 / 2
K005 / 打ったあとに素早く抜け、残心する / 5 / 3


### `technique_master`（3技のみに固定）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | id | string | T001/T002/T003 |
| B | name | string | 技名（面/小手/胴） |
| C | display_order | number | レーダーチャート表示順 |

> SubCategory・ActionType・BodyPart は廃止。

### `title_master`（少年漫画風）
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | level | number | 獲得修行度 |
| B | title | string | 称号 |

#### 初期データ案
1 / みならい剣士
5 / はじまりの剣士
10 / 炎の剣士
15 / 疾風の剣士
20 / 雷鳴の剣士
25 / 鬼神の剣士
30 / 天才剣士
40 / 剣の達人
50 / 剣聖


### `achievement_master`
| 列 | カラム名 | 型 | 説明 |
|:---|:---|:---|:---|
| A | achievement_id | string | 実績ID |
| B | name | string | 実績名（例: 「面マスター」） |
| C | condition_type | string | 'total_practices' / 'teacher_evals' / 'technique_points' |
| D | condition_value | number | 達成条件値 |
| E | description | string | 解除後の説明 |
| F | hint | string | 未解除時のヒント |
| G | icon_type | string | アイコン識別子 |

---

## 6. システム

### `error_logs`
（百錬自得と同一構造のため省略）

---

## 計算式まとめ

| 値 | 計算式 |
|:---|:---|
| 課題評価XP（自己） | `score × 5` |
| 課題評価XP（**先生**） | `score × 5 × 10` ← 中核ボーナス |
| 技XP | `quantity × quality × 3`（最大27XP） |
| ミニゲームXP | ランク表参照 |
| 減衰 | 3日間入力なしで `total_xp × 0.02` を毎日減算 |

---

最終更新: 燃えろ剣士 Phase 1 設計時点
