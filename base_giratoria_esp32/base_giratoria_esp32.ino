/*
 * ============================================================================
 *  BASE GIRATORIA — alternativa con ESP32 (si el Arduino UNO no tiene HM-10).
 *  El ESP32 imita a un HM-10 (servicio FFE0 / característica FFE1, nombre
 *  "BaseGiro"), así que la app no necesita ningún cambio.
 * ============================================================================
 *
 *  ARDUINO IDE
 *  - Placa "ESP32 Dev Module".
 *  - Instalar la librería "ESP32Servo" (Gestor de librerías).
 *  - Monitor Serie: 115200.
 *
 *  CONEXIONES
 *    Servo señal -> GPIO 13   Servo + -> 5V (mejor fuente aparte)   Servo - -> GND
 *
 *  PROTOCOLO (igual que base_giratoria, líneas terminadas en '\n')
 *    PING        -> PONG
 *    G:<0-180>   -> OK:G:<grados>
 *    otra cosa   -> ERR:<motivo>
 * ============================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <ESP32Servo.h>

#define DEVICE_NAME "BaseGiro"
#define SERVICE_UUID "0000ffe0-0000-1000-8000-00805f9b34fb"
#define CHAR_UUID "0000ffe1-0000-1000-8000-00805f9b34fb"
#define SERVO_PIN 13
#define ANGULO_INICIAL 90

Servo servo;
BLECharacteristic* ch = nullptr;
volatile bool reanunciar = false;
String rxBuf = "";
String pendiente = "";  // línea completa a procesar en loop()

void responder(const String& s) {
  String l = s + "\n";
  ch->setValue((uint8_t*)l.c_str(), l.length());
  ch->notify();
  Serial.println("[app<-] " + s);
}

void procesar(String cmd) {
  cmd.trim();
  Serial.println("[app->] " + cmd);
  if (cmd == "PING") {
    responder("PONG");
  } else if (cmd.startsWith("G:")) {
    String num = cmd.substring(2);
    if (num.length() == 0 || !isDigit(num[0])) {
      responder("ERR:angulo invalido");
      return;
    }
    int grados = constrain(num.toInt(), 0, 180);
    servo.write(grados);
    responder("OK:G:" + String(grados));
  } else if (cmd.length() > 0) {
    responder("ERR:comando desconocido");
  }
}

class ServerCb : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { Serial.println("[ble] app conectada"); }
  void onDisconnect(BLEServer*) override {
    Serial.println("[ble] app desconectada");
    reanunciar = true;
  }
};

class RxCb : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = String(c->getValue().c_str());
    for (size_t i = 0; i < v.length(); i++) {
      char k = v[i];
      if (k == '\n' || k == '\r') {
        if (rxBuf.length() > 0 && pendiente.length() == 0) pendiente = rxBuf;
        rxBuf = "";
      } else if (rxBuf.length() < 40) {
        rxBuf += k;
      }
    }
  }
};

void setup() {
  Serial.begin(115200);
  servo.attach(SERVO_PIN);
  servo.write(ANGULO_INICIAL);

  BLEDevice::init(DEVICE_NAME);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCb());
  BLEService* svc = server->createService(SERVICE_UUID);
  ch = svc->createCharacteristic(
      CHAR_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY |
                     BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  ch->addDescriptor(new BLE2902());
  ch->setCallbacks(new RxCb());
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Base giratoria (ESP32) lista. Esperando la app...");
}

void loop() {
  if (pendiente.length() > 0) {
    String cmd = pendiente;
    pendiente = "";
    procesar(cmd);
  }
  if (reanunciar) {
    reanunciar = false;
    delay(300);
    BLEDevice::startAdvertising();
  }
  delay(5);
}
