# AquaSweep Documentation

Technical documentation for the AquaSweep project — an ESP32-powered
aquaculture drone boat on Pond A-01, controlled and monitored from a
React/Vite dashboard over MQTT (local Mosquitto broker).

## Index

| Document | Covers |
|---|---|
| [architecture.md](architecture.md) | System overview, components, data flow, broker, network, security |
| [hardware.md](hardware.md) | ESP32 firmware: board, pinout, sensors, motor/PWM control, build & flash |
| [stub-hardware-integration.md](stub-hardware-integration.md) | Wiring pins + battery voltage sensing system design for the stub sensors |
| [dashboard.md](dashboard.md) | React dashboard: stack, MQTT client, hook, views, theming, deploy |
| [mqtt-protocol.md](mqtt-protocol.md) | Topics, payloads, command reference, and MQTT gotchas (source of truth) |
| [knowledge-graph.md](knowledge-graph.md) | Internal developer map: file-by-file layout, mapping, gotchas, task checklist |
| [feature-gap.md](feature-gap.md) | Known limitations and roadmap (stubs vs. real hardware) |

## Quick orientation

```
firmware/          PlatformIO ESP32 firmware (Arduino framework, MQTT edition)
src/               React + Vite dashboard (browser talks MQTT over WebSocket)
infra/             Local Mosquitto broker config (TCP 1883 + WebSocket 9001)
```

Everything the device senses is published as one JSON packet to
`aquasweep/<device-id>/telemetry` every 2 seconds; the dashboard subscribes
and renders it. Control commands travel the reverse path on
`aquasweep/<device-id>/cmd`, and the firmware confirms each one on
`aquasweep/<device-id>/ack`.