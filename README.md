# iubeo-booth

IUBEO の展示ブースで、前を通る人を MediaPipe のランドマークだけで映すモニター。
映像は表示せず、ゲーム内のプレイヤーと同じ白い骨格だけを描く。画面の文字は IUBEO のロゴだけ。

公開版: https://jogi-hackathon.github.io/iubeo-booth/ （`main` に入ると GitHub Actions で自動デプロイ）

ブースの 3D 模型: https://jogi-hackathon.github.io/iubeo-booth/mock/ （`public/mock/index.html`。机・モニター・ロゴ・ファイルのパネルを実寸で並べ、置き方を変えながら回して見られる）

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
| `?cutoff=0.8` | 静止時のならし具合 (Hz)。小さいほど震えが減る |
| `?beta=6` | 速い動きへの追従。大きいほど遅れが減る |

## キー操作

| キー | 内容 |
| --- | --- |
| `f` | フルスクリーン切り替え |
| `d` | 調整用の表示（fps、MediaPipe が返した骨格の数 `raw`、重複を除いた数 `tracked`、カメラ映像の小窓） |
