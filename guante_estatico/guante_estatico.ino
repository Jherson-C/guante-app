/*
 * ============================================================================
 *  GUANTE LSP — firmware de sensor v3.0
 *  El guante solo mide y transmite. Reconocer las señas lo hace el cerebro
 *  (Arduino UNO Q, cerebro/cerebro.py).
 * ============================================================================
 *
 *  QUÉ HACE
 *  - Lee 5 sensores de flexión + MPU6050.
 *  - Convierte cada dedo a 0–100 % con la calibración (mano abierta / puño).
 *  - Envía la telemetría por BLE a ~25 Hz mientras haya alguien conectado.
 *
 *  PROTOCOLO (texto, una línea por mensaje, terminada en '\n')
 *    D:f1..f5,roll,pitch,gyro   telemetría (flex %, grados, deg/s)
 *    HELLO:..., OK:..., WARN:..., ERR:..., R:f1..f5
 *
 *  COMANDOS (Monitor Serie 115200 o BLE RX)
 *    CAL_OPEN / CAL_FIST   calibración de mano abierta / puño (se guarda)
 *    STREAM:1/0, RAW, PING
 *
 *  ARDUINO IDE
 *  - Placa "ESP32 Dev Module"; la carpeta debe llamarse guante_estatico.
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

/* ============================ 1. CONFIGURACIÓN ============================ */

static const uint8_t FLEX_PINS[5] = {34, 35, 32, 33, 25};  // Pulgar..Meñique
static const char* FINGER_NAMES[5] = {"Pulgar", "Indice", "Medio", "Anular", "Menique"};

#define SDA_PIN 21
#define SCL_PIN 22
#define MPU_ADDR 0x68

// Con el cerebro UNO Q: derecha "GuanteLSP-SD", izquierda "GuanteLSP-SI".
// Sin cerebro, directo a la app: "GuanteLSP-D".
// Guante izquierdo: compilar con -DGUANTE_IZQ. Su sensor del pulgar se quemó:
// el pulgar se manda siempre en 0 (un pin suelto da ruido y confunde al reconocedor).
#ifdef GUANTE_IZQ
#define DEVICE_NAME "GuanteLSP-SI"
#define SIN_PULGAR 1
#else
#define DEVICE_NAME "GuanteLSP-SD"
#define SIN_PULGAR 0
#endif
#define LOOP_MS 20             // lectura a 50 Hz; se envía 1 de cada 2 (25 Hz)
#define BLE_CHUNK 20

#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

/* ============================== 2. ESTADO ================================ */

int rawOpen[5] = {3000, 3000, 3000, 3000, 3000};
int rawFist[5] = {1800, 1800, 1800, 1800, 1800};

float flexPct[5] = {0, 0, 0, 0, 0};
float rollDeg = 0, pitchDeg = 0, gyroMag = 0;
bool mpuOk = false;
bool streamOn = true;

Preferences prefs;
BLECharacteristic* txChar = nullptr;
volatile bool deviceConnected = false;
volatile bool advPendiente = false;

String rxBuf;
String cmdQueue[6];
volatile uint8_t qHead = 0, qTail = 0;

/* ============================ 3. UTILIDADES ============================== */

void sendLine(const String& s) {
  Serial.println(s);
  if (!deviceConnected || txChar == nullptr) return;

  String line = s + "\n";
  size_t len = line.length();
  for (size_t i = 0; i < len; i += BLE_CHUNK) {
    size_t end = i + BLE_CHUNK;
    if (end > len) end = len;
    String part = line.substring(i, end);
    txChar->setValue((uint8_t*)part.c_str(), part.length());
    txChar->notify();
    delay(2);
  }
}

/* ============================= 4. SENSORES =============================== */

int readRaw(int i) {
  long sum = 0;
  for (int k = 0; k < 8; k++) sum += analogRead(FLEX_PINS[i]);
  return sum / 8;
}

void mpuInit() {
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  mpuOk = (Wire.endTransmission(true) == 0);
}

void mpuRead() {
  if (!mpuOk) return;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) { mpuOk = false; return; }
  if (Wire.requestFrom(MPU_ADDR, 14, true) < 14) return;

  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  Wire.read(); Wire.read();
  int16_t gx = (Wire.read() << 8) | Wire.read();
  int16_t gy = (Wire.read() << 8) | Wire.read();
  int16_t gz = (Wire.read() << 8) | Wire.read();

  float fax = ax / 16384.0f, fay = ay / 16384.0f, faz = az / 16384.0f;
  rollDeg = atan2f(fay, faz) * 57.2958f;
  pitchDeg = atan2f(-fax, sqrtf(fay * fay + faz * faz)) * 57.2958f;
  float fgx = gx / 131.0f, fgy = gy / 131.0f, fgz = gz / 131.0f;
  gyroMag = sqrtf(fgx * fgx + fgy * fgy + fgz * fgz);
}

void updateSensors() {
  for (int i = 0; i < 5; i++) {
    float raw = readRaw(i);
    float span = (float)(rawFist[i] - rawOpen[i]);
    float p = 0;
    if (fabsf(span) > 50) p = (raw - rawOpen[i]) / span * 100.0f;
    p = constrain(p, 0.0f, 100.0f);
    flexPct[i] = flexPct[i] * 0.65f + p * 0.35f;
  }
  if (SIN_PULGAR) flexPct[0] = 0;
  mpuRead();
}

/* ============================ 5. CALIBRACIÓN ============================= */

void loadCalibration() {
  prefs.begin("guante", true);
  if (prefs.isKey("open")) prefs.getBytes("open", rawOpen, sizeof(rawOpen));
  if (prefs.isKey("fist")) prefs.getBytes("fist", rawFist, sizeof(rawFist));
  prefs.end();
}

void saveCalibration() {
  prefs.begin("guante", false);
  prefs.putBytes("open", rawOpen, sizeof(rawOpen));
  prefs.putBytes("fist", rawFist, sizeof(rawFist));
  prefs.end();
}

void calibrate(int* target) {
  long sum[5] = {0, 0, 0, 0, 0};
  int n = 0;
  uint32_t t0 = millis();
  while (millis() - t0 < 2000) {
    for (int i = 0; i < 5; i++) sum[i] += readRaw(i);
    n++;
    delay(20);
  }
  for (int i = 0; i < 5; i++) target[i] = sum[i] / n;
}

void checkCalibration() {
  for (int i = 0; i < 5; i++) {
    if (abs(rawFist[i] - rawOpen[i]) < 150) {
      sendLine(String("WARN:poco rango en ") + FINGER_NAMES[i] +
               " (revisa cableado/calibracion)");
    }
  }
}

/* ============================== 6. COMANDOS ============================== */

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  String cmd = line, arg = "";
  int c = line.indexOf(':');
  if (c >= 0) {
    cmd = line.substring(0, c);
    arg = line.substring(c + 1);
  }
  cmd.toUpperCase();

  if (cmd == "CAL_OPEN") {
    sendLine("OK:CAL_OPEN:midiendo, mantén la mano ABIERTA");
    calibrate(rawOpen);
    sendLine("OK:CAL_OPEN:listo");
  } else if (cmd == "CAL_FIST") {
    sendLine("OK:CAL_FIST:midiendo, mantén el PUÑO cerrado");
    calibrate(rawFist);
    saveCalibration();
    checkCalibration();
    sendLine("OK:CAL_FIST:listo, calibracion guardada");
  } else if (cmd == "STREAM") {
    streamOn = (arg.toInt() != 0);
    sendLine(String("OK:STREAM:") + (streamOn ? "1" : "0"));
  } else if (cmd == "RAW") {
    String s = "R:";
    for (int i = 0; i < 5; i++) {
      s += readRaw(i);
      if (i < 4) s += ",";
    }
    sendLine(s);
  } else if (cmd == "PING") {
    sendLine("OK:PONG");
  } else {
    sendLine("ERR:comando desconocido: " + cmd);
  }
}

/* ================================ 7. BLE ================================= */

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    Serial.println("[ble] cliente CONECTADO");
  }
  void onDisconnect(BLEServer*) override {
    deviceConnected = false;
    Serial.println("[ble] cliente DESCONECTADO");
    advPendiente = true;
  }
};

class RxCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* ch) override {
    String v = String(ch->getValue().c_str());
    for (size_t i = 0; i < v.length(); i++) {
      char c = v[i];
      if (c == '\n' || c == '\r') {
        if (rxBuf.length() > 0) {
          uint8_t next = (qHead + 1) % 6;
          if (next != qTail) {
            cmdQueue[qHead] = rxBuf;
            qHead = next;
          }
          rxBuf = "";
        }
      } else if (rxBuf.length() < 60) {
        rxBuf += c;
      }
    }
  }
};

void bleInit() {
  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(185);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());

  BLEService* svc = server->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());

  BLECharacteristic* rxChar = svc->createCharacteristic(
      NUS_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rxChar->setCallbacks(new RxCb());

  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

/* ============================ 8. SETUP / LOOP ============================ */

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  for (int i = 0; i < 5; i++) pinMode(FLEX_PINS[i], INPUT);

  loadCalibration();
  mpuInit();
  bleInit();

  Serial.printf("\n%s · sensor v3.0 · MPU6050: %s\n", DEVICE_NAME, mpuOk ? "OK" : "NO RESPONDE");
  Serial.println("Comandos: CAL_OPEN, CAL_FIST, STREAM:1/0, RAW, PING");
}

void loop() {
  if (advPendiente) {
    advPendiente = false;
    delay(300);
    BLEDevice::getAdvertising()->start();
    Serial.println("[ble] re-anunciando");
  }

  while (qTail != qHead) {
    String cmd = cmdQueue[qTail];
    qTail = (qTail + 1) % 6;
    handleCommand(cmd);
  }
  if (Serial.available()) handleCommand(Serial.readStringUntil('\n'));

  static uint32_t lastTick = 0;
  uint32_t now = millis();
  if (now - lastTick < LOOP_MS) return;
  lastTick = now;

  static uint32_t frame = 0;
  static bool wasConnected = false;

  if (deviceConnected && !wasConnected) {
    delay(200);
    sendLine(String("HELLO:") + DEVICE_NAME + (mpuOk ? ":MPU_OK" : ":MPU_FAIL"));
    checkCalibration();
  }
  wasConnected = deviceConnected;

  updateSensors();
  frame++;

  if (streamOn && deviceConnected && (frame % 2 == 0)) {
    String s = "D:";
    for (int i = 0; i < 5; i++) {
      s += (int)(flexPct[i] + 0.5f);
      s += ",";
    }
    s += (int)rollDeg;
    s += ",";
    s += (int)pitchDeg;
    s += ",";
    s += (int)gyroMag;
    sendLine(s);
  }
}
