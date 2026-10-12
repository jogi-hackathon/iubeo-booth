import {
  FilesetResolver,
  type NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

import {demoLandmarks} from "./demo";
import "./style.css";
import {coverView, createBody, dedupe, drawBody, metersToPx, toBody} from "./skeleton";
import {bodyOf, createTracker, FADE_MS, HOLD_MS} from "./tracker";

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
const debug = $<HTMLDivElement>("#debug");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2d context unavailable");
}

const tracker = createTracker();

const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};
addEventListener("resize", resize);
resize();

const FADE_IN_MS = 300;

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
    const body = bodyOf(t);
    const m = metersToPx(body, view, vw, vh);
    // 見失った骨格は据え置いたあと、薄くしていく。
    const fadeIn = Math.min(1, (now - t.bornAt) / FADE_IN_MS);
    const fadeOut =
      1 - Math.min(1, Math.max(0, now - t.seenAt - HOLD_MS) / FADE_MS);
    drawBody(ctx, body, view, m, fadeIn * fadeOut);
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
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {width: {ideal: 1280}, height: {ideal: 720}, facingMode: "user"},
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  console.info(`observer: model ${MODEL} (${assets.source})`);

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
  return demoLandmarks;
};

const start = async () => {
  const detect = await (DEMO ? openDemo() : openCamera());

  let frames = 0;
  let raw = 0;
  let fpsAt = performance.now();

  const loop = () => {
    const now = performance.now();
    const marks = detect(now);
    if (marks) {
      const bodies = dedupe(
        marks.map((m) => toBody(m, createBody())),
        frame.w / frame.h,
      );
      tracker.update(bodies, now);
      raw = marks.length;
      frames += 1;
    }
    if (now - fpsAt > 1000) {
      const fps = (frames * 1000) / (now - fpsAt);
      frames = 0;
      fpsAt = now;
      debug.textContent = `${fps.toFixed(0)} fps · ${raw} raw · ${tracker.tracks.length} tracked · ${MODEL}`;
    }
    render(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

const CURSOR_IDLE_MS = 2000;
let cursorTimer = 0;
const wakeCursor = () => {
  document.body.classList.remove("idle");
  clearTimeout(cursorTimer);
  cursorTimer = window.setTimeout(
    () => document.body.classList.add("idle"),
    CURSOR_IDLE_MS,
  );
};
addEventListener("pointermove", wakeCursor);
addEventListener("pointerdown", wakeCursor);
wakeCursor();

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
});

start().catch((err: unknown) => {
  console.error(err);
});
