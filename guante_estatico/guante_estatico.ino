/*
 * ============================================================================
 *  GUANTE LSP — guante_estatico v2.0
 *  Versión mejorada de `Codigo_principio`: mismo reconocimiento estático por
 *  plantillas de flexión, ahora con abecedario completo, margen de decisión,
 *  confianza en `S:` y botón para separar palabras.
 * ============================================================================
 *
 *  QUÉ HACE
 *  - Lee 5 flex + MPU6050 (igual que Codigo_principio).
 *  - Compara la flexión actual contra plantillas de fábrica y señas aprendidas.
 *  - Emite `S:nombre|conf` solo si la pose es clara (distancia + margen).
 *  - Permite aprender letras y FRASES completas con tu mano (`LEARN`/`LEARNO`).
 *  - El botón BOOT (GPIO0) sirve para deletrear frases:
 *      pulsación corta  -> S:ESPACIO   (separa palabra)
 *      pulsación media  -> S:BORRAR    (borra último carácter)
 *      pulsación larga  -> S:LIMPIAR   (borra todo)
 *    La app (y prueba_edwin) ya entienden esos controles.
 *
 *  ABECEDARIO
 *  Las 14 letras marcadas `true` son separables con solo flexión. Las 13
 *  marcadas `false` (G, H, J, K, M, N, Ñ, P, Q, R, T, V, Z) se listan con
 *  `L:nombre|R`: hay que aprenderlas con la mano porque 5 flex no alcanzan
 *  (U/V/H, K/P, M/N/T, G/L, J/Ñ/Z comparten patrones). `LEARN`/`LEARNO` las
 *  reemplaza y desde ese momento sí se reconocen.
 *
 *  PROTOCOLO (texto, una línea por mensaje, terminada en '\n')
 *    D:f1..f5,roll,pitch,gyro   telemetría en vivo
 *    S:nombre|conf              seña reconocida
 *    S:ESPACIO|100              control: espacio
 *    S:BORRAR|100               control: borrar último carácter
 *    S:LIMPIAR|100              control: limpiar todo
 *    L:nombre|F   fábrica reconocible
 *    L:nombre|R   fábrica que requiere aprendizaje
 *    L:nombre|C   aprendida por el usuario
 *    LEND, OK:..., ERR:..., WARN:..., R:f1..f5, HELLO:...
 *
 *  COMANDOS (Monitor Serie 115200 o BLE RX)
 *    CAL_OPEN / CAL_FIST   calibración de mano abierta / puño
 *    LEARN:nombre          aprende solo flexión
 *    LEARNO:nombre         aprende flexión + orientación (recomendado frases)
 *    DEL:nombre            borra una seña aprendida
 *    LIST                  lista F/R/C
 *    CLEAR                 borra todas las aprendidas
 *    ESPACIO/BORRAR/LIMPIAR  prueba de controles
 *    STREAM:1/0, RAW, PING
 *
 *  ARDUINO IDE
 *  - Placa "ESP32 Dev Module"; la carpeta debe llamarse guante_estatico.
 *  - Monitor Serie: 115200.
 *  - Guardar este archivo en UTF-8 (los nombres llevan tildes y ¿).
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
#define BTN_PIN 0              // BOOT de la placa; activo en LOW

// Un nombre por guante: la app conecta los dos a la vez.
// Mano derecha "GuanteLSP-D", mano izquierda "GuanteLSP-I".
#define DEVICE_NAME "GuanteLSP-D"
#define LOOP_MS 20             // 50 Hz
#define HOLD_FRAMES 8          // 8 x 20 ms = 160 ms sostenidos
#define MAX_FLEX_DIST 18.0f    // distancia media máxima para aceptar
#define MIN_FLEX_RECONOCER 60.0f  // no reconocer con la mano casi abierta
#define MIN_MARGEN 2.0f        // 2ª mejor debe estar al menos 2 % más lejos
#define MAX_ORI_DIFF 35.0f
#define MAX_CUSTOM 60
#define NAME_LEN 20
#define BLE_CHUNK 20

#define NUS_SERVICE "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define NUS_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

/* ============================ 2. ABECEDARIO ============================== */

struct Builtin {
  const char* name;
  uint8_t flex[5];
  bool reconocible;  // false = hay que aprenderla con LEARN/LEARNO
};

static const Builtin BUILTIN[] = {
  {"A", {30, 100, 100, 100, 100}, true},
  {"B", {85, 0, 0, 0, 0}, true},
  {"C", {30, 35, 35, 35, 35}, true},
  {"D", {60, 0, 80, 80, 80}, true},
  {"E", {75, 90, 90, 90, 90}, true},
  {"F", {55, 70, 0, 0, 0}, true},
  {"G", {40, 0, 0, 0, 0}, false},
  {"H", {70, 0, 0, 100, 100}, false},
  {"I", {70, 100, 100, 100, 0}, true},
  {"J", {70, 100, 100, 100, 0}, false},
  {"K", {50, 0, 0, 100, 100}, false},
  {"L", {0, 0, 100, 100, 100}, true},
  {"M", {60, 100, 100, 100, 0}, false},
  {"N", {60, 100, 100, 0, 0}, false},
  {"Ñ", {60, 100, 100, 0, 0}, false},
  {"O", {60, 65, 65, 65, 65}, true},
  {"P", {50, 50, 50, 50, 50}, false},
  {"Q", {60, 60, 60, 60, 60}, false},
  {"R", {60, 0, 0, 100, 100}, false},
  {"S", {65, 100, 100, 100, 100}, true},
  {"T", {70, 100, 100, 0, 0}, false},
  {"U", {70, 0, 0, 100, 100}, true},
  {"V", {70, 0, 0, 100, 100}, false},
  {"W", {70, 0, 0, 0, 100}, true},
  {"X", {60, 50, 100, 100, 100}, true},
  {"Y", {0, 100, 100, 100, 0}, true},
  {"Z", {60, 0, 0, 0, 0}, false},
};
static const int BUILTIN_COUNT = sizeof(BUILTIN) / sizeof(BUILTIN[0]);

/* ============================== 3. ESTADO ================================ */

struct Sign {
  char name[NAME_LEN];
  uint8_t flex[5];
  int16_t roll;
  int16_t pitch;
  uint8_t useOri;
};

Sign customSigns[MAX_CUSTOM];
int customCount = 0;

int rawOpen[5] = {3000, 3000, 3000, 3000, 3000};
int rawFist[5] = {1800, 1800, 1800, 1800, 1800};

float flexPct[5] = {0, 0, 0, 0, 0};
float rollDeg = 0, pitchDeg = 0, gyroMag = 0;
bool mpuOk = false;
bool streamOn = true;

Preferences prefs;
BLEServer* bleServer = nullptr;
BLECharacteristic* txChar = nullptr;
volatile bool deviceConnected = false;
volatile bool advPendiente = false;

String rxBuf;
String cmdQueue[6];
volatile uint8_t qHead = 0, qTail = 0;

/* ============================ 4. UTILIDADES ============================== */

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

float angDiff(float a, float b) {
  float d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/* ============================= 5. SENSORES =============================== */

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
  mpuRead();
}

/* ========================== 6. MEMORIA (NVS) ============================ */

void saveCustom() {
  prefs.begin("guante", false);
  prefs.putUChar("n", customCount);
  prefs.putBytes("signs", customSigns, customCount * sizeof(Sign));
  prefs.end();
}

void loadAll() {
  prefs.begin("guante", true);
  int n = prefs.getUChar("n", 0);
  if (n > MAX_CUSTOM) n = 0;
  customCount = n;
  if (n > 0) prefs.getBytes("signs", customSigns, n * sizeof(Sign));
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

/* ================================ 7. SEÑAS =============================== */

int findCustom(const String& name) {
  for (int i = 0; i < customCount; i++) {
    if (name.equals(customSigns[i].name)) return i;
  }
  return -1;
}

const char* recognize(float& bestD) {
  const char* best = nullptr;
  bestD = 1e9f;
  float secondD = 1e9f;

  auto evaluar = [&](const char* nombre, const uint8_t flex[5], bool usarOri,
                     int16_t roll, int16_t pitch) {
    if (usarOri) {
      if (fabsf(angDiff(rollDeg, roll)) > MAX_ORI_DIFF) return;
      if (fabsf(angDiff(pitchDeg, pitch)) > MAX_ORI_DIFF) return;
    }
    float d = 0;
    for (int i = 0; i < 5; i++) d += fabsf(flexPct[i] - flex[i]);
    d /= 5.0f;
    if (d < bestD) {
      secondD = bestD;
      bestD = d;
      best = nombre;
    } else if (d < secondD) {
      secondD = d;
    }
  };

  for (int k = 0; k < customCount; k++) {
    Sign& s = customSigns[k];
    evaluar(s.name, s.flex, s.useOri != 0, s.roll, s.pitch);
  }

  for (int k = 0; k < BUILTIN_COUNT; k++) {
    if (!BUILTIN[k].reconocible) continue;
    if (findCustom(String(BUILTIN[k].name)) >= 0) continue;
    evaluar(BUILTIN[k].name, BUILTIN[k].flex, false, 0, 0);
  }

  if (best == nullptr || bestD > MAX_FLEX_DIST) return nullptr;
  if (secondD - bestD < MIN_MARGEN) return nullptr;
  return best;
}

void learnSign(String name, bool useOri) {
  name.trim();
  if (name.length() == 0 || name.length() >= NAME_LEN) {
    sendLine("ERR:nombre invalido (1 a 19 bytes)");
    return;
  }
  if (!mpuOk && useOri) sendLine("WARN:MPU6050 no responde, orientacion = 0");

  float f[5] = {0, 0, 0, 0, 0};
  float r = 0, p = 0;
  const int N = 20;
  for (int n = 0; n < N; n++) {
    updateSensors();
    for (int i = 0; i < 5; i++) f[i] += flexPct[i];
    r += rollDeg;
    p += pitchDeg;
    delay(40);
  }

  int idx = findCustom(name);
  if (idx < 0) {
    if (customCount >= MAX_CUSTOM) {
      sendLine("ERR:memoria llena (max 60 señas)");
      return;
    }
    idx = customCount++;
  }

  Sign& s = customSigns[idx];
  memset(&s, 0, sizeof(Sign));
  strncpy(s.name, name.c_str(), NAME_LEN - 1);
  for (int i = 0; i < 5; i++) {
    s.flex[i] = (uint8_t)constrain((int)(f[i] / N + 0.5f), 0, 100);
  }
  s.roll = (int16_t)(r / N);
  s.pitch = (int16_t)(p / N);
  s.useOri = useOri ? 1 : 0;
  saveCustom();
  sendLine("OK:LEARN:" + name);
}

void deleteSign(String name) {
  name.trim();
  int idx = findCustom(name);
  if (idx < 0) {
    sendLine("ERR:no existe una seña guardada con ese nombre");
    return;
  }
  for (int i = idx; i < customCount - 1; i++) customSigns[i] = customSigns[i + 1];
  customCount--;
  saveCustom();
  sendLine("OK:DEL:" + name);
}

void listSigns() {
  for (int k = 0; k < BUILTIN_COUNT; k++) {
    if (findCustom(String(BUILTIN[k].name)) >= 0) continue;
    sendLine(String("L:") + BUILTIN[k].name + "|" +
             (BUILTIN[k].reconocible ? "F" : "R"));
  }
  for (int i = 0; i < customCount; i++) {
    sendLine(String("L:") + customSigns[i].name + "|C");
  }
  sendLine("LEND");
}

/* ============================ 8. CALIBRACIÓN ============================= */

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

/* ============================== 9. COMANDOS ============================== */

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
  } else if (cmd == "LEARN") {
    learnSign(arg, false);
  } else if (cmd == "LEARNO") {
    learnSign(arg, true);
  } else if (cmd == "DEL") {
    deleteSign(arg);
  } else if (cmd == "LIST") {
    listSigns();
  } else if (cmd == "CLEAR") {
    customCount = 0;
    saveCustom();
    sendLine("OK:CLEAR");
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
  } else if (cmd == "ESPACIO") {
    sendLine("S:ESPACIO|100");
  } else if (cmd == "BORRAR") {
    sendLine("S:BORRAR|100");
  } else if (cmd == "LIMPIAR") {
    sendLine("S:LIMPIAR|100");
  } else if (cmd == "PING") {
    sendLine("OK:PONG");
  } else {
    sendLine("ERR:comando desconocido: " + cmd);
  }
}

/* ================================ 10. BLE ================================ */

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
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCb());

  BLEService* svc = bleServer->createService(NUS_SERVICE);
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

/* ============================== 11. BOTÓN ================================ */

static bool btnAnterior = HIGH;
static uint32_t btnT0 = 0;
static uint32_t btnUltimoCambio = 0;

void atenderBoton() {
  bool actual = digitalRead(BTN_PIN);
  uint32_t ahora = millis();
  if (actual == btnAnterior) return;
  if (ahora - btnUltimoCambio < 25) return;  // rebote
  btnUltimoCambio = ahora;

  if (actual == LOW) {
    btnT0 = ahora;
  } else {
    uint32_t dur = ahora - btnT0;
    if (dur < 450) {
      sendLine("S:ESPACIO|100");
    } else if (dur < 1400) {
      sendLine("S:BORRAR|100");
    } else {
      sendLine("S:LIMPIAR|100");
    }
  }
  btnAnterior = actual;
}

/* ============================ 12. SETUP / LOOP =========================== */

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(BTN_PIN, INPUT_PULLUP);
  for (int i = 0; i < 5; i++) pinMode(FLEX_PINS[i], INPUT);

  loadAll();
  mpuInit();
  bleInit();

  Serial.println();
  Serial.println("==============================================");
  Serial.println("  guante_estatico 2.0");
  Serial.println("  50 Hz · 5 flex + IMU · plantillas estáticas");
  Serial.printf ("  MPU6050: %s\n", mpuOk ? "OK" : "NO RESPONDE");
  Serial.println("  Botón BOOT: corto=ESPACIO · medio=BORRAR · largo=LIMPIAR");
  Serial.println("  Comandos: CAL_OPEN, CAL_FIST, LEARN:nombre, LEARNO:nombre,");
  Serial.println("            LIST, CLEAR, RAW, PING");
  Serial.println("==============================================");
}

void loop() {
  atenderBoton();

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
  static String cand = "";
  static uint8_t hold = 0;
  static bool emitted = false;
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

  float sumaFlex = 0;
  for (int i = 0; i < 5; i++) sumaFlex += flexPct[i];

  float d = 0;
  const char* c = (sumaFlex >= MIN_FLEX_RECONOCER) ? recognize(d) : nullptr;
  String name = c ? String(c) : String("");

  if (name == cand) {
    if (name.length() > 0 && !emitted && ++hold >= HOLD_FRAMES) {
      int conf = (int)constrain(100.0f - d * (100.0f / MAX_FLEX_DIST), 0.0f, 100.0f);
      sendLine("S:" + name + "|" + conf);
      emitted = true;
    }
  } else {
    cand = name;
    hold = 1;
    emitted = false;
  }
}
