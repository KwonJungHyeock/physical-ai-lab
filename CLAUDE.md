# Repository layout

- `web-typescript/` — TypeScript Next.js app (the thing to port). Has its own CLAUDE.md/AGENTS.md; read them before
  touching web code: @web-typescript/AGENTS.md
  - `src/app/` = pages (Next routes), `src/ui/` = React screens, `src/engine/` = framework-free logic (no React).
- `robot-python/` — Python that runs on or for the robot. `server/` = the on-robot console server (installed on the
  robot as `~/robot_console/`), `checks/` = hardware checks run on the RDK X5, `tools/` = developer utilities,
  `usb-kit/` = the USB stick's installer and forms. Standard library + pymycobot only.
- `desktop-go/` — Go program that embeds the web app's static export into one Windows `.exe`
  (the simulator to run and show without a robot or internet). Build with `sh desktop-go/build.sh`.
  Delivering it: during development send the zip split in two (`zip -s 30m`, under the 30 MB file limit);
  a confirmed final build goes on the `release` branch as one `PhysicalAI-Simulator.zip` + README (latest only).
- `content-markdown/` — the lesson sources the app reads (8 md + `reference/`), Korean.
  `npm run gen:curriculum` turns them into `web-typescript/src/engine/education/curriculum.gen.ts`.
- `manuals/` — step-by-step guides for people (Korean), by audience: `simulator/`, `setup/`, `robot-arm/`, `myagv/`, `course/`.
  The two delivered PDFs (simulator manual, teacher guide) are built from md there by `web-typescript/tools/build/guides.mjs`.
- `docs/` — Korean. `reports/` by category (`prototype/`, `research/`, `console/`, `education/`, `system/`;
  file names keep the report number), `mockup/`. Each file is exported to its own PDF for delivery.

Keep code sorted by language (TypeScript only under `web-typescript/`, Python only under `robot-python/`,
Go only under `desktop-go/`), then by part — don't drop new files into one flat folder:
- `web-typescript/src/ui/simulator/{stage,editors,control,connect,tasks,pages}/`,
  `web-typescript/src/ui/education/{map,roadmap,lesson,stage,topics,fig,print,lab}/` (the 교육 home = the 산업단지 map in `map/`, lesson screens in `topics/<N-학문>/`, problem-solving labs in `lab/`),
  `web-typescript/src/ui/{agv,twin}/`.
- `web-typescript/src/engine/{robot,physics,simulator,python,vision,education,agv,serial}/` — no React or DOM UI here.
- `web-typescript/tests/{robot,simulator,agv,education}/`, `web-typescript/tools/{build,check}/`.
- `web-typescript/public/education/` = 교육 tab pictures (served at `/education/...`); `park/kit/` = the map's Kenney Factory Kit models (CC0, recoloured atlas, see its ATTRIBUTION.md).
- New reports go into the matching `docs/reports/<category>/`, new manuals into the matching `manuals/<category>/`;
  add them to `docs/README.md` / `manuals/README.md`.

Keep tests separate from manuals.
