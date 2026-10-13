import {fileURLToPath} from "node:url";

import {defineConfig} from "vite";

// トップは観測アプリ、/slip/ は伝票メーカー。/mock/ (ブース模型) は public/ に置いた静的なページ
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        slip: fileURLToPath(new URL("./slip/index.html", import.meta.url)),
      },
    },
  },
});
