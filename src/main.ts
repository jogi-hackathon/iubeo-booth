import {
  FilesetResolver,
  type NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import {demoLandmarks} from "./demo";
import "./style.css";
import {
  coverView,
  createBody,
  drawBody,
  labelAnchor,
  metersToPx,
  toBody,
} from "./skeleton";
import {createTracker, resetCounter, type Track} from "./tracker";

const params = new URLSearchParams(location.search);
const MODEL = params.get("model") === "full" ? "full" : "lite";
const MAX_PEOPLE = Number(params.get("people") ?? 5);
const DEMO = params.has("demo");

// 骨格を載せる元映像の大きさ。座標の縦横比をこれに合わせる。
const frame = {w: 0, h: 0};

const CDN_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const CDN_MODEL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${MODEL}/float16/1/pose_landmarker_${MODEL}.task`;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) {
    throw new Error(`${sel} not found`);
  }
  return el;
};

const canvas = $<HTMLCanvasElement>("#stage");
const video = $<HTMLVideoElement>("#camera");
const headline = $<HTMLDivElement>("#headline");
const count = $<HTMLSpanElement>("#count");
const clock = $<HTMLSpanElement>("#clock");
const log = $<HTMLOListElement>("#log");
const debug = $<HTMLDivElement>("#debug");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const rid = (id: number) => `RESOURCE #${pad(id)}`;
const time = () => new Date().toLocaleTimeString("ja-JP", {hour12: false});

const MAX_LOG = 7;
const write = (text: string) => {
  const li = document.createElement("li");
  li.textContent = `[${time()}] ${text}`;
  log.prepend(li);
  while (log.children.length > MAX_LOG) {
    log.lastElementChild?.remove();
  }
};

let flashUntil = 0;
const IDLE = "利用可能なリソースを待機しています";
const BUSY = "リソースを評価しています";
const setHeadline = (text: string, flashMs = 0) => {
  headline.textContent = text;
  flashUntil = flashMs ? performance.now() + flashMs : 0;
};

const tracker = createTracker({
  onJoin: (t) => {
    write(`${rid(t.id)} を検出しました`);
    setHeadline("リソースを検出しました", 2200);
  },
  onLeave: (t) => {
    const stayed = ((performance.now() - t.bornAt) / 1000).toFixed(1);
    write(`${rid(t.id)} との接続が切れました（${stayed}s）`);
  },
});

// 検出から時間が経つほど「彼ら」の評価が進む。
const statusOf = (t: Track, now: number): string => {
  const age = now - t.bornAt;
  if (age < 1200) {
    return "検出";
  }
  if (age < 3600) {
    const dots = ".".repeat(1 + (Math.floor(age / 300) % 3));
    return `評価中${dots}`;
  }
  const label = t.fitness > 0.7 ? "割り当て可能" : "保留";
  return `適性 ${t.fitness.toFixed(2)} / ${label}`;
};

const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
addEventListener("resize", resize);
resize();

const LABEL_WIDTH = 200;

const drawLabel = (t: Track, x: number, y: number, now: number) => {
  const fade = Math.min(1, (now - t.bornAt) / 400);
  // 画面の右端に寄ったら、頭の左側に出す。
  const flip = x + LABEL_WIDTH > innerWidth - 24;
  const dir = flip ? -1 : 1;
  const left = flip ? x - LABEL_WIDTH : x;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 14 * dir, y + 14);
  ctx.lineTo(x, y);
  ctx.lineTo(x + LABEL_WIDTH * dir, y);
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "600 15px 'JetBrains Mono', ui-monospace, Menlo, monospace";
  ctx.fillText(rid(t.id), left + 4, y - 8);
  ctx.fillStyle = "#6b6b6b";
  ctx.font = "13px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  ctx.fillText(statusOf(t, now), left + 4, y + 18);
  ctx.restore();
};

const render = (now: number) => {
  const w = innerWidth;
  const h = innerHeight;
  ctx.clearRect(0, 0, w, h);
  const vw = frame.w;
  const vh = frame.h;
  if (!vw || !vh) {
    return;
  }
  const view = coverView(vw, vh, w, h);
  for (const t of tracker.tracks) {
    const m = metersToPx(t.body, view, vw, vh);
    const fade = Math.min(1, (now - t.bornAt) / 300);
    drawBody(ctx, t.body, view, m, fade);
  }
  for (const t of tracker.tracks) {
    const m = metersToPx(t.body, view, vw, vh);
    const a = labelAnchor(t.body, view, m);
    if (a.visible) {
      drawLabel(t, a.x, a.y, now);
    }
  }
};

const resolveAssets = async () => {
  const local = `${import.meta.env.BASE_URL}mediapipe`;
  const model = `${local}/pose_landmarker_${MODEL}.task`;
  const ok = await fetch(model, {method: "HEAD"}).then(
    (r) => r.ok && !r.headers.get("content-type")?.includes("text/html"),
    () => false,
  );
  if (ok) {
    return {wasm: `${local}/wasm`, model, source: "local"};
  }
  return {wasm: CDN_WASM, model: CDN_MODEL, source: "cdn"};
};

type Detect = (now: number) => NormalizedLandmark[][] | null;

// 本番はカメラ + MediaPipe、?demo は合成した歩行者。どちらも 33 点を返す。
const openCamera = async (): Promise<Detect> => {
  const assets = await resolveAssets();
  const fileset = await FilesetResolver.forVisionTasks(assets.wasm);
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {modelAssetPath: assets.model, delegate: "GPU"},
    runningMode: "VIDEO",
    numPoses: MAX_PEOPLE,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {width: {ideal: 1280}, height: {ideal: 720}, facingMode: "user"},
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  write(`観測を開始しました（model: ${MODEL} / ${assets.source}）`);

  let lastVideoTime = -1;
  return (now) => {
    frame.w = video.videoWidth;
    frame.h = video.videoHeight;
    if (video.currentTime === lastVideoTime) {
      return null;
    }
    lastVideoTime = video.currentTime;
    return landmarker.detectForVideo(video, now).landmarks;
  };
};

const openDemo = async (): Promise<Detect> => {
  frame.w = 1280;
  frame.h = 720;
  write("デモモードで観測を開始しました");
  return demoLandmarks;
};

const start = async () => {
  setHeadline("起動しています");
  const detect = await (DEMO ? openDemo() : openCamera());
  setHeadline(IDLE);

  let frames = 0;
  let fpsAt = performance.now();
  let fps = 0;

  const loop = () => {
    const now = performance.now();
    const marks = detect(now);
    if (marks) {
      tracker.update(
        marks.map((m) => toBody(m, createBody())),
        now,
      );
      frames += 1;
    }
    if (now - fpsAt > 1000) {
      fps = (frames * 1000) / (now - fpsAt);
      frames = 0;
      fpsAt = now;
      debug.textContent = `${fps.toFixed(0)} fps · ${tracker.tracks.length} tracked · ${MODEL}`;
    }
    const n = tracker.tracks.length;
    if (!flashUntil || now > flashUntil) {
      flashUntil = 0;
      headline.textContent = n > 0 ? BUSY : IDLE;
    }
    count.textContent = pad(n, 2);
    document.body.classList.toggle("occupied", n > 0);
    clock.textContent = time();
    render(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

addEventListener("keydown", (e) => {
  if (e.key === "f") {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }
  if (e.key === "d") {
    document.body.classList.toggle("debug");
  }
  if (e.key === "R" && e.shiftKey) {
    resetCounter();
    write("リソース番号をリセットしました");
  }
});

start().catch((err: unknown) => {
  console.error(err);
  const msg = err instanceof Error ? err.message : String(err);
  setHeadline("観測できません");
  write(`エラー: ${msg}`);
});
