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
- `lv` は語の読みやすさと前提知識の量を表す 1〜5 です。Lv 1 は基本語、Lv 2 は身近な抽象語・複合語、Lv 3 は短い説明があると親しみやすい語、Lv 4 は専門語・難読語・固有名詞、Lv 5 は高度に専門的またはまれな語です。未設定の場合は公開版で `-` と表示します。
- `genre` は未設定でも保存できます。公開版では未設定を `-` と表示します。
- `category` は使いません。
- `concept_id` は将来の多言語リンク用に予約していますが、現在は保存しません。

genre は語の厳密な学問分野ではなく、語を眺めるときの入口です。複数にまたがる語は、説明の中心ではなく、その語を次にどんな語へつなげたいかで一つを選びます。標準genreは次の12種です。

```text
culture, language, mind, society, body, science, nature, technology,
living, place, time, learning
```

| genre | 定義 |
| --- | --- |
| `culture` | 芸術、音楽、物語、神話、作品や表現の技法 |
| `language` | 言葉そのもの、修辞、慣用句、語感、書記・記号 |
| `mind` | 感情、認知、心理、哲学、ものの見方 |
| `society` | 人間関係、制度、歴史、経済、政治、仕事 |
| `body` | 身体、生命、医学、生物のしくみ |
| `science` | 物理、化学、地学、数学、理論や法則 |
| `nature` | 天候、動植物、鉱物、地形、宇宙 |
| `technology` | 道具、情報、通信、工学、技術の設計 |
| `living` | 衣食住、日常の行為や身の回りのもの |
| `place` | 都市、空間、地理、移動や旅 |
| `time` | 時刻、時間の流れ、時代や一瞬 |
| `learning` | 学習、課題、知識を身につける営み |

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

dry-run はファイルを書き換えず、genre警告、重複、ID付与件数を表示します。

既存の語彙を現在のジャンル定義とレベルへ振り分け直すときは、次を実行します。これは旧ジャンルと個別に判断した未分類語・未設定レベルを現在の基準へ移す移行スクリプトです。

```bash
npm run reclassify-genres
```

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
