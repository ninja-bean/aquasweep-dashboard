# Feature Difference Report — Dashboard vs ESP32 Firmware

Status snapshot of what the React dashboard renders vs what the ESP32 firmware
(`firmware/`) actually implements over MQTT.

## A. Sensors / telemetry

| Dashboard panel | Firmware source | Real or stub? |
|---|---|---|
| pH gauge + card | `sensors.ph` — PH-4502C analog on GPIO 34 | **Stub** — `ok:false` until wired; pH from default calibration constants |
| Temperature card | `sensors.temp` — DS18B20 on GPIO 33 | **Stub** — `ok:false` until probe wired |
| Turbidity gauge | `sensors.turb` — ADC on GPIO 32 | **Real** (0–100 %, dashboard maps straight onto `%` gauge) |
| Bin fullness gauge | `sensors.bin` — ultrasonic GPIO 22/23 | **Real** |
| Obstacle proximity card | `sensors.obst.cm` — same ultrasonic | **Real**, same channel as bin (distance < 40 cm ⇒ trash detected) |
| Trash Detection card | derived `obst < 40` | Real / derived |
| Battery gauge + power panel | `sensors.batt` — GPIO 36 divider | **Disabled stub** — `ok:false`, `mvolts:null` until divider wired; % estimated at 11.1 V on dashboard |
| Dissolved O₂ card | — none — | **Dashboard-only calculation** `src/utils/oxygen.js` from temp |
| FW version / RSSI chips, header | `fw`, `rssi` fields | Real |

## B. Controls

| Dashboard button | Firmware implements | Notes |
|---|---|---|
| Joystick / D-pad move | `move` fwd/rev/left/right | Real (H-bridge, same pins). Joystick sends direction once on release — **no live vectoring** |
| Speed slider | — | **Cosmetic only** (one-time % placeholder in log); no PWM/speed control in firmware |
| Return Home | `home` | **Ack-only stub** — firmware just stops motors, no autopilot |
| Dispense Fish Food | `feed` | Real one-shot servo open→close |
| Pickup Trash | `pickup` | Real belt sweep (3 s) |
| Empty Bin | `empty` | **Ack-only stub** — no dump hardware |
| Belt on/off (FungAi dispatch) | `belt` | Real relay — but **no dashboard UI exposes raw belt on/off**; unreachable from UI |
| pH calib (cmd only) | `calib` ph4/ph7 → NVS | **Firmware-only** — no dashboard UI; drive with `mosquitto_pub` |

## C. Device state / presence

- Online/Reconnecting badge (header + sidebar dot) — **real** via retained `status` + LWT.
- Event Log — **real** (device acks + optimistic sends).
- `Last command` in Mission Status — real from ack.

## D. Firmware-only capabilities (no dashboard UI)

- `belt` on/off raw control.
- pH calibration command, NVS persistence.
- Turbidity raw ADC channel, battery divider config.

## E. Dashboard features that are decorative — firmware doesn't do this

- **Active Alerts** (`src/data.js` `DAILY_ALERTS`) — static canned text, never matches live readings.
- **Mission Status rows**: `Camera feed 1280×720·12 fps`, `GPS fix 3D·6 satellites`, `Propulsion ESCs nominal` — **all hardcoded text** (no camera/GPS/ESC monitoring in firmware).
- **Safety card**: auto-hover on link loss, obstacle brake < 35 cm, no-fly near pH probe, battery kill < 15% — **hardcoded text only**; firmware has none of this logic.
- **FungAi**: intervention dropdown, dose estimate (1.8 kg), model confidence 87%, 4,100 pond-hours, "Dispatch Drone with Treatment", "Re-run Prediction", "Export Health Report" buttons — **static UI, no onClick handlers, nothing sent to device**.
- **Analytics** "vs 6h ago" deltas, daily profile, week-vs-last chart — real charting but only from live (≤ 72) samples; "7d/30d" range buttons are cosmetic (same data).
- Trash/bins sparkline cadence from a single ultrasonic channel.

## F. Correctness gaps to be aware of

1. Bin fullness and obstacle share **one ultrasonic sensor** — the gauge and the obstacle card can contradict (e.g. rising bin reads as "near obstacle").
2. Turbidity is a `%` yet the analytics model treats it as "NTU" for species ranges (30 NTU threshold) — unit mismatch.
3. Dashboard hardcodes 2 s cadence label; actual firmware cadence is configurable (`TELEMETRY_MS`).
4. No live alert logic — alerts never react to out-of-band readings.

## Possible next steps

- Real ESC/camera/GPS reporting (or remove the mock rows).
- Live alert evaluation from telemetry instead of canned `DAILY_ALERTS`.
- Expose raw belt on/off and pH calib commands in a panel.
- Wire FungAi "Dispatch Drone" / interventions to `cmd` calls.
- Close the turbidity % → NTU mapping, and split bin/obstacle sensing if hardware allows.