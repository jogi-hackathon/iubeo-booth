# iubeo-booth

IUBEO の展示ブースで、前を通る人を MediaPipe のランドマークだけで映すモニター。
映像は表示せず、ゲーム内のプレイヤーと同じ白い骨格だけを描く。画面の文字は IUBEO のロゴだけ。

## 起動

```sh
pnpm install
pnpm fetch:model   # wasm とモデルを public/mediapipe に置く（会場をオフラインで動かすため）
pnpm dev           # http://localhost:5173
```

`fetch:model` をしていなければ CDN から読み込む。Chrome 推奨。

## URL パラメータ

| パラメータ | 内容 |
| --- | --- |
| `?demo` | カメラを使わず、合成した歩行者で動かす（リハーサル・確認用） |
| `?model=full` | 精度の高いモデルを使う（既定は `lite`） |
| `?people=5` | 同時に検出する人数の上限 |

## キー操作

| キー | 内容 |
| --- | --- |
| `f` | フルスクリーン切り替え |
| `d` | 調整用の表示（fps、MediaPipe が返した骨格の数 `raw`、重複を除いた数 `tracked`、カメラ映像の小窓） |
