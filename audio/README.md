# audio

このフォルダには、Wordfall の `Audio file` 音源として使うファイルを置きます。

現在の公開版は設定パネルで次の2種類を選べます。

- `Generated noise`: ブラウザ内で生成する低いブラウンノイズ
- `Audio file`: `audio/Nature_river_Track3_loop_128.mp3` のループ再生

`audio/Nature_river_Track3_loop_128.mp3` の出典は、[d-elf.com「川のせせらぎ」](https://www.d-elf.com/archives/8333.html)です。

ブラウザから任意ファイルをアップロードする機能はありません。音源を差し替える場合は、`app.js` の `AUDIO_FILE` とこの README を同時に更新してください。

`Generated noise` は現時点で `createScriptProcessor` を使っています。この API は非推奨のため、長期的には AudioWorklet への移行を検討してください。
