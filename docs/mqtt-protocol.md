# MQTT Protocol

Device id: `pond-a01` (topics are `aquasweep/<device-id>/…`). All QoS 1 except
where noted.

## Topics

| Topic | QoS | Retain | Direction | Payload |
|---|---|---|---|---|
| `aquasweep/pond-a01/telemetry` | 1 | no | device → broker | sensor JSON (below) |
| `aquasweep/pond-a01/cmd` | 1 | no | broker → device | `{c, v, speed?}` |
| `aquasweep/pond-a01/ack` | 1 | no | device → broker | `{c, v, ok, msg, seq, ts, spd}` |
| `aquasweep/pond-a01/status` | 1 | **yes** | device → broker | `"online"` / `"offline"` (LWT) |

`status` starts as `"offline"` via the firmware's **Last Will** and is
flipped to `"online"` (retained) at connect — so the broker always has a
current presence value, and the dashboard derives `deviceOnline` from it.

## Telemetry (device → dashboard, every 2 s)

```json
{
  "d": "pond-a01",
  "ts": 1750000000,
  "fw": "2.1.0",
  "ut": 4216,
  "rssi": -61,
  "spd": 60,
  "sensors": {
    "bin": { "pct": 42 },
    "turb": { "pct": 18 },
    "obst": { "cm": 9 },
    "ph":  { "adc": 2048, "mv": 1652, "val": 7.02, "ok": true },
    "temp": { "c": 24.5, "ok": true },
    "batt": { "mvolts": 11050, "pct": 67, "ok": true }
  }
}
```

- Unavailable sensors publish `null` and `ok:false` (e.g. battery with no
  divider boxed: `{"mvolts":null,"pct":null,"ok":false}`).
- `spd` is the device's current throttle (0–100) — lets the dashboard verify
  the speed round-trip.
- `ts` = NTP epoch (or uptime-based fallback); `ut` = uptime seconds.

## Commands (dashboard → device)

| `c` | `v` | Behaviour | Ack |
|---|---|---|---|
| `move` | `"forward"` \| `"reverse"` \| `"backward"` \| `"left"` \| `"right"` \| `"stop"` + optional `speed: 0–100` | Applies throttle, drives the H-bridge | yes |
| `speed` | `0–100` | Sets `g_speedPct` | yes |
| `belt` | `0` \| `1` | Conveyor relay off/on (active-low) | yes |
| `feed` | — | One-shot servo hopper open→close | yes |
| `pickup` | — | Belt sweep (on 3 s) | yes |
| `empty` | — | Stub — ack only (no dump hardware) | yes |
| `home` | — | Stub — stops motors and acks | yes |
| `calib` | `{"sensor":"ph","point":7\|4}` | One-point pH calibration → NVS | yes |

`move` with no `speed` keeps the current throttle; `"backward"` is accepted as
an alias for `"reverse"`. Unknown/malformed commands get a negative ack.

```bash
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd \
  -m '{"c":"move","v":"forward","speed":60}'
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd -m '{"c":"speed","v":40}'
mosquitto_pub -h localhost -t aquasweep/pond-a01/cmd -m '{"c":"stop","v":null}'
```

## Acks (device → dashboard)

```json
{ "c": "move", "v": "forward", "ok": true, "msg": "FORWARD", "seq": 12, "ts": 1750000001, "spd": 60 }
```

`seq` increments per ack; `ts` mirrors telemetry time. The dashboard surfaces
them in the event log and Mission Status *Last command*.

## Observing

```bash
mosquitto_sub -h localhost -t 'aquasweep/#' -v
```

## Gotchas

- **Retained telemetry trap.** PubSubClient overloads `publish(topic, …)`; a
  3-argument call like `publish(topic, buf, n)` binds to
  `publish(topic, const char*, boolean retained)` and publishes the delivery
  count as the retain flag. The firmware always uses the explicit 4-argument
  byte overload: `publish(topic, (const uint8_t*)buf, (unsigned int)n, false)`.
- **Stale retained telemetry/ack** from before this fix will keep being served
  to new subscribers — clear them with `mosquitto_pub -r -n -t …/telemetry`.
- Always keep the firmware topics (`config.h`) in sync with the dashboard
  topics (`src/config.js`); both are generated from the same device id.