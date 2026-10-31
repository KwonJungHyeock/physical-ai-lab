# 손 따라하기: hand recognition

- `hand_landmarker.task` — MediaPipe Hand Landmarker model (float16, version 1), Google,
  Apache License 2.0. From https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- `vision_wasm_internal.js` / `.wasm` — MediaPipe Tasks Vision runtime (npm `@mediapipe/tasks-vision` 0.10.21),
  Apache License 2.0. Copied here by `tools/build/copy-vision.mjs` (not kept in git).

Kept on this site so the simulator recognises a hand with no internet. The camera picture is used in
the browser only: nothing is saved or sent.
