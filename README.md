# Wordfall

Wordfall は、日本語の言葉が静かに落ちてくる鑑賞型Webページです。

公開版は `data/ja.json` だけを読み込み、落ちてくる言葉を眺め、気になった語の説明を読む体験に絞っています。語彙データの編集は公開UIではなく、`local-editor/` 配下のローカル専用エディタで行います。

## 公開版の機能

- 言葉の落下表示
- 単語クリックによる詳細表示
- Google / Wikipedia検索
- Sound ON/OFF
- 音源選択（Generated noise / Audio file）
- 音量設定
- Information
- Formsリンク

## データ仕様

語彙データは言語別JSON配列として `data/*.json` に保存します。

```json
{
  "id": "00000000-0000-4000-8000-000000000000",
  "name": "余白",
  "reading": "よはく",
  "lv": 2,
  "lang": "ja",
  "genre": "design"
}
```

- `id` は UUID v4 です。
- `name`, `lang` は必須です。
- `desc` は任意です。意味や説明は後から編集できます。
- 公開版の落下表示に出るのは `name`, `desc`, `lang` が揃った語だけです。`desc` が未入力の語はデータに残りますが、公開版では非表示です。
- `reading`, `lv`, `genre` は任意です。
- `lv` は 1〜5 を使います。未設定の場合は公開版で `-` と表示します。
- `genre` は未設定でも保存できます。公開版では未設定を `-` と表示します。
- `category` は使いません。
- `concept_id` は将来の多言語リンク用に予約していますが、現在は保存しません。

標準genreは次の19種です。

```text
art, body, city, daily, design, emotion, food, history, music, nature,
philosophy, science, society, space, study, tech, time, travel, work
```

## ローカルエディタ

ローカルエディタは `local-editor/editor.html` です。公開版からのリンクはありません。

起動直後は `fetch()` で全言語JSONを読み込み、一覧から検索・絞り込み・編集できます。保存時は File System Access API に対応したブラウザで `data` フォルダを選択し、変更された元JSONだけを直接上書きします。

`local-editor/` は制作者用の管理画面です。公開デプロイには含めない運用にしてください。

## 移行CLI

既存JSONの検査と移行には `scripts/migrate.js` を使います。

```bash
npm run migrate:dry-run
npm run migrate
```

dry-run はファイルを書き換えず、category分布、genre警告、重複、ID付与件数を表示します。

## 音声

公開版の設定パネルでは、ブラウザ内で生成する `Generated noise` と、同梱の `audio/Nature_river_Track3_long_128.mp3` を再生する `Audio file` を選べます。

音量設定はブラウザに保存され、次回表示時に復元されます。

`Generated noise` は現在 `createScriptProcessor` を使っています。この API は非推奨のため、長期的には AudioWorklet への移行を検討してください。

`manifest.json` には語数カウントを手書きで持たせません。語数は `data/*.json` をソースオブトゥルースとして集計してください。

## 起動方法

`fetch()` でJSONファイルを読み込むため、ローカル静的サーバーで起動してください。

```bash
python3 -m http.server 8000
```

公開版:

```text
http://127.0.0.1:8000/
```

ローカルエディタ:

```text
http://127.0.0.1:8000/local-editor/editor.html
```
