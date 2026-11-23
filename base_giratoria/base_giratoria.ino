/*
 * ============================================================================
 *  BASE GIRATORIA — Arduino UNO + módulo BLE HM-10 (o clon: AT-09, BT05,
 *  MLT-BT05, CC41-A) + servo.
 * ============================================================================
 *
 *  CONEXIONES
 *    HM-10 VCC -> 5V        HM-10 GND -> GND
 *    HM-10 TXD -> pin 2     HM-10 RXD -> pin 3 (con divisor 1k/2k: el RX del
 *                                              HM-10 es de 3.3 V)
 *    Servo señal -> pin 9   Servo + -> 5V (mejor fuente aparte)   Servo - -> GND
 *
 *  NOMBRE BLE
 *    La app acepta "BaseGiro" y también los nombres de fábrica (HMSoft, BT05,
 *    MLT-BT05, CC41-A), así que funciona sin configurar nada. Para renombrarlo
 *    (recomendado si hay otros HM-10 cerca): con el módulo SIN conexión,
 *    escribe en el Monitor Serie (9600, "Ambos NL & CR"):  AT+NAMEBaseGiro
 *    Este sketch reenvía al módulo lo que escribes en el Monitor Serie.
 *
 *  PROTOCOLO (líneas terminadas en '\n')
 *    PING        -> PONG          (la app lo manda al conectarse)
 *    G:<0-180>   -> OK:G:<grados> (gira el servo a ese ángulo)
 *    otra cosa   -> ERR:<motivo>
 *
 *  NO es un HM-10 si en el celular aparece solo en los ajustes de Bluetooth
 *  con PIN 1234 (HC-05/HC-06): ese no sirve, usa base_giratoria_esp32.
 * ============================================================================
 */

#include <SoftwareSerial.h>
#include <Servo.h>

#define BT_RX_PIN 2   // recibe del TXD del HM-10
#define BT_TX_PIN 3   // va al RXD del HM-10
#define SERVO_PIN 9
#define ANGULO_INICIAL 90

SoftwareSerial bt(BT_RX_PIN, BT_TX_PIN);
Servo servo;
String linea = "";

void responder(const String& s) {
  bt.print(s);
  bt.print('\n');
  Serial.print("[app<-] ");
  Serial.println(s);
}

void procesar(String cmd) {
  cmd.trim();
  Serial.print("[app->] ");
  Serial.println(cmd);
  // indexOf: algunos clones anteponen avisos tipo "OK+CONN" sin salto de línea.
  if (cmd.indexOf("PING") >= 0) {
    responder("PONG");
    return;
  }
  int g = cmd.indexOf("G:");
  if (g >= 0) {
    String num = cmd.substring(g + 2);
    if (num.length() == 0 || !isDigit(num[0])) {
      responder("ERR:angulo invalido");
      return;
    }
    int grados = constrain(num.toInt(), 0, 180);
    servo.write(grados);
    responder("OK:G:" + String(grados));
    return;
  }
  if (cmd.length() > 0) responder("ERR:comando desconocido");
}

void setup() {
  Serial.begin(9600);
  bt.begin(9600);  // velocidad de fábrica del HM-10
  servo.attach(SERVO_PIN);
  servo.write(ANGULO_INICIAL);
  Serial.println("Base giratoria lista. Esperando la app...");
}

void loop() {
  while (bt.available()) {
    char c = bt.read();
    if (c == '\n' || c == '\r') {
      if (linea.length() > 0) procesar(linea);
      linea = "";
    } else if (linea.length() < 40) {
      linea += c;
    }
  }
  // Puente Monitor Serie -> HM-10 (para comandos AT de configuración).
  while (Serial.available()) bt.write(Serial.read());
}
