燃えろ剣士 (Burning Swordsman) - System Architecture

1. システム概要

『燃えろ剣士』は、道場の子どもたち（生徒）が日々の稽古を楽しく記録し、先生がそれをスマートフォンから手軽に評価・フィードバックするための教育支援アプリケーションである。
子ども向けの「熱血ポップ和風」なUIと、先生向けの「一括評価」などの管理機能を備え、道場全体のコミュニケーションとモチベーションを高めることを目的とする。

2. 技術スタック
    Frontend: Next.js 15 (App Router), React, TypeScript
    Styling: Tailwind CSS, インラインCSS (CSS-in-JSスタイル)
    Charts: Recharts (XP推移タイムラインチャート)
    Backend / Database: Supabase (PostgreSQL, text から timestamptz への型最適化済み)
    State Management / Caching: SWR
    Hosting: Cloudflare Pages

3. ディレクトリ構成

    src/
    ├── app/
    │   ├── login/                # ログイン画面
    │   ├── minigame/             # 反射神経ミニゲーム「刹那ノ見切」
    │   ├── record/               # 生徒用：修行の記録（自己評価）画面
    │   ├── settings/             # 設定画面
    │   ├── teacher/              # 先生用：ホーム画面（門下生一覧）
    │   │   ├── bulk/             # 先生用：全体評価（一括評価）画面
    │   │   ├── [studentId]/      # 先生用：個別評価画面
    │   │   └── page.tsx
    │   ├── apple-icon.png        # アプリアイコン画像
    │   ├── favicon.ico
    │   ├── globals.css           # グローバルスタイル
    │   ├── icon.png
    │   ├── layout.tsx            # 全体レイアウト (PWA/メタデータ設定)
    │   ├── manifest.ts           # PWAマニフェスト生成
    │   ├── page.module.css
    │   └── page.tsx              # 生徒用：ホーム画面（ダッシュボード）
    ├── components/
    │   ├── BottomNav.tsx         # 下部ナビゲーション
    │   ├── ResultModal.tsx       # 記録完了・レベルアップ時のリッチなモーダル
    │   ├── SkillTriangle.tsx     # プレイスタイル可視化（三角グラフ）
    │   ├── StatusCard.tsx        # ステータス・レベル表示カード
    │   ├── StudentListCard.tsx   # 門下生一覧カード（先生用）
    │   ├── SWRProviderShell.tsx  # SWRのグローバル設定プロバイダ
    │   ├── TaskCriteriaPanel.tsx # 課題の評価基準パネル
    │   ├── TaskRater.tsx         # 課題評価用UI
    │   ├── TaskReportCard.tsx    # 自己評価・先生評価を並べて表示する通知表
    │   ├── TeacherTaskRater.tsx  # 先生用の評価入力UI
    │   ├── TechniqueRecorder.tsx # 技の記録コンポーネント
    │   └── XpTimelineChart.tsx   # 経験値推移グラフ
    ├── lib/
    │   ├── api.ts                # APIクライアント (Supabase通信)
    │   ├── auth.ts               # 認証・ユーザー情報管理
    │   ├── swrCache.ts           # SWRのキャッシュ戦略・管理
    │   └── taskCriteria.ts       # 課題基準の処理ロジック
    └── types/
        └── index.ts              # 共通型定義・経験値計算ロジック


4. ユーザーロールと機能

4.1 生徒（門下生）モード

    修行のきろく（自己評価）: 日付を遡っての記録が可能（デフォルトは本日）。課題の自己評価と、技（量×質）の入力をワンタップで行う。
    ダッシュボード: 現在のレベル、XP、次レベルまでの進捗、称号を表示。
    修行の通知表（TaskReportCard）: 自己評価（上段）と先生評価（下段・ゴールド）の星を並べて比較でき、先生からのコメントをアコーディオンで確認可能。
    XPタイムライングラフ: 獲得XPの推移を視覚化。

4.2 先生（管理者）モード

    門下生一覧ダッシュボード: 全生徒のレベルや最終稽古日を一覧表示。「サボり判定」（最終稽古日からの経過日数）などのアラートも可視化。
    全体評価（Bulk Evaluation）: 複数の生徒を選択し、一括で評価を送信。道場ボーナスとしてXPが 5倍 付与される。1日1回、未評価の生徒のみ選択可能。
    個別評価（Student Evaluation）: 特定の生徒に対してコメント付きで詳細な評価を送信。師範ボーナスとしてXPが 10倍 付与される。カレンダーUIにより過去日付の評価も可能。

5. データフローと主要ロジック

5.1 バックエンドAPI (src/lib/api.ts)

    「燃えろ剣士」は独立したアプリケーションとして、独自の api.ts を持ち、専用のSupabaseプロジェクトと通信してデータ管理を行う。
    saveLogApi (生徒用): 生徒の自己記録。重複記録を防ぐチェック機構を持ち、DBの logs や user_techniques にデータを保存。未入力のスコアが NaN となることを防ぐ安全策（Fallback）を実装済み。
    evaluateStudentApi / evaluateBulkStudentsApi (先生用): 先生の評価。peer_evaluations に記録を残し、生徒の user_status (XPおよび last_practice_date) を更新する。

5.2 評価制限ロジック

    先生の1日1回制限: 同一生徒に対して、同じ先生が同日に複数回評価できないよう制限。
    フロントエンド: evaluated_today_by_me フラグを用いて評価済みの生徒をグレーアウト・選択不可に。
    バックエンド: peer_evaluations テーブルをクエリし、evaluator_id と date で重複をブロック。
    生徒の自己評価制限: 1日1課題につき1回まで。
    画面描画時に既存ログと日付を照合し、評価済みの課題はUIをブロックして重複送信を防ぐ。

5.3 日付とタイムゾーンの処理

    過去日付での記録・評価機能に対応。フロントエンドから YYYY-MM-DD 形式で送信された日付は、バックエンド側で日本のタイムゾーン（JST）を考慮した正しい時刻付きISO文字列に変換され、timestamptz 型のデータベースに正確に保存される。

6. UI/UXの設計思想

    熱血ポップ和風テーマ: 臙脂（えんじ）色をベースに、ゴールドのアクセントカラーを配置。子どもたちがワクワクする「ゲーム感」を演出。
    フィードバックの強調: 記録完了時やレベルアップ時には、CSSアニメーションを駆使したリッチなモーダル（ResultModal.tsx）を表示し、達成感を最大化する。
    アクセシビリティへの配慮: 白背景のモーダル上で文字色が同化しないよう、明確なコントラストを持たせたスタイリングを実施。
    操作性: タッチデバイス（スマートフォン）での利用を前提とし、タップしやすい大きなボタンや、視覚的なフィードバック（ボタンの縮小・色変化）を多用。


最終更新: 完全版ディレクトリ構造反映