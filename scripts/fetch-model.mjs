// 会場の回線に頼らず動かすため、MediaPipe の wasm とモデルを public/mediapipe に置く。
// wasm は node_modules からコピーし、モデルだけ Google の配布元から取ってくる。
import {copyFile, mkdir, readdir, stat, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");

const MODELS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(join(out, "wasm"), {recursive: true});
for (const name of await readdir(wasmSrc)) {
  await copyFile(join(wasmSrc, name), join(out, "wasm", name));
}
console.log("wasm: copied");

for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(out, `pose_landmarker_${name}.task`);
  if (await exists(dest)) {
    console.log(`model ${name}: already present`);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`model ${name}: ${res.status} ${res.statusText}`);
  }
  await writeFile(dest, new Uint8Array(await res.arrayBuffer()));
  console.log(`model ${name}: downloaded`);
}
