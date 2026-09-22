// =====================================================
//  AquaSweep IoT firmware — MQTT edition
//  Transport: MQTT (local Mosquitto broker).
//  Control mechanism + pinout identical to the original
//  HTTP firmware; only the telemetry/command layer changed.
//
//  Publish:   aquasweep/<id>/telemetry  (QoS 1, every 2 s)
//  Subscribe: aquasweep/<id>/cmd        (QoS 1)
//  Ack:       aquasweep/<id>/ack        (QoS 1)
//  Presence:  aquasweep/<id>/status     (retained + LWT)
// =====================================================

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>
#include "config.h"

// =====================================================
//                  GLOBALS
// =====================================================
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
OneWire oneWire(PIN_TEMP);
DallasTemperature tempBus(&oneWire);
Preferences prefs;

// Persisted pH calibration
float phNeutralMV = PH_NEUTRAL_MV;
float phSlopeMVPerPH = PH_SLOPE_MV_PER_PH;

// Latest sensor snapshot (filled by read*() before each publish)
struct SensorSnapshot
{
  long duration = 0;
  int distance = 0;         // obstacle / bin level from ultrasonic, cm
  int wastePercent = 0;     // bin fullness 0-100
  int turbidityPercent = 0; // 0-100
  uint32_t phAdc = 0;
  float phMV = 0.0f;
  float phVal = 0.0f;
  bool phOK = false;
  float tempC = 0.0f;
  bool tempOK = false;
  float battMV = 0.0f;
  bool battOK = false;
  int battPct = -1;
} snap;

unsigned long lastTelemetryMs = 0;
unsigned long lastReconnectMs = 0;
unsigned long bootTimeSec = 0;
static uint32_t ackSeq = 0;

// Current throttle (0-100) applied to every move command.
static int g_speedPct = MOTOR_DEFAULT_SPEED_PCT;

// =====================================================
//                  WHEEL MOTORS  (PWM speed)
//  Four H-bridge inputs, each attached to its own LEDC
//  channel. A move command holds the "high side" of each
//  motor at full duty and PWM-drives the "low side":
//  duty() maps the throttle (0-100%) onto the fraction of
//  each cycle the low-side pin is LOW (i.e. driving).
//  Same function names as the original firmware — only
//  the signalling changed.
// =====================================================
constexpr uint8_t DUTY_MAX = 255;

// LEDC channel per H-bridge input (legacy API needs explicit channels).
constexpr uint8_t CH_IN1 = 0;
constexpr uint8_t CH_IN2 = 1;
constexpr uint8_t CH_IN3 = 2;
constexpr uint8_t CH_IN4 = 3;

// Attach/write helpers that work on both LEDC APIs:
//   - Arduino-ESP32 core >= 3.x : ledcAttach(pin,freq,res) / ledcWrite(pin,duty)
//   - core 2.0.x and older      : ledcSetup(ch,freq,res)+ledcAttachPin(pin,ch)
//                                 / ledcWrite(ch,duty)
void motorPwmAttach(uint8_t pin, uint8_t channel)
{
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(pin, MOTOR_PWM_FREQ, 8);
  (void)channel;
#else
  ledcSetup(channel, MOTOR_PWM_FREQ, 8);
  ledcAttachPin(pin, channel);
#endif
}

void motorPwmWrite(uint8_t pin, uint8_t channel, uint32_t duty)
{
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcWrite(pin, duty);
  (void)channel;
#else
  ledcWrite(channel, duty);
#endif
}

uint32_t dutyFor(int pct)
{
  int c = constrain(pct, 0, 100);
  return (uint32_t)((long)DUTY_MAX * (100 - c) / 100);
}

void writeMotors(uint32_t in1, uint32_t in2, uint32_t in3, uint32_t in4)
{
  motorPwmWrite(PIN_IN1, CH_IN1, in1);
  motorPwmWrite(PIN_IN2, CH_IN2, in2);
  motorPwmWrite(PIN_IN3, CH_IN3, in3);
  motorPwmWrite(PIN_IN4, CH_IN4, in4);
}

void forwardMotor()
{
  uint32_t d = dutyFor(g_speedPct);
  writeMotors(DUTY_MAX, d, DUTY_MAX, d);
}

void backwardMotor()
{
  uint32_t d = dutyFor(g_speedPct);
  writeMotors(d, DUTY_MAX, d, DUTY_MAX);
}

void leftMotor()
{
  uint32_t d = dutyFor(g_speedPct);
  writeMotors(d, DUTY_MAX, DUTY_MAX, d);
}

void rightMotor()
{
  uint32_t d = dutyFor(g_speedPct);
  writeMotors(DUTY_MAX, d, d, DUTY_MAX);
}

void stopMotor()
{
  writeMotors(0, 0, 0, 0);
}

// =====================================================
//                  BELT FUNCTIONS
//  Relay is ACTIVE LOW: LOW = ON, HIGH = OFF
// =====================================================
void beltOn()
{
  digitalWrite(PIN_BELT_RELAY, LOW);
  Serial.println("BELT ON");
}

void beltOff()
{
  digitalWrite(PIN_BELT_RELAY, HIGH);
  Serial.println("BELT OFF");
}

// =====================================================
//                  SERVO FUNCTIONS
// =====================================================
void servoPulse(int angle)
{
  int pwm = map(angle, 0, 180, 500, 2400);
  digitalWrite(PIN_SERVO, HIGH);
  delayMicroseconds(pwm);
  digitalWrite(PIN_SERVO, LOW);
  delay(20);
}

void foodOpen()
{
  Serial.println("FOOD OPEN");
  for (int angle = 40; angle <= 64; angle += 3)
  {
    servoPulse(angle);
  }
}

void foodClose()
{
  Serial.println("FOOD CLOSE");
  for (int angle = 64; angle >= 40; angle -= 3)
  {
    servoPulse(angle);
  }
}

// =====================================================
//                  ULTRASONIC
// =====================================================
void readUltrasonic()
{
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  snap.duration = pulseIn(PIN_ECHO, HIGH, 5000);

  if (snap.duration == 0)
  {
    snap.distance = 14;
  }
  else
  {
    snap.distance = snap.duration * 0.034 / 2;
  }

  snap.wastePercent = map(snap.distance, 2, 14, 100, 0);
  snap.wastePercent = constrain(snap.wastePercent, 0, 100);
}

// =====================================================
//                  TURBIDITY
// =====================================================
void readTurbidity()
{
  int sensorValue = analogRead(PIN_TURBIDITY);
  snap.turbidityPercent = map(sensorValue, 0, 4095, 100, 0);
  snap.turbidityPercent = constrain(snap.turbidityPercent, 0, 100);
}

// =====================================================
//        PH SENSOR STUB (PH-4502C analog module)
//  Publishes raw ADC, voltage and computed pH. The stub
//  reads gracefully: ok=false when nothing is wired or
//  the reading is out of the plausible 0.3-3.1 V range.
// =====================================================
void readPH()
{
  const int samples = 16;
  uint32_t sum = 0;
  for (int i = 0; i < samples; i++)
  {
    sum += analogRead(PIN_PH);
    delay(2);
  }
  snap.phAdc = sum / samples;

  float mv = (snap.phAdc / 4095.0f) * 3300.0f;
  snap.phMV = mv;

  snap.phOK = (snap.phAdc > 5 && mv > 300.0f && mv < 3100.0f);
  snap.phVal = snap.phOK ? (7.0f + (phNeutralMV - mv) / phSlopeMVPerPH) : 0.0f;
}

// =====================================================
//              TEMPERATURE STUB (DS18B20)
//  Graceful when the probe is absent (ok=false).
// =====================================================
void readTemp()
{
  tempBus.requestTemperatures();
  float c = tempBus.getTempCByIndex(0);
  snap.tempC = c;
  // DEVICE_DISCONNECTED == -127.0 and other spurious values are flagged.
  snap.tempOK = (c > -50.0f && c < 150.0f);
}

// =====================================================
//               BATTERY (3S Li-ion divider)
//  Percentage is computed here from the divider voltage
//  against BATTERY_FULL_MV / BATTERY_EMPTY_MV and
//  published as sensors.batt.pct. Readings outside the
//  plausible 3S window publish ok:false (no box / float).
// =====================================================
void readBattery()
{
  uint32_t raw = analogRead(PIN_BATTERY);
  snap.battMV = (raw / 4095.0f) * 3300.0f * BATTERY_DIVIDER_RATIO;
  snap.battOK = (raw > 5) &&
                snap.battMV >= BATTERY_MIN_PLAUSIBLE_MV &&
                snap.battMV <= BATTERY_MAX_PLAUSIBLE_MV;

  if (snap.battOK)
  {
    float frac = (snap.battMV - BATTERY_EMPTY_MV) / (BATTERY_FULL_MV - BATTERY_EMPTY_MV);
    snap.battPct = (int)constrain(frac * 100.0f, 0.0f, 100.0f);
  }
  else
  {
    snap.battPct = -1;
  }
}

// =====================================================
//                   TELEMETRY
// =====================================================
uint32_t nowSec()
{
  time_t t = time(nullptr);
  return t > 1700000000 ? (uint32_t)t : bootTimeSec + (uint32_t)(millis() / 1000);
}

void publishTelemetry()
{
  readUltrasonic();
  readTurbidity();
  readPH();
  readTemp();
  readBattery();

  StaticJsonDocument<512> doc;
  doc["d"] = DEVICE_ID;
  doc["ts"] = nowSec();
  doc["fw"] = FW_VERSION;
  doc["ut"] = millis() / 1000;
  doc["rssi"] = WiFi.RSSI();
  doc["spd"] = g_speedPct;

  JsonObject s = doc.createNestedObject("sensors");
  s["bin"]["pct"] = snap.wastePercent;
  s["turb"]["pct"] = snap.turbidityPercent;
  s["obst"]["cm"] = snap.distance;

  JsonObject ph = s.createNestedObject("ph");
  ph["adc"] = snap.phAdc;
  ph["mv"] = snap.phMV;
  if (snap.phOK)
    ph["val"] = snap.phVal;
  else
    ph["val"] = nullptr;
  ph["ok"] = snap.phOK;

  JsonObject temp = s.createNestedObject("temp");
  if (snap.tempOK)
    temp["c"] = snap.tempC;
  else
    temp["c"] = nullptr;
  temp["ok"] = snap.tempOK;

  JsonObject batt = s.createNestedObject("batt");
  if (snap.battOK)
    batt["mvolts"] = snap.battMV;
  else
    batt["mvolts"] = nullptr;
  if (snap.battOK)
    batt["pct"] = snap.battPct;
  else
    batt["pct"] = nullptr;
  batt["ok"] = snap.battOK;

  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  // Explicit 4-arg overload: passing (topic, buf, n) would bind to
  // publish(topic, const char*, boolean retained) and publish retained!
  mqtt.publish(TOPIC_TELEMETRY, (const uint8_t *)buf, (unsigned int)n, false);
}

// =====================================================
//                   ACK
// =====================================================
void sendAck(const char *c, const char *v, bool ok, const char *msg)
{
  StaticJsonDocument<256> doc;
  doc["c"] = c;
  if (v)
    doc["v"] = v;
  doc["ok"] = ok;
  doc["msg"] = msg;
  doc["seq"] = ++ackSeq;
  doc["ts"] = nowSec();
  doc["spd"] = g_speedPct;

  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(TOPIC_ACK, (const uint8_t *)buf, (unsigned int)n, false);
  Serial.printf("[ACK] %s -> %s (%s)\n", c, msg, ok ? "ok" : "fail");
}

// =====================================================
//                   COMMAND HANDLER
// =====================================================
void handleCalibration(const JsonVariant &spec)
{
  if (!spec.is<JsonObject>())
    return;
  const char *sensor = spec["sensor"] | "ph";
  int point = spec["point"] | 0;
  if (strcmp(sensor, "ph") != 0)
  {
    sendAck("calib", sensor, false, "unsupported sensor");
    return;
  }
  if (point == 7)
  {
    // Put the probe in pH 7 buffer, then calibrate the neutral point.
    phNeutralMV = snap.phMV;
    prefs.putFloat(NVS_KEY_PH_NEUTRAL, phNeutralMV);
    sendAck("calib", "ph7", true, "pH 7 neutral calibrated");
  }
  else if (point == 4)
  {
    // Probe in pH 4 buffer: derive slope from mV delta around neutral.
    if (snap.phMV > 0.0f)
    {
      phSlopeMVPerPH = (phNeutralMV - snap.phMV) / 3.0f;
      prefs.putFloat(NVS_KEY_PH_SLOPE, phSlopeMVPerPH);
      sendAck("calib", "ph4", true, "pH 4 slope calibrated");
    }
    else
    {
      sendAck("calib", "ph4", false, "no pH reading");
    }
  }
  else
  {
    sendAck("calib", sensor, false, "unsupported point");
  }
}

void onCommand(char *topic, byte *payload, unsigned int length)
{
  // Always refresh sensor state first so calibration/selections use fresh data.
  readPH();
  readTemp();

  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, payload, length))
  {
    sendAck("?", nullptr, false, "bad json");
    return;
  }

  const char *c = doc["c"] | "";
  int v = doc["v"] | -1;

  if (strcmp(c, "move") == 0)
  {
    // Optional speed override rides along with the direction.
    g_speedPct = constrain(doc["speed"] | g_speedPct, 0, 100);

    const char *dir = doc["v"] | "stop";
    if (strcmp(dir, "forward") == 0)
    {
      forwardMotor();
      sendAck(c, dir, true, "FORWARD");
    }
    else if (strcmp(dir, "reverse") == 0 || strcmp(dir, "backward") == 0)
    {
      backwardMotor();
      sendAck(c, dir, true, "REVERSE");
    }
    else if (strcmp(dir, "left") == 0)
    {
      leftMotor();
      sendAck(c, dir, true, "LEFT");
    }
    else if (strcmp(dir, "right") == 0)
    {
      rightMotor();
      sendAck(c, dir, true, "RIGHT");
    }
    else if (strcmp(dir, "stop") == 0)
    {
      stopMotor();
      sendAck(c, dir, true, "STOP");
    }
    else
      sendAck(c, dir, false, "unknown move");
  }
  else if (strcmp(c, "speed") == 0)
  {
    if (v >= 0 && v <= 100)
    {
      g_speedPct = v;
      char sbuf[12];
      snprintf(sbuf, sizeof(sbuf), "%d", v);
      sendAck(c, sbuf, true, "SPEED SET");
    }
    else
    {
      char sbuf[12];
      snprintf(sbuf, sizeof(sbuf), "%d", v);
      sendAck(c, sbuf, false, "speed out of range");
    }
  }
  else if (strcmp(c, "belt") == 0)
  {
    bool on = (v == 1);
    if (on)
      beltOn();
    else
      beltOff();
    sendAck(c, on ? "1" : "0", true, on ? "BELT ON" : "BELT OFF");
  }
  else if (strcmp(c, "feed") == 0)
  {
    // One-shot open->close feeding cycle.
    foodOpen();
    delay(800);
    foodClose();
    sendAck(c, "1", true, "FEED DISPENSED");
  }
  else if (strcmp(c, "pickup") == 0)
  {
    // One-shot conveyor sweep for trash pickup.
    beltOn();
    delay(3000);
    beltOff();
    sendAck(c, "1", true, "PICKUP SWEEP DONE");
  }
  else if (strcmp(c, "empty") == 0)
  {
    // No dump hardware in the current build — ack only.
    sendAck(c, "1", true, "EMPTY ACKED (no hardware)");
  }
  else if (strcmp(c, "home") == 0)
  {
    // No autopilot in the current firmware — halt motion and report stub.
    stopMotor();
    sendAck(c, "1", true, "HOME STUB (stopped)");
  }
  else if (strcmp(c, "calib") == 0)
  {
    handleCalibration(doc["v"]);
  }
  else
  {
    sendAck(c, nullptr, false, "unknown command");
  }
}

// =====================================================
//                    MQTT CONNECT
// =====================================================
bool connectMQTT()
{
  char clientId[32];
  snprintf(clientId, sizeof(clientId), "as-%s", DEVICE_ID);

  // Last Will: broker flips status topic to "offline" (retained) on drop.
  bool ok = mqtt.connect(clientId, MQTT_USER, MQTT_PASSWORD,
                         TOPIC_STATUS, 1, true, "offline");
  if (ok)
  {
    mqtt.subscribe(TOPIC_CMD, 1);
    mqtt.publish(TOPIC_STATUS, "online", true);
    return true;
  }
  return false;
}

// =====================================================
//                  WIFI
// =====================================================
void connectWiFi()
{
  Serial.println("Connecting to WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected — IP: ");
  Serial.println(WiFi.localIP());

  // Best-effort NTP for accurate telemetry timestamps (non-blocking feel).
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

// =====================================================
//                    CALIBRATION
// =====================================================
void loadCalib()
{
  prefs.begin(NVS_NAMESPACE, false);
  phNeutralMV = prefs.getFloat(NVS_KEY_PH_NEUTRAL, PH_NEUTRAL_MV);
  phSlopeMVPerPH = prefs.getFloat(NVS_KEY_PH_SLOPE, PH_SLOPE_MV_PER_PH);
  Serial.printf("pH calib loaded: neutral=%.1f mV, slope=%.2f mV/pH\n",
                phNeutralMV, phSlopeMVPerPH);
}

// =====================================================
//                      SETUP
// =====================================================
void setup()
{
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n[BOOT] AquaSweep firmware %s \n", FW_VERSION);

  // Wheel motors — PWM channels, OFF at startup
  motorPwmAttach(PIN_IN1, CH_IN1);
  motorPwmAttach(PIN_IN2, CH_IN2);
  motorPwmAttach(PIN_IN3, CH_IN3);
  motorPwmAttach(PIN_IN4, CH_IN4);
  stopMotor();

  // Conveyor relay — OFF at startup
  pinMode(PIN_BELT_RELAY, OUTPUT);
  digitalWrite(PIN_BELT_RELAY, HIGH);

  // Servo
  pinMode(PIN_SERVO, OUTPUT);

  // Ultrasonic
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  // Turbidity
  pinMode(PIN_TURBIDITY, INPUT);

  // pH (PH-4502C analog out)
  pinMode(PIN_PH, INPUT);

  // Temperature (DS18B20 OneWire)
  tempBus.begin();

  // Battery (optional divider)
  if (BATTERY_DIVIDER_RATIO > 0.0f)
    pinMode(PIN_BATTERY, INPUT);

  loadCalib();
  connectWiFi();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  mqtt.setBufferSize(1024);

  bootTimeSec = millis() / 1000;
  connectMQTT();

  Serial.println("[SETUP] complete");
}

// =====================================================
//                      LOOP
// =====================================================
void loop()
{
  if (!mqtt.connected())
  {
    unsigned long now = millis();
    if (now - lastReconnectMs > 5000)
    {
      lastReconnectMs = now;
      Serial.println("[MQTT] reconnect attempt...");
      if (connectMQTT())
        Serial.println("[MQTT] reconnected");
    }
  }
  else
  {
    mqtt.loop();

    if (millis() - lastTelemetryMs >= TELEMETRY_MS)
    {
      lastTelemetryMs = millis();
      publishTelemetry();
    }
  }
}