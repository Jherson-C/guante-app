# Cómo seguir entrenando el traductor de señas

Guía para quien continúe. Ya no se usan los guantes: una cámara mira las manos y el Arduino UNO Q reconoce la seña.

## Cómo está armado

```
Cámara USB ──► Laptop (cerebro.py camara-pc: detecta las manos con MediaPipe)
                 │  cable USB (adb)
                 ▼
               Arduino UNO Q (cerebro: reconoce la seña, sirve la página)
                 │  Bluetooth
                 ▼
               Teléfono / tablet con la app (muestra y lee la traducción)
```

## Lo que ya está hecho

- La placa ya reconoce **24 letras** sin grabar nada: aprendió de ~3000 fotos reales del dataset de la UPC.
- La página de entrenamiento muestra la cámara con las manos marcadas (verde = derecha, naranja = izquierda), debajo lo que va reconociendo, y el dibujo de cada letra mientras se graba.
- Una seña grabada con una mano también se reconoce con la otra.

## Entrenar sin la placa (en tu propia laptop)

Si la placa la tiene otra persona, igual puedes grabar señas: todo corre en tu laptop.

1. Copia la carpeta `cerebro` completa (trae `datos_camara.csv` con las letras ya aprendidas).
2. Instala una sola vez: `pip install mediapipe scikit-learn`
3. Desde la carpeta `cerebro`, con tu cámara (la de la laptop sirve):
   ```
   python cerebro.py solo-pc
   ```
   Se abre http://127.0.0.1:8000: la misma página, con la cámara y debajo lo que va reconociendo. Calibra y graba igual que abajo.
4. Al terminar, pásale tu `cerebro/datos_camara.csv` a quien tiene la placa.

Quien tiene la placa (conectada por USB) lo carga así, desde su carpeta `cerebro`:
```
python cerebro.py cargar ruta\al\datos_camara.csv
```
Solo suma las señas nuevas (no borra nada de la placa) y deja un respaldo en la placa (`datos_camara.csv.antes_de_cargar`).
Si borraste una seña en tu laptop, en la placa se borra desde su página.

## Para arrancar con la placa (en la laptop)

Hace falta: Python 3, `adb` (Android platform-tools), la cámara USB y la placa conectadas a la laptop.

1. Instalar una sola vez:
   ```
   pip install mediapipe scikit-learn
   ```
2. Revisar que la laptop ve la placa (tiene que salir un número y la palabra `device`):
   ```
   adb devices
   ```
3. Arrancar, desde la carpeta `cerebro` del proyecto:
   ```
   python cerebro.py camara-pc
   ```
   Se abre sola la página http://localhost:8000. Si no carga, usar **http://127.0.0.1:8000**.

## Qué falta grabar (en este orden)

Antes de grabar: en **1. Calibrar**, con la mano marcada en la cámara, tocar «Mano abierta» (sostenerla 2 s) y luego «Puño». Una vez por persona, para cada mano.

1. **REPOSO**: manos sueltas, sin hacer señas. ¡Es lo más importante! Sin esto escribe letras solo.
2. **A, E, I, O, U**: hay que volver a grabarlas (las grabaciones de antes quedaron en un formato viejo).
3. **J, Ñ, Z**: llevan movimiento, no estaban en las fotos. Marcar «Tienen movimiento».
4. Las **palabras** que se van a usar en la presentación (grupos Saludos, Preguntas, etc.).
5. **TRANSICION** al final: 5 vueltas pasando rápido de una seña a otra.

Cómo se graba: escribir el nombre en «Señas» (o tocar un grupo), dejar **Vueltas = 3** y tocar **Grabar**. Hacer la seña cuando la página lo indique y sostenerla los 2 s. Después probarla y mirar «Ahora reconozco» arriba; si falla, grabarla otra vez.

Consejos: grabar con la misma luz y distancia que en la presentación; que la cámara marque bien los dedos mientras se graba.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| `adb devices` no muestra la placa | Desconectar y volver a conectar el cable USB de la placa. |
| La página no carga | Usar http://127.0.0.1:8000. Revisar que `camara-pc` siga corriendo. |
| No se ve la cámara en la página | Cerrar otros programas que usen la cámara (Zoom, Meet) y volver a correr `camara-pc`. |
| «la cámara no ve tu mano» al calibrar | Poner la mano frente a la cámara hasta que salga marcada, y recién tocar el botón. |
| Nada responde | Reiniciar el cerebro de la placa: `adb shell "XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart cerebro"` |

## Dónde están las cosas

- Código: `cerebro/cerebro.py` (todo el reconocimiento) y `cerebro/entrenar.html` (la página).
- Señas grabadas: en la placa, `~/cerebro/datos_camara.csv`. En la página, el botón «Descargar copia de las señas» baja una copia: **bajarla al terminar cada sesión**.
- Respaldos en la placa: `datos_camara.viejo.csv` (grabaciones antes del cambio de formato) y `datos_camara.respaldo.csv`.
- Autoprueba sin hardware: `python cerebro.py prueba` (debe terminar con «autoprueba OK»).
