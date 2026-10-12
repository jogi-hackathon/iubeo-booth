# iubeo-booth

IUBEO の展示ブースで、前を通る人を MediaPipe のランドマークだけで映すモニター。
映像は表示せず、ゲーム内のプレイヤーと同じ白い骨格に `RESOURCE #0042` の番号を付けて描く。

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
| `d` | デバッグ表示（fps とカメラ映像の小窓） |
| `Shift + R` | リソース番号を 0 に戻す（番号は一日通して増え続ける） |
