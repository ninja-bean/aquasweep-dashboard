# Dashboard

A single-page React dashboard (Vite, no backend) that monitors and controls the
AquaSweep device over MQTT/WebSocket and renders the full aquaculture surface:
live gauges, drone control, analytics, and an AI species advisor.

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite 8 (`base: './'` for path-agnostic hosting) |
| UI | React 19, Tailwind CSS 4 (`@tailwindcss/vite`), lucide-react icons |
| Charts | recharts 3 |
| Motion | framer-motion |
| MQTT | `mqtt` 5 (WebSocket transport) |
| Lint | oxlint (`npm run lint`) |

## Entry and shell

- `src/main.jsx` → renders `<App/>` (StrictMode).
- `src/App.jsx` — outer shell: sidebar nav, header (MQTT/device presence,
  battery bar), view switch, and per-view wiring.
- `src/app-less global styles` in `src/index.css` (Tailwind v4 `@theme`,
  glass/glow utilities, keyframes). `src/App.css` is a leftover Vite template.

## MQTT layer

### `src/config.js`
`DEVICE_ID`, `MQTT_URL` (default `ws://localhost:9001/mqtt`, overridable with
`VITE_MQTT_URL`), topic literals under `aquasweep/<id>/…`, and the
telemetry cadence constant.

### `src/mqtt/mqttClient.js`
A singleton around `mqtt.js`:

- Lazy-connects on first use; reconnects every 3 s; broadcasts connection
  state to registered listeners.
- One `message` listener dispatches to a per-topic handler `Map`. Re-registering
  the same topic replaces the handler (React StrictMode-safe — no duplicate
  subscriptions or handlers).
- `subscribe(topic, handler)` queues the SUBSCRIBE until the socket is up and
  performs it at most once per topic.
- `publish(topic, message, {qos=1, retain=false})`.

### `src/mqtt/useTelemetry.js`
The React bridge. Subscribes `telemetry`, `status`, `ack` and exposes:

- `brokerOnline`, `deviceOnline` — presence from broker events and the retained
  `status` topic (LWT flips it offline on dead drop).
- `telemetry` — the mapped view contract used by every view.
- `history` (72 samples), `sparklines` (per-metric non-null arrays), `eventLog`
  (ack + optimistic sends), `lastCommand`, `lastUpdate`.
- `sendCmd(payload, {label, type})` — publishes to `cmd` and logs an
  optimistic event.

### Payload mapping (`mapTelemetry`)

| Firmware packet | Telemetry field |
|---|---|
| `sensors.ph.val` | `pH` |
| `sensors.temp.c` | `temp` |
| `sensors.turb.pct` | `turbidity` |
| `sensors.bin.pct` | `bin` |
| `sensors.batt.pct` | `battery` (firmware-computed; falls back to a mV→% estimate at 11.1 V nominal) |
| `sensors.batt.mvolts` | `batteryMV` |
| `sensors.obst.cm` | `trash.obstacle` (`< 40` → `trash.detected`) |
| `fw` / `rssi` / `spd` / `ts` | `fw` / `rssi` / `spd` / `ts` |
| *(derived)* | `oxygen` via `tempToDO(temp)` — dissolved O₂ is computed from temperature, not measured |

Every view must be **null-safe**: until a sensor is wired its `ok:false`
becomes `null`, and components render `—` / "No data".

## Views

- **LiveView** — radial gauges (pH, O₂, temperature, turbidity, bin, battery),
  sensor cards with sparklines, alert feed, power panel; battery colorized
  with low-battery thresholds.
- **DroneView** — motion controller with a **momentary D-pad** (hold a
  direction to move, release to stop; pointer-capture means the release is
  caught even when the cursor leaves the button), live speed slider, Return
  Home / STOP, action cards (feed / pickup / empty), Mission Status panel,
  MQTT event log, and a Safety card.
- **AnalyticsView** — recharts trend/area/bar charts + summary cards over the
  `history` window.
- **FungAiView** — AI-ish species advisor: radar/bar charts and a risk model
  over static species data.

## Components

- `Gauge` — radial gauge; renders `—` for null.
- `SensorCard` — metric card + sparkline; "No data" state for null.
- `FishArtwork` — low-poly per-species SVG line-art.

## Scripts

```bash
npm run dev       # concurrently: local Mosquitto (infra/mosquitto.conf) + Vite
npm run build     # production build → dist/
npm run preview   # serve the built app
npm run lint      # oxlint
```

Note: the `dev` script launches Mosquitto from its Windows install path and
runs Vite together — handy for a one-command local stack.

## Environment

`.env.example` → copy to `.env` to change `VITE_MQTT_URL` (WebSocket endpoint
of the broker). No other settings are required.

## Deployment

- `npm run build` with `base: './'` produces a self-contained `dist/`.
- It can be served by any static host (the repo has used GitHub Pages
  previously); the browser connects to `ws://localhost:9001/mqtt` by default,
  so the broker must be reachable from the client at that origin.