#!/usr/bin/env python3
"""Cerebro del Traductor de Señas. Corre en el Linux del Arduino UNO Q.

  Cámara (en la PC) --MediaPipe, 21 puntos por mano--> PC --adb forward, M:...--> cerebro (k-NN) --BLE S:...--> app
  o bien, con la cámara enchufada a la placa (hub USB-C con carga): cámara --> cerebro --> app

Uso, en la placa dentro de ~/cerebro (cerebro.service ya lo arranca solo, con ~/venv312):
  python cerebro.py vivo             # recibe las manos de la PC, Qwen arma la frase al hacer pausa, sirve la página
  python cerebro.py vivo --sin-qwen  # cada seña va directo al teléfono, sin armar frases
  python cerebro.py vivo --camara    # la cámara está enchufada a la placa
  python cerebro.py prueba           # autoprueba sin hardware
  python cerebro.py importar <carpeta> <salida.csv>  # fotos carpeta/<letra>/*.jpg -> tomas (en la PC, con mediapipe)

En la PC, con la cámara y la placa conectadas por USB:
  python cerebro.py camara-pc        # necesita: pip install mediapipe scikit-learn
  python cerebro.py camara-pc --pantalla   # usa lo que se ve en el monitor (un video de LSP) en vez de la webcam
  python cerebro.py solo-pc          # sin placa: todo en la laptop, para entrenar (lo grabado queda en datos_camara.csv)
  python cerebro.py cargar <archivo> # suma a la placa lo grabado con solo-pc
  Hace el adb forward y abre http://localhost:8000: la página de entrenamiento con la cámara y las manos marcadas.

En la placa hace falta mediapipe 0.10.18 (Python 3.12) solo para --camara: las versiones 1.x se caen en su
Cortex-A53 ("compiled with lse enabled"). Por eso el servicio usa ~/venv312.
Celulares en el Wi-Fi Traductor-LSP (clave senasperu): http://10.42.0.1:8000 muestra lo que se traduce (solo mirar).
"""
import asyncio
import csv
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from collections import Counter, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
from sklearn.neighbors import KNeighborsClassifier

NUS = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
MANOS = ("D", "I")
NOMBRE_APP = "GuanteLSP-D"  # la app lo busca con este nombre (viene de cuando eran guantes)
DATOS = Path(__file__).with_name("datos_camara.csv")  # datos.csv son las señas viejas de los guantes: no sirven
FRASES = Path(__file__).with_name("frases.json")  # glosas -> frase ya armada (o corregida en la página)
PAGINA = Path(__file__).with_name("entrenar.html")
PAGINA_VISITAS = Path(__file__).with_name("ver.html")  # la que ven los celulares en el Wi-Fi de la feria
ABECEDARIO = Path(__file__).with_name("abecedario")  # dibujos de la guía de LSP del MINEDU (2015)
PUERTO_WEB = 8000
MUESTRAS_TOMA = 50  # 2 s a 25 Hz
VENTANA = 16        # se reconoce mirando los últimos ~0.64 s (con 0.8 s las letras bajaban de 83% a 82%)
# Se aprenden pero nunca se escriben: REPOSO = manos sueltas; TRANSICION = pasar de una seña a otra.
NO_SON_SENAS = {"REPOSO", "TRANSICION"}
SOSTENER = 4        # ventanas seguidas iguales (~160 ms a 25 Hz)
CONF_MIN = 0.8      # fracción de vecinos que deben coincidir
# Tope de la zona de cada seña quieta: una seña grabada con mucho ruido llegó a 732 (las demás, 100-200) y se tragaba todo.
RADIO_MAX = 200
# Con la mano girando más rápido que esto (°/s, promedio del último ~0.5 s) no se escribe una seña quieta:
# al hacer la J la mano pasa por formas de otras letras. En los videos, las letras quietas giran ~14 (90%: < 66)
# y la J ~72.
GIRO_QUIETA = 60
# Ídem al trasladar la mano (subirla, bajarla, moverla de lado): velocidad de la muñeca en la imagen,
# en anchos de imagen por segundo. Sostener una letra es casi 0; bajar la mano, ~1.
VEL_QUIETA = 0.5
PAUSA_PALABRA = 2.0  # letras separadas por más que esto (s) son palabras distintas: H O L A · J U A N
PAUSA_FRASE = 3.0   # segundos sin señas nuevas para cerrar la frase con Qwen (más que PAUSA_PALABRA)
CORTE = ""          # marca entre dos palabras deletreadas (ninguna seña tiene nombre vacío)
MODELO_QWEN = "qwen2.5:1.5b"

# f1..f5 (% de flexión), roll, pitch, giro (velocidad de la mano), pinza (punta pulgar-índice),
# abre (punta índice-medio) por mano. Las dos distancias en % del largo de la palma: separan C de O y U de V.
# pos_x, pos_y: dónde está la muñeca respecto de la cara, en décimas del ancho de la cara (y hacia abajo):
# separan señas iguales hechas en la barbilla, el pecho o la frente, y no cambian si uno se acerca a la cámara.
# En décimas y no en %: con 10 veces más peso, cada persona sostiene las letras en otro lugar y el acierto
# con personas nuevas caía de 83% a 63%.
# shortcut: una mano fuera de cuadro queda en ceros; por eso las señas de una mano se graban con la otra abajo.
TAM = 12  # lecturas por mano
ultimo = {mano: [0.0] * TAM for mano in MANOS}


def vector():
    return ultimo["D"] + ultimo["I"]


# --- Cámara. De los 21 puntos 3D de cada mano saca f1..f5, roll, pitch y giro. ---
CALIBRACION = Path(__file__).with_name("calibracion_camara.json")
MODELO_MANOS = Path(__file__).with_name("hand_landmarker.task")  # solo con mediapipe 1.x (la PC)
MODELO_CARA = Path(__file__).with_name("blaze_face_short_range.tflite")
URL_MODELO_CARA = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
URL_MODELO_MANOS = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
PUERTO_CAMARA = 8001
PUERTO_VIDEO = 8002  # en la PC: la cámara con las manos dibujadas
DEDOS = [(1, 2, 3, 4), (5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16), (17, 18, 19, 20)]  # pulgar..meñique
vistas = set()  # manos que la cámara ve ahora
angulos = {}    # mano -> grados doblados de cada dedo, sin calibrar
# Grados doblados (sumando sus 3 articulaciones) de cada dedo con la mano abierta y con el puño.
# shortcut: valores típicos hasta que se calibre desde la página; se guardan en calibracion_camara.json.
cal = {m: {"CAL_OPEN": [30.0] + [15.0] * 4, "CAL_FIST": [110.0] + [230.0] * 4} for m in MANOS}


def _angulo(a, b):
    c = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(c, -1, 1))))


def pose_mano(p, izquierda):
    """21 puntos en metros (MediaPipe: x a la derecha, y hacia abajo, z alejándose de la cámara)
    -> grados doblados de cada dedo, roll, pitch, y los ejes de la mano (para el giro)."""
    p = np.asarray(p, dtype=float)
    doblado = []
    for dedo in DEDOS:
        tramos = np.diff(p[[0, *dedo]], axis=0)  # muñeca -> base -> ... -> punta
        doblado.append(sum(_angulo(tramos[k], tramos[k + 1]) for k in range(3)))
    adelante = p[9] - p[0]                        # muñeca -> nudillo del medio
    ancho = (p[17] - p[5]) * (-1 if izquierda else 1)  # así cualquier palma de frente a la cámara da roll 0
    normal = np.cross(adelante, ancho)
    # shortcut: roll salta de 180 a -180 con el dorso hacia la cámara; si molesta, grabar esas señas un poco giradas.
    roll = float(np.degrees(np.arctan2(normal[0], -normal[2])))
    pitch = float(np.degrees(np.arctan2(-adelante[1], np.hypot(adelante[0], adelante[2]))))
    palma = np.linalg.norm(adelante) + 1e-9
    dist = [float(100 * np.linalg.norm(p[a] - p[b]) / palma) for a, b in ((4, 8), (8, 12))]
    return doblado, roll, pitch, adelante, normal, dist


def flexion(doblado, c):
    return [float(np.clip(100 * (d - a) / max(f - a, 1), 0, 100)) for d, a, f in zip(doblado, c["CAL_OPEN"], c["CAL_FIST"])]


def calibrar_camara(mano, paso):
    """Promedia 2 s de la pose y lo guarda. False si la cámara no vio esa mano."""
    medidas = []
    for _ in range(50):
        if mano in angulos:
            medidas.append(angulos[mano])
        time.sleep(0.04)
    if len(medidas) < 5:
        return False
    cal[mano][paso] = np.mean(medidas, axis=0).tolist()
    CALIBRACION.write_text(json.dumps(cal), encoding="utf-8")
    return True


# --pantalla: en vez de la cámara, lo que se ve en el monitor (para probar con videos de LSP).
# --pantalla=x,y,ancho,alto: solo esa zona (en píxeles), por ejemplo el reproductor de video.
PANTALLA = None


class Pantalla:
    """El monitor como si fuera una cámara: cada lectura es una captura de pantalla (~50 ms en 1920x1080)."""

    def __init__(self, cv2, zona=None):
        from PIL import ImageGrab
        self.cv2, self.grab = cv2, ImageGrab.grab
        self.caja = (zona[0], zona[1], zona[0] + zona[2], zona[1] + zona[3]) if zona else None

    def read(self):
        return True, self.cv2.cvtColor(np.asarray(self.grab(bbox=self.caja)), self.cv2.COLOR_RGB2BGR)


def abrir_camara(cv2):
    import glob
    if PANTALLA is not None:
        print("[ok] usando el monitor como cámara" + (f" (zona {PANTALLA})" if PANTALLA else ""))
        return Pantalla(cv2, PANTALLA or None)
    # En el UNO Q /dev/video0 y video1 son el códec de video (Venus), no cámaras: se prueba cuál da imagen.
    # En Windows: la cámara 0 es la de la laptop; CAMARA=1 elige otra (la USB de la base). Si esa no está, la 0.
    for disp in sorted(glob.glob("/dev/video*")) or dict.fromkeys([int(os.environ.get("CAMARA", "0")), 0]):
        cam = cv2.VideoCapture(disp)
        cam.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cam.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        if cam.read()[0]:
            print(f"[ok] cámara {disp}")
            return cam
        cam.release()
    raise RuntimeError("no hay cámara USB que dé imagen (revisa ls /dev/video*)")


def detector_cara(cv2):
    """cara(cuadro BGR) -> (centro x, centro y, ancho) en píxeles de la cara más grande, o None."""
    import mediapipe as mp

    if hasattr(mp, "solutions"):  # mediapipe 0.10 (la placa)
        caras = mp.solutions.face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)

        def cara(cuadro):
            h, w = cuadro.shape[:2]
            r = caras.process(cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB))
            cajas = [d.location_data.relative_bounding_box for d in (r.detections or [])]
            if not cajas:
                return None
            b = max(cajas, key=lambda b: b.width)
            return ((b.xmin + b.width / 2) * w, (b.ymin + b.height / 2) * h, b.width * w)
        return cara

    from mediapipe.tasks.python import BaseOptions, vision  # mediapipe 1.x (la PC)
    if not MODELO_CARA.exists():
        print("[..] bajando el modelo de caras (0.2 MB)")
        urllib.request.urlretrieve(URL_MODELO_CARA, MODELO_CARA)
    caras = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=str(MODELO_CARA)), running_mode=vision.RunningMode.VIDEO,
        min_detection_confidence=0.5))

    def cara(cuadro):
        imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB))
        r = caras.detect_for_video(imagen, time.monotonic_ns() // 1_000_000)
        if not r.detections:
            return None
        b = max((d.bounding_box for d in r.detections), key=lambda b: b.width)
        return (b.origin_x + b.width / 2, b.origin_y + b.height / 2, b.width)
    return cara


def posicion(muneca, cara, ancho, alto):
    """Muñeca (0..1 en la imagen) respecto de la cara, en décimas del ancho de la cara."""
    if cara is None:  # shortcut: sin cara a la vista se supone una cara centrada arriba; la posición vale poco ahí
        cara = (ancho / 2, alto / 3, ancho / 5)
    cx, cy, cw = cara
    return [10 * (muneca[0] * ancho - cx) / cw, 10 * (muneca[1] * alto - cy) / cw]


def detector_manos(cv2, fotos=False):
    """detectar(cuadro BGR) -> [(mano "D"/"I", 21 puntos en metros, 21 puntos en la imagen 0..1)],
    con la API del mediapipe instalado. fotos=True: cada imagen es independiente (sin seguir la mano)."""
    import mediapipe as mp

    if hasattr(mp, "solutions"):  # mediapipe 0.10 (la placa)
        # Modelo liviano: en la placa ~160 ms por cuadro, contra ~320 ms del normal (y del HandLandmarker nuevo).
        manos = mp.solutions.hands.Hands(static_image_mode=fotos, max_num_hands=2, model_complexity=0,
                                         min_detection_confidence=0.4, min_tracking_confidence=0.15)

        def detectar(cuadro):
            r = manos.process(cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB))
            # Esta API supone imagen espejada (selfie): sin espejar, "Left" es la mano derecha de quien firma.
            return [("D" if lado.classification[0].label == "Left" else "I", [(q.x, q.y, q.z) for q in p.landmark],
                     [(q.x, q.y) for q in im.landmark])
                    for lado, p, im in zip(r.multi_handedness or [], r.multi_hand_world_landmarks or [],
                                           r.multi_hand_landmarks or [])]
        return detectar

    from mediapipe.tasks.python import BaseOptions, vision  # mediapipe 1.x (la PC)
    if not MODELO_MANOS.exists():
        print("[..] bajando el modelo de manos (8 MB)")
        urllib.request.urlretrieve(URL_MODELO_MANOS, MODELO_MANOS)
    manos = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODELO_MANOS)), num_hands=2,
        # Encontrarla exige 0.4; ya encontrada se la sigue hasta 0.15: con los dedos apuntando a la cámara (la Ñ)
        # la mano se ve escorzada y antes se perdía. Las manos dobles las descarta el Seguidor.
        min_hand_detection_confidence=0.4, min_hand_presence_confidence=0.15, min_tracking_confidence=0.15,
        running_mode=vision.RunningMode.IMAGE if fotos else vision.RunningMode.VIDEO))

    def detectar(cuadro):
        imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(cuadro, cv2.COLOR_BGR2RGB))
        r = manos.detect(imagen) if fotos else manos.detect_for_video(imagen, time.monotonic_ns() // 1_000_000)
        # Esta API ya nombra la mano de quien firma.
        return [("D" if lado[0].category_name == "Right" else "I", [(q.x, q.y, q.z) for q in p], [(q.x, q.y) for q in im])
                for lado, p, im in zip(r.handedness, r.hand_world_landmarks, r.hand_landmarks)]
    return detectar


class Seguidor:
    """MediaPipe a veces cambia "derecha"/"izquierda" de un cuadro a otro o ve la misma mano dos veces.
    Sigue cada mano por dónde está en la imagen y decide su lado por mayoría de los últimos cuadros."""

    def __init__(self):
        self.pistas = []  # [x, y de la muñeca en la imagen, t, voto]; voto > 0: derecha

    def asignar(self, manos, t):
        self.pistas = [p for p in self.pistas if t - p[2] < 0.5]
        unicas = []
        for m in manos:  # dos detecciones con la muñeca casi en el mismo lugar son la misma mano
            if all(np.hypot(m[2][0][0] - u[2][0][0], m[2][0][1] - u[2][0][1]) > 0.05 for u in unicas):
                unicas.append(m)
        usadas, votos = set(), []
        for lado, mundo, imagen in unicas[:2]:
            x, y = imagen[0]
            d, i = min(((np.hypot(x - p[0], y - p[1]), i) for i, p in enumerate(self.pistas) if i not in usadas),
                       default=(1.0, None))
            if i is None or d > 0.2:  # mano nueva (o se movió muy rápido)
                self.pistas.append([x, y, t, 0.0])
                i = len(self.pistas) - 1
            usadas.add(i)
            p = self.pistas[i]
            p[0], p[1], p[2] = x, y, t
            p[3] = 0.7 * p[3] + 0.3 * (1 if lado == "D" else -1)  # un cuadro con la etiqueta cambiada no alcanza
            votos.append([p[3], mundo, imagen])
        if len(votos) == 2 and (votos[0][0] > 0) == (votos[1][0] > 0):  # dos manos votando el mismo lado
            votos.sort(key=lambda v: v[0])
            votos[0][0], votos[1][0] = -1.0, 1.0
        return [("D" if v > 0 else "I", mundo, imagen) for v, mundo, imagen in votos]


def manos_arriba(manos, cara, alto):
    """Las dos muñecas a la altura de la cara o más arriba (como un mimo): así se elige a la persona sorda."""
    if cara is None or len(manos) < 2:
        return False
    return all(m[2][0][1] * alto < cara[1] + 0.5 * cara[2] for m in manos)


def linea_cara(cara, ancho, arriba):
    """'C:x,w,arriba': x de -1 (izquierda de la imagen) a 1, w = ancho de la cara / ancho de la imagen. 'C:-' sin cara."""
    if cara is None:
        return "C:-\n"
    return f"C:{2 * cara[0] / ancho - 1:.3f},{cara[2] / ancho:.3f},{int(arriba)}\n"


def leer_linea_cara(linea):
    """'C:...' -> (x, w, arriba) o (None, 0, False) sin cara; None si viene mal."""
    if linea.strip() == "C:-":
        return None, 0.0, False
    try:
        x, w, a = linea.strip()[2:].split(",")
        return float(x), float(w), a == "1"
    except ValueError:
        return None


def mirar_camara(publicar, ver=None, al_ver_cara=None):
    """Por cada mano que ve la cámara llama publicar(mano, doblado, roll, pitch, giro, dist, vel); ver(cuadro, manos) si se pide.
    al_ver_cara(linea 'C:...') una vez por cuadro: la base giratoria busca y sigue a la persona con eso."""
    import cv2

    detectar = detector_manos(cv2)
    cara_de = detector_cara(cv2)
    cara = None
    seguidor = Seguidor()
    cam = abrir_camara(cv2)
    ejes, muneca, cuadros, t_fps = {}, {}, 0, time.monotonic()
    while True:
        ok, cuadro = cam.read()
        if not ok:
            raise RuntimeError("la cámara dejó de dar imagen")
        t = time.monotonic()
        manos = seguidor.asignar(detectar(cuadro), t)
        cara_ahora = cara_de(cuadro)
        cara = cara_ahora or cara  # si se pierde un cuadro, la última cara vista
        alto, ancho = cuadro.shape[:2]
        if al_ver_cara:
            al_ver_cara(linea_cara(cara_ahora, ancho, manos_arriba(manos, cara_ahora, alto)))
        if ver:
            ver(cuadro, manos)
        for mano, puntos, en_imagen in manos:
            doblado, roll, pitch, adelante, normal, dist = pose_mano(puntos, mano == "I")
            vel = 0.0  # traslado de la muñeca en la imagen, suavizado
            if mano in muneca and 0 < t - muneca[mano][2] < 0.5:
                x0, y0, t0, v0 = muneca[mano]
                vel = 0.5 * v0 + 0.5 * float(np.hypot(en_imagen[0][0] - x0, en_imagen[0][1] - y0)) / (t - t0)
            muneca[mano] = (en_imagen[0][0], en_imagen[0][1], t, vel)
            giro = 0.0
            if mano in ejes and 0 < t - ejes[mano][2] < 0.5:  # grados/s
                # La orientación que da la cámara tiembla (con la mano quieta saltaba a 300-500°/s):
                # se suavizan los ejes y la velocidad, y se pone un tope.
                adelante = 0.5 * ejes[mano][0] + 0.5 * adelante
                normal = 0.5 * ejes[mano][1] + 0.5 * normal
                crudo = max(_angulo(ejes[mano][0], adelante), _angulo(ejes[mano][1], normal)) / (t - ejes[mano][2])
                giro = min(400.0, 0.5 * ejes[mano][3] + 0.5 * crudo)
            ejes[mano] = (adelante, normal, t, giro)
            publicar(mano, doblado, roll, pitch, giro, dist + posicion(en_imagen[0], cara, ancho, alto), vel)
        cuadros += 1
        if t - t_fps >= 30:
            print(f"[cámara] {cuadros / (t - t_fps):.1f} cuadros/s")
            cuadros, t_fps = 0, t


visto = {}  # mano -> cuándo la vio la cámara por última vez


velocidad = {}  # mano -> traslado en la imagen (no es parte de lo que se aprende: solo frena las señas quietas)


def recibir_mano(mano, doblado, roll, pitch, giro, dist, vel=0.0):
    angulos[mano], visto[mano], velocidad[mano] = list(doblado), time.monotonic(), vel
    ultimo[mano] = flexion(doblado, cal[mano]) + [roll, pitch, giro] + list(dist)
    vistas.add(mano)


def olvidar_manos():
    for mano in list(vistas):  # mano fuera de cuadro
        if time.monotonic() - visto[mano] > 0.5:  # aguanta cortes cortos con los últimos valores
            vistas.discard(mano)
            angulos.pop(mano, None)
            velocidad.pop(mano, None)
            ultimo[mano] = [0.0] * TAM


def linea_mano(mano, doblado, roll, pitch, giro, dist, vel=0.0):
    return f"M:{mano}:" + ",".join(f"{x:.1f}" for x in [*doblado, roll, pitch, giro, *dist]) + f",{vel:.2f}\n"


def leer_linea_mano(linea):
    """'M:D:d1,..,d5,roll,pitch,giro,pinza,abre[,vel]' -> argumentos de recibir_mano, o None si viene mal."""
    partes = linea.strip().split(":")
    if len(partes) != 3 or partes[0] != "M" or partes[1] not in MANOS:
        return None
    try:
        v = [float(x) for x in partes[2].split(",")]
    except ValueError:
        return None
    if len(v) not in (TAM, TAM + 1) or not all(np.isfinite(v)):  # sin vel: una PC con el programa anterior
        return None
    return partes[1], v[:5], v[5], v[6], v[7], v[8:TAM], (v[TAM] if len(v) > TAM else 0.0)


def recibir_de_pc():
    """Escucha a la PC (cerebro.py camara-pc), que manda las manos que ve su cámara."""
    # Solo 127.0.0.1: llega por el cable con adb forward. shortcut: por Wi-Fi habría que abrirlo y ponerle clave.
    with socket.create_server(("127.0.0.1", PUERTO_CAMARA)) as srv:
        while True:
            con, _ = srv.accept()
            print("[ok] cámara de la PC conectada")
            with con, con.makefile(encoding="utf-8", errors="ignore") as f:
                for linea in f:
                    if linea.startswith("C:"):
                        if (c := leer_linea_cara(linea)) is not None:
                            base.ver(*c)
                    elif m := leer_linea_mano(linea):
                        recibir_mano(*m)
            print("[aviso] cámara de la PC desconectada")


def hilo_camara(modo):
    try:
        if modo == "pc":
            recibir_de_pc()
        elif modo == "solo":  # todo en la laptop: la página muestra la cámara igual que con camara-pc
            import cv2
            video = ThreadingHTTPServer(("127.0.0.1", PUERTO_VIDEO), Video)
            threading.Thread(target=video.serve_forever, daemon=True).start()
            mirar_camara(recibir_mano, lambda c, m: dibujar(cv2, c, m))
        else:
            mirar_camara(recibir_mano, al_ver_cara=lambda linea: base.ver(*leer_linea_cara(linea)))
    except Exception as e:
        print("[error] cámara:", e)
        os._exit(1)  # systemd vuelve a arrancar el cerebro (Restart=always)


def importar_fotos(carpeta):
    """carpeta/<letra>/*.jpg (como el dataset de la UPC) -> filas para datos_camara.csv.
    Cada foto es una seña quieta: se repite VENTANA veces con un poco de temblor, como al sostenerla ~0.5 s.
    Se usa la calibración por defecto: con la de cada persona, sus propias grabaciones mandan."""
    import cv2

    detectar = detector_manos(cv2, fotos=True)
    rng = np.random.default_rng(0)
    filas, vistas_ok, total = [], 0, 0
    for dir_letra in sorted(p for p in Path(carpeta).iterdir() if p.is_dir()):
        letra = dir_letra.name.upper()
        for n, foto in enumerate(sorted(dir_letra.glob("*.jpg"))):
            total += 1
            img = cv2.imread(str(foto))
            if img is None:
                continue
            # Fotos chicas con la mano pegada al borde: con margen y más grandes MediaPipe las ve mejor.
            img = cv2.resize(cv2.copyMakeBorder(img, 100, 100, 100, 100, cv2.BORDER_CONSTANT), (640, 640))
            manos = detectar(img)
            if not manos:
                continue
            vistas_ok += 1
            mano, puntos, _ = manos[0]
            doblado, roll, pitch, _, _, dist = pose_mano(puntos, mano == "I")
            quieta = flexion(doblado, {"CAL_OPEN": [30.0] + [15.0] * 4, "CAL_FIST": [110.0] + [230.0] * 4}) + [roll, pitch]
            for _ in range(VENTANA):
                lec = [float(np.clip(x + rng.normal(0, 1.5), 0, 100)) for x in quieta[:5]]
                lec += [quieta[5] + rng.normal(0, 1.5), quieta[6] + rng.normal(0, 1.5), abs(rng.normal(0, 5))]
                lec += [max(0.0, d + rng.normal(0, 1.5)) for d in dist] + [0.0, 0.0]  # sin cara en la foto
                vacia = [0.0] * TAM
                filas.append([letra, f"foto-{letra}-{n}", 0] + [round(x, 1) for x in (lec + vacia if mano == "D" else vacia + lec)])
    print(f"[ok] {vistas_ok} de {total} fotos con una mano reconocible")
    return filas


HUESOS = [(5, 9), (9, 13), (13, 17), (0, 17)] + [(a, b) for d in DEDOS for a, b in zip((0, *d), d)]
foto = {"jpg": None}  # último cuadro con las manos dibujadas, para la página


def dibujar(cv2, cuadro, manos):
    h, w = cuadro.shape[:2]
    colores = {"D": (102, 209, 102), "I": (60, 160, 255)}  # BGR: verde la derecha, naranja la izquierda
    for mano, _, puntos in manos:
        xy = [(int(x * w), int(y * h)) for x, y in puntos]
        for a, b in HUESOS:
            cv2.line(cuadro, xy[a], xy[b], colores[mano], 2)
        for p in xy:
            cv2.circle(cuadro, p, 4, colores[mano], -1)
    cuadro = cv2.flip(cuadro, 1)  # como un espejo: más fácil de seguir. El texto va después para que no salga al revés.
    for mano, _, puntos in manos:
        x, y = puntos[0]
        cv2.putText(cuadro, "DERECHA" if mano == "D" else "IZQUIERDA", (int((1 - x) * w) - 50, int(y * h) + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, colores[mano], 2)
    foto["jpg"] = cv2.imencode(".jpg", cuadro, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()


class Video(BaseHTTPRequestHandler):
    """La cámara como MJPEG: la página de entrenamiento la muestra con <img>."""

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=cuadro")
        self.end_headers()
        enviado = None
        try:
            while True:
                if (jpg := foto["jpg"]) is not enviado:
                    self.wfile.write(b"--cuadro\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n%s\r\n"
                                     % (len(jpg), jpg))
                    enviado = jpg
                time.sleep(0.03)
        except OSError:  # se cerró la página
            pass


def camara_pc(destino):
    """Corre en la PC: mira con la cámara de la PC, manda cada mano a la placa y abre la página con la cámara."""
    import cv2
    import webbrowser

    host, _, puerto = destino.partition(":")
    if host in ("127.0.0.1", "localhost"):  # por el cable: la placa recibe las manos y la PC ve la página
        for p in (PUERTO_CAMARA, PUERTO_WEB):
            try:
                subprocess.run(["adb", "forward", f"tcp:{p}", f"tcp:{p}"], check=True, capture_output=True)
            except (OSError, subprocess.CalledProcessError) as e:
                print(f"[aviso] adb forward {p} falló ({e}): ¿la placa está conectada por USB?")
    # Solo 127.0.0.1: la imagen de la cámara no sale de esta PC.
    video = ThreadingHTTPServer(("127.0.0.1", PUERTO_VIDEO), Video)
    threading.Thread(target=video.serve_forever, daemon=True).start()
    webbrowser.open(f"http://localhost:{PUERTO_WEB}")
    while True:
        try:
            with socket.create_connection((host, int(puerto or PUERTO_CAMARA)), timeout=5) as s:
                print(f"[ok] mandando las manos a {destino}")
                mirar_camara(lambda *m: s.sendall(linea_mano(*m).encode()), lambda c, m: dibujar(cv2, c, m),
                             lambda linea: s.sendall(linea.encode()))
        except OSError as e:
            print(f"[aviso] sin conexión con la placa ({e}). ¿Corriste adb forward tcp:{PUERTO_CAMARA} tcp:{PUERTO_CAMARA}?")
            time.sleep(2)


def cargar_en_placa(archivo):
    """En la PC con la placa por USB: suma a la placa las tomas de un datos_camara.csv grabado con solo-pc.
    Solo agrega tomas que la placa no tiene (por nombre e id): no pisa lo que se grabó en la placa mientras tanto.
    shortcut: las señas borradas en la otra laptop no se borran en la placa; se borran desde su página."""
    import tempfile

    remoto = "/home/arduino/cerebro/datos_camara.csv"
    with open(archivo, encoding="utf-8") as f:
        nuevas = [fila for fila in csv.reader(f) if len(fila) == 3 + 2 * TAM]
    copia = Path(tempfile.mkdtemp()) / "placa.csv"
    subprocess.run(["adb", "pull", remoto, str(copia)], check=True, capture_output=True)
    with copia.open(encoding="utf-8") as f:
        tomas = {(fila[0], fila[1]) for fila in csv.reader(f) if len(fila) >= 2}
    agregar = [fila for fila in nuevas if (fila[0], fila[1]) not in tomas]
    if not agregar:
        return print("[ok] la placa ya tiene todas esas señas")
    with copia.open("a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(agregar)
    adb = ["adb", "shell"]
    subprocess.run(adb + [f"cp {remoto} {remoto}.antes_de_cargar"], check=True)  # respaldo en la placa
    subprocess.run(["adb", "push", str(copia), remoto], check=True, capture_output=True)
    subprocess.run(adb + ["XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart cerebro"], check=True)
    print(f"[ok] {len({(f[0], f[1]) for f in agregar})} tomas nuevas cargadas: "
          + ", ".join(sorted({f[0] for f in agregar})) + ". El cerebro se reinició.")


# Lo que comparten el bucle de reconocimiento y la página web.
estado = {"detector": None, "senas": {}, "ahora": None, "ultima": None, "frase": None,
          "emitidas": deque(maxlen=20), "total": 0}  # últimas señas reconocidas, para mostrarlas bajo la cámara
grabando = threading.Lock()


def leer_datos():
    if not DATOS.exists():
        return []
    with DATOS.open(encoding="utf-8") as f:
        return [fila for fila in csv.reader(f) if len(fila) == 3 + 2 * TAM]  # otro largo: formato viejo


reentrenando = threading.Lock()


def reentrenar():
    with reentrenando:  # de a uno: el último en terminar siempre leyó los datos más nuevos
        filas = leer_datos()  # cada fila: nombre, id de toma, movimiento (0/1), 16 lecturas
        tomas = Counter(nombre for nombre, _ in {(f[0], f[1]) for f in filas})
        estado["senas"] = dict(tomas)
        estado["detector"] = Detector(entrenar(filas)) if filas else None


def reentrenar_de_fondo():
    """Con las fotos importadas tarda ~4 s en la placa: la página no espera."""
    threading.Thread(target=reentrenar, daemon=True).start()


def grabar_toma(nombre, movimiento):
    """Graba ~2 s de la seña, solo los cuadros en que la cámara ve alguna mano. False si casi no la vio."""
    toma, filas, fin = str(time.time_ns()), [], time.monotonic() + 4
    while len(filas) < MUESTRAS_TOMA and time.monotonic() < fin:
        if vistas:  # sin manos a la vista se guardaban ceros, y esa seña terminaba tragándose todo
            filas.append([nombre, toma, int(movimiento)] + vector())
        time.sleep(0.04)
    if len(filas) < MUESTRAS_TOMA // 2:
        return False
    with DATOS.open("a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(filas)
    reentrenar_de_fondo()  # en unos segundos la seña ya se puede probar
    return True


def borrar_sena(nombre):
    filas = [f for f in leer_datos() if f[0] != nombre]
    with DATOS.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(filas)
    reentrenar_de_fondo()


class Web(BaseHTTPRequestHandler):
    # shortcut: sin contraseña; cualquiera en el mismo Wi-Fi puede grabar o borrar señas.
    def log_message(self, *args):
        pass

    def responder(self, cuerpo, tipo="application/json", codigo=200, cors=False):
        datos = cuerpo.encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        if cors:  # solo lectura: la app «Aprende LSP» (Electron) lee el estado desde otro origen
            self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(datos)

    def desde_la_laptop(self):
        """La laptop llega por el cable (adb forward) como 127.0.0.1; los celulares, por el Wi-Fi."""
        return self.client_address[0] == "127.0.0.1"

    def do_GET(self):
        if self.path == "/ver" or (self.path == "/" and not self.desde_la_laptop()):
            return self.responder(PAGINA_VISITAS.read_text(encoding="utf-8"), "text/html; charset=utf-8")
        if self.path == "/":
            return self.responder(PAGINA.read_text(encoding="utf-8"), "text/html; charset=utf-8")
        if self.path == "/estado":
            return self.responder(json.dumps({
                "sensores": ultimo, "senas": estado["senas"], "grabando": grabando.locked(),
                "ahora": estado["ahora"], "ultima": estado["ultima"], "frase": estado["frase"],
                "emitidas": list(estado["emitidas"]), "total": estado["total"],
                "vistas": sorted(vistas), "base": {"modo": base.modo, "angulo": base.angulo},
            }), cors=True)
        if self.path.startswith("/abecedario/"):  # dibujos de las letras, para la página
            letra = unquote(self.path[len("/abecedario/"):]).removesuffix(".png")
            archivo = ABECEDARIO / f"{letra}.png"
            if len(letra) == 1 and letra in "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ" and archivo.exists():
                datos = archivo.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(datos)))
                self.send_header("Cache-Control", "max-age=86400")
                self.end_headers()
                return self.wfile.write(datos)
        if self.path == "/frases":
            with frases_lock:
                return self.responder(json.dumps(leer_frases(), ensure_ascii=False))
        if self.path == "/datos.csv":  # copia de seguridad de todas las señas
            datos = DATOS.read_bytes() if DATOS.exists() else b""
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="senas_camara.csv"')
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            return self.wfile.write(datos)
        self.responder('{"error":"no existe"}', codigo=404)

    def do_POST(self):
        if not self.desde_la_laptop():  # en la feria cualquiera entra al Wi-Fi: grabar, borrar y calibrar, solo la laptop
            return self.responder('{"error":"solo desde la laptop del proyecto"}', codigo=403)
        url = urlparse(self.path)
        consulta = parse_qs(url.query)
        if url.path == "/calibrar":
            paso = consulta.get("paso", [""])[0]
            mano = consulta.get("mano", [""])[0]
            if paso not in ("CAL_OPEN", "CAL_FIST") or mano not in MANOS:
                return self.responder('{"error":"paso o mano inválidos"}', codigo=400)
            if not calibrar_camara(mano, paso):  # tarda 2 s: la página espera la respuesta
                lado = "derecha" if mano == "D" else "izquierda"
                return self.responder(json.dumps({"error": f"la cámara no ve tu mano {lado}"}, ensure_ascii=False),
                                      codigo=409)
            return self.responder('{"ok": true}')
        if url.path == "/frase":  # corrige o agrega la frase de unas glosas; texto vacío la borra
            clave = " ".join(consulta.get("clave", [""])[0].upper().split())
            texto = " ".join(consulta.get("texto", [""])[0].split())
            if not clave or len(clave) > 120 or "|" in texto or len(texto) > 120:
                return self.responder('{"error":"glosas o frase inválidas (máx. 120, sin |)"}', codigo=400)
            with frases_lock:
                guardadas = leer_frases()
                if texto:
                    guardadas[clave] = texto
                else:
                    guardadas.pop(clave, None)
                FRASES.write_text(json.dumps(guardadas, ensure_ascii=False, indent=1), encoding="utf-8")
            return self.responder(json.dumps(guardadas, ensure_ascii=False))
        nombre = " ".join(consulta.get("nombre", [""])[0].upper().split())
        # "|" separa nombre y confianza en el protocolo S:nombre|conf
        if not nombre or len(nombre) > 30 or "|" in nombre:
            return self.responder('{"error":"nombre inválido (1 a 30 caracteres, sin |)"}', codigo=400)
        if url.path == "/grabar":
            if not grabando.acquire(blocking=False):
                return self.responder('{"error":"ya se está grabando"}', codigo=409)
            try:
                ok = grabar_toma(nombre, consulta.get("mov", ["0"])[0] == "1")
            finally:
                grabando.release()
            if not ok:
                return self.responder(json.dumps({"error": "la cámara casi no vio tu mano: ponla frente a la cámara "
                                                           "(para REPOSO también, con las manos sueltas)"},
                                                 ensure_ascii=False), codigo=409)
        elif url.path == "/borrar":
            borrar_sena(nombre)
        else:
            return self.responder('{"error":"no existe"}', codigo=404)
        self.responder(json.dumps({"ok": True, "senas": estado["senas"]}))


def rasgos(ventana):
    """Resume ~0.6 s de lecturas: cómo está la mano (promedio), cuánto se movió (dispersión) y hacia dónde (cambio)."""
    v = np.asarray(ventana, dtype=float)
    return np.concatenate([v.mean(axis=0), v.std(axis=0), v[-1] - v[0]])


def espejo(lectura):
    """La misma pose hecha con la otra mano: se cambian de lugar D e I; el roll y la posición de lado cambian de
    signo (pose_mano ya deja la palma de frente en 0 para las dos; inclinación, giro y altura no cambian)."""
    d, i = list(lectura[:TAM]), list(lectura[TAM:])
    d[5], i[5] = -d[5], -i[5]
    d[10], i[10] = -d[10], -i[10]
    return i + d


def ventanas_de_entrenamiento(filas):
    """Cada toma se aprende también en espejo: lo grabado con la derecha se reconoce con la izquierda."""
    tomas = {}
    for f in filas:
        tomas.setdefault((f[0], f[1]), (f[2] == "1", []))[1].append([float(x) for x in f[3:]])
    X, y, lado = [], [], []
    for (nombre, _), (movimiento, grabadas) in tomas.items():
        for k, lecturas in enumerate([grabadas, [espejo(lec) for lec in grabadas]]):
            vs = [rasgos(lecturas[i:i + VENTANA]) for i in range(len(lecturas) - VENTANA + 1)]
            if movimiento:  # solo el tramo en que la mano se movió, no la pausa de antes y después
                n = len(lecturas[0])
                energia = [r[n:2 * n].sum() for r in vs]
                vs = [r for r, e in zip(vs, energia) if e >= 0.5 * max(energia)]
            X += vs
            y += [nombre] * len(vs)
            lado += [k] * len(vs)
    return np.array(X), np.array(y), np.array(lado)


def entrenar(filas):
    X, y, lado = ventanas_de_entrenamiento(filas)
    con_movimiento = {f[0] for f in filas if str(f[2]) == "1"}
    # En unidades reales (% de flexión, grados, grados/s), sin estandarizar: estandarizado,
    # el ruido de lo que casi no cambia (el movimiento de una seña quieta) pesaría como un dedo doblado.
    modelo = KNeighborsClassifier(n_neighbors=min(5, len(X))).fit(X, y)
    # k-NN siempre elige la seña más parecida; para que una pose rara no escriba nada,
    # cada seña tiene un radio: 2x lo que se alejaron sus propias tomas, +10 de margen.
    # Uno por lado (grabada y espejo): un solo centro quedaría a mitad de camino entre las dos manos.
    modelo.zonas = {c: [] for c in modelo.classes_}
    for c in modelo.classes_:
        for k in (0, 1):
            puntos = X[(y == c) & (lado == k)]
            centro = puntos.mean(axis=0)
            radio = 2 * np.percentile(np.linalg.norm(puntos - centro, axis=1), 95) + 10
            if c not in con_movimiento:  # las que se mueven varían mucho por naturaleza: sin tope
                radio = min(RADIO_MAX, radio)
            modelo.zonas[c].append((centro, radio))
    modelo.con_movimiento = con_movimiento
    return modelo


class Detector:
    """Emite una seña cuando se sostiene SOSTENER lecturas; para repetirla hay que cambiar de pose."""

    def __init__(self, modelo):
        self.modelo, self.cand, self.n, self.emitida = modelo, None, 0, False

    def paso(self, x, moviendo=False):
        p = self.modelo.predict_proba([x])[0]
        i = int(p.argmax())
        nombre = self.modelo.classes_[i] if p[i] >= CONF_MIN else None
        if nombre is not None:
            x = np.asarray(x, dtype=float)
            if all(np.linalg.norm(x - centro) > radio for centro, radio in self.modelo.zonas[nombre]):
                nombre = None  # pose que no se parece a nada grabado
            elif nombre not in self.modelo.con_movimiento and (moviendo or max(x[7], x[7 + TAM]) > GIRO_QUIETA):
                nombre = None  # la mano va girando o trasladándose: es el camino hacia otra seña, no una seña quieta
        if nombre != self.cand:
            self.cand, self.n, self.emitida = nombre, 0, False
        self.n += 1
        if nombre and nombre not in NO_SON_SENAS and not self.emitida and self.n >= SOSTENER:
            self.emitida = True
            return nombre, int(p[i] * 100)
        return None


def armar_frase(glosas):
    """Qwen tarda ~5 s en esta placa: solo se usa cuando hay que juntar varias palabras."""
    partes, deletreando = [], False
    for g in glosas:  # las letras seguidas forman una palabra: YO J U A N -> YO JUAN
        if g == CORTE:  # letras separadas por una pausa: la siguiente empieza otra palabra
            deletreando = False
            continue
        if len(g) == 1 and deletreando:
            partes[-1] += g
        else:
            partes.append(g)
        deletreando = len(g) == 1
    if len(partes) == 1:  # una sola seña o palabra: al instante
        return partes[0]
    clave = " ".join(partes)
    with frases_lock:  # lo ya armado una vez sale al instante (ensayar la presentación la deja rápida)
        guardadas = leer_frases()
    if clave not in guardadas:
        frase = qwen(partes)
        with frases_lock:
            guardadas = leer_frases()
            guardadas[clave] = frase
            FRASES.write_text(json.dumps(guardadas, ensure_ascii=False, indent=1), encoding="utf-8")
    return guardadas[clave]


frases_lock = threading.Lock()


def leer_frases():
    return json.loads(FRASES.read_text(encoding="utf-8")) if FRASES.exists() else {}


def qwen(glosas):
    pedido = json.dumps({
        "model": MODELO_QWEN,
        "stream": False,
        "keep_alive": -1,  # deja el modelo cargado: ahorra ~12 s por frase
        "options": {"num_ctx": 512, "num_predict": 24},  # una frase corta; no deja que se alargue
        # El inicio fijo del prompt queda en caché de Ollama: los ejemplos casi no suman tiempo.
        "prompt": "Convierte glosas de lengua de señas en una frase natural en español. "
                  "Responde solo la frase, sin agregar nada que no esté en las glosas.\n"
                  "YO IR CASA MAÑANA -> Mañana voy a mi casa.\n"
                  "HOLA TU NOMBRE QUÉ -> Hola, ¿cómo te llamas?\n"
                  "YO AGUA QUERER -> Quiero agua.\n"
                  "YO MARIA -> Soy María.\n"
                  + " ".join(glosas) + " ->",
    }).encode()
    with urllib.request.urlopen("http://localhost:11434/api/generate", pedido, timeout=90) as r:
        frase = json.loads(r.read())["response"]
    return " ".join(frase.replace("|", " ").split())


ROUTER = "/var/run/arduino-router.sock"  # arduino-router: puente Linux <-> microcontrolador (STM32)


def empaquetar(x):
    """msgpack mínimo (arreglos chicos, enteros 0..65535, textos cortos): alcanza para pedirle cosas al sketch."""
    if isinstance(x, list):
        assert len(x) < 16
        return bytes([0x90 | len(x)]) + b"".join(empaquetar(e) for e in x)
    if isinstance(x, str):
        b = x.encode()
        assert len(b) < 32
        return bytes([0xA0 | len(b)]) + b
    assert 0 <= x < 65536
    if x < 128:
        return bytes([x])
    return bytes([0xCC, x]) if x < 256 else bytes([0xCD, x >> 8, x & 0xFF])


def girar_base(grados):
    """Pide al sketch (Bridge.provide("girar")) que mueva el servo de la base; él lo hace suave."""
    try:
        with socket.socket(socket.AF_UNIX) as s:
            s.settimeout(2)
            s.connect(ROUTER)
            s.sendall(empaquetar([0, 1, "girar", [grados]]))  # [request, id, método, argumentos]
            s.recv(64)  # respuesta [1, id, error, resultado]; solo se espera que llegue
        estado["giro"] = grados
    except OSError as e:
        print("[aviso] no se pudo girar la base:", e)


CAMPO_CAMARA = 60    # grados que abarca la cámara de borde a borde (webcam común: 55-70)
SENTIDO_BASE = 1     # si al seguir una cara la base se aleja en vez de centrarla, poner -1
PASO_BUSQUEDA = 20   # grados entre parada y parada al buscar
MIRAR_PARADA = 1.2   # s quieta en cada parada sin nadie (con la base moviéndose la imagen sale corrida)
MIRAR_CON_CARA = 3.0 # s quieta si hay alguien: tiempo para que levante las manos
MANOS_ARRIBA = 0.8   # s con las dos manos arriba para elegir a esa persona
SIN_CARA = 5.0       # s sin ver a la persona sorda para volver a buscar
MANUAL = 10.0        # s que se respeta un G:<grados> de la app (prueba de la base) antes de volver a buscar


class Base:
    """La cámara va sobre la base giratoria, encima del teléfono.
    BUSCAR: barre 0-180° de a pasos, parando para mirar. Quien levanta las dos manos (como un mimo) es la persona sorda.
    SORDO:  la sigue, manteniendo su cara al centro; es el único modo en que lo firmado va al teléfono.
    OYENTE: la app pide T:OYENTE mientras el oyente habla; con T:SORDO vuelve a la persona sorda para que lea."""

    def __init__(self, girar, reloj=time.monotonic):
        self.girar, self.reloj = girar, reloj
        self.modo, self.angulo, self.sentido = "BUSCAR", 90, 1
        self.sordo = self.oyente = None          # ángulos donde está cada uno
        self.cara, self.arriba_desde = None, None  # (x, w, t) de la última cara vista
        self.caras = {}                          # ángulo -> cuándo se vio una cara ahí (posibles oyentes)
        self.listo_en = self.visto_en = self.manual_hasta = self.oyente_desde = 0.0
        self.lock = threading.Lock()

    def ver(self, x, w, arriba):
        """Una vez por cuadro de la cámara (x de -1 a 1, None sin cara)."""
        with self.lock:
            t = self.reloj()
            if x is None:
                self.cara, self.arriba_desde = None, None
                return
            self.cara = (x, w, t)
            self.arriba_desde = (self.arriba_desde or t) if arriba else None

    def mover(self, a):
        a = int(np.clip(round(a), 0, 180))
        if a != self.angulo:
            # 8 ms por grado (base_servo.ino) y un poco más para que la imagen se asiente
            self.listo_en = self.reloj() + 0.008 * abs(a - self.angulo) + 0.35
            self.angulo = a
            self.girar(a)

    def desvio(self, cara):
        return SENTIDO_BASE * cara[0] * CAMPO_CAMARA / 2  # grados que hay que girar para centrarla

    def centrar(self, cara):
        d = self.desvio(cara)
        if abs(d) > 4:  # zona muerta: sin esto la base tiembla
            self.mover(self.angulo + float(np.clip(0.7 * d, -15, 15)))

    def paso(self):
        with self.lock:
            t = self.reloj()
            if t < self.manual_hasta or t < self.listo_en:
                return
            cara = self.cara if self.cara and t - self.cara[2] < 0.5 and self.cara[2] >= self.listo_en else None
            if self.modo == "BUSCAR":
                if cara and self.arriba_desde and t - self.arriba_desde >= MANOS_ARRIBA:
                    self.modo, self.visto_en = "SORDO", t
                    self.sordo = self.angulo + self.desvio(cara)
                    self.caras = {a: tc for a, tc in self.caras.items() if abs(a - self.sordo) > 30}
                    print(f"[base] persona sorda elegida en {self.sordo:.0f}°")
                    self.centrar(cara)
                    return
                if cara:
                    self.caras[round(self.angulo + self.desvio(cara))] = t
                if t - self.listo_en >= (MIRAR_CON_CARA if cara else MIRAR_PARADA):
                    if not 0 <= self.angulo + self.sentido * PASO_BUSQUEDA <= 180:
                        self.sentido = -self.sentido
                    self.mover(self.angulo + self.sentido * PASO_BUSQUEDA)
            elif self.modo == "SORDO":
                if cara:
                    self.visto_en = t
                    self.centrar(cara)
                    self.sordo = self.angulo
                elif t - self.visto_en > SIN_CARA:
                    print("[base] la persona sorda se fue: buscando")
                    self.modo, self.sordo = "BUSCAR", None
            elif self.modo == "OYENTE":
                if t - self.oyente_desde > 20:  # la app no avisó que terminó (¿se desconectó?)
                    self.modo, self.visto_en = "SORDO", t
                    self.mover(self.sordo)
                elif cara:
                    self.centrar(cara)
                    self.oyente = self.angulo

    def donde_oyente(self):
        """Donde ya se lo vio hablar; si no, la cara vista al buscar más lejos de la persona sorda; si no, 90° al lado."""
        if self.oyente is not None and abs(self.oyente - self.sordo) > 30:
            return self.oyente
        t = self.reloj()
        lejos = [a for a, tc in self.caras.items() if t - tc < 300 and abs(a - self.sordo) > 30]
        if lejos:
            return max(lejos, key=lambda a: abs(a - self.sordo))
        return self.sordo + 90 if self.sordo <= 90 else self.sordo - 90

    def pedir(self, orden):
        """Órdenes de la app: T:OYENTE, T:SORDO o G:<grados> (prueba manual)."""
        with self.lock:
            t = self.reloj()
            if orden.startswith("G:"):
                self.manual_hasta = t + MANUAL
                self.mover(int(orden[2:]))
            elif orden == "T:OYENTE" and self.modo == "SORDO":
                self.modo, self.oyente_desde = "OYENTE", t
                self.mover(self.donde_oyente())
            elif orden == "T:SORDO" and self.modo == "OYENTE":
                self.modo, self.visto_en = "SORDO", t
                self.mover(self.sordo)

    def mover_siempre(self):
        while True:
            self.paso()
            time.sleep(0.1)


base = Base(girar_base)


async def servidor_app():
    from bless import BlessServer, GATTAttributePermissions as A, GATTCharacteristicProperties as P

    srv = BlessServer(name=NOMBRE_APP)
    recibido = bytearray()

    def al_escribir(_caracteristica, valor, **_):  # la app escribe en RX: PING, G:<grados>, T:OYENTE y T:SORDO
        recibido.extend(valor)
        while b"\n" in recibido:
            linea, _, resto = bytes(recibido).partition(b"\n")
            recibido[:] = resto
            orden = linea.decode(errors="ignore").strip().upper()
            if orden == "PING":
                enviar(srv, "OK:PONG")
            elif (orden.startswith("G:") and orden[2:].isdigit()) or orden in ("T:OYENTE", "T:SORDO"):
                threading.Thread(target=base.pedir, args=(orden,), daemon=True).start()

    srv.write_request_func = al_escribir
    await srv.add_new_service(NUS)
    await srv.add_new_characteristic(NUS, NUS_TX, P.notify | P.read, None, A.readable)
    await srv.add_new_characteristic(NUS, NUS_RX, P.write | P.write_without_response, None, A.writeable)
    await srv.start()
    print(f"[ok] anunciando {NOMBRE_APP} para la app")
    return srv


def enviar(srv, linea):
    if srv is None:  # modo solo-pc
        print("->", linea)
        return
    datos = (linea + "\n").encode()
    tx = srv.get_characteristic(NUS_TX)
    for i in range(0, len(datos), 20):  # la app junta los trozos hasta el \n
        tx.value = datos[i:i + 20]
        srv.update_value(NUS, NUS_TX)
    print("->", linea)


async def anunciar_nombre():
    """Publica guante.local -> 10.42.0.1 por mDNS (como una impresora), sin permisos de administrador."""
    from dbus_next import BusType
    from dbus_next.aio import MessageBus

    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    avahi = "org.freedesktop.Avahi"
    servidor = bus.get_proxy_object(avahi, "/", await bus.introspect(avahi, "/")).get_interface(f"{avahi}.Server")
    ruta = await servidor.call_entry_group_new()
    grupo = bus.get_proxy_object(avahi, ruta, await bus.introspect(avahi, ruta)).get_interface(f"{avahi}.EntryGroup")
    # 16 = sin registro inverso: la IP ya tiene el nombre de la placa y chocarían
    await grupo.call_add_address(-1, -1, 16, "guante.local", "10.42.0.1")
    await grupo.call_commit()
    return bus  # el nombre vive mientras esta conexión siga abierta


async def vivo(con_qwen, camara):
    """camara: "pc" (la manda camara-pc), "local" (enchufada a la placa) o "solo" (todo en una laptop, sin placa)."""
    solo = camara == "solo"
    reentrenar()
    # Sin placa, la página queda solo para esta laptop.
    web = ThreadingHTTPServer(("127.0.0.1" if solo else "0.0.0.0", PUERTO_WEB), Web)
    threading.Thread(target=web.serve_forever, daemon=True).start()
    print(f"[ok] página de entrenamiento en el puerto {PUERTO_WEB}")
    srv = None  # sin placa no hay Bluetooth: lo reconocido solo se ve en la página
    if solo:
        import webbrowser
        webbrowser.open(f"http://127.0.0.1:{PUERTO_WEB}")
    else:
        try:
            estado["mdns"] = await anunciar_nombre()
            print(f"[ok] también en http://guante.local:{PUERTO_WEB}")
        except Exception as e:  # sin el nombre, la página sigue en http://10.42.0.1:8000
            print("[aviso] no se pudo anunciar guante.local:", e)
        srv = await servidor_app()
    if CALIBRACION.exists():
        cal.update(json.loads(CALIBRACION.read_text(encoding="utf-8")))
    threading.Thread(target=hilo_camara, args=(camara,), daemon=True).start()
    if not solo:
        threading.Thread(target=base.mover_siempre, daemon=True).start()
    tareas = []  # referencias vivas a las tareas de fondo
    if con_qwen:  # carga el modelo ahora (~30 s, en segundo plano) y no en la primera frase
        tareas.append(asyncio.create_task(asyncio.to_thread(qwen, ["HOLA", "AMIGO"])))  # no se guarda en FRASES
    glosas, t_ultima = [], time.monotonic()
    reciente = deque(maxlen=VENTANA)
    while True:
        olvidar_manos()
        if vistas:
            reciente.append(vector())
        detector = estado["detector"]  # la página lo cambia al grabar o borrar
        if not vistas:  # sin manos no hay seña (antes, "sin manos" podía caer dentro de una seña mal grabada)
            reciente.clear()
            if detector:
                detector.cand, detector.n, detector.emitida = None, 0, False
        moviendo = max(velocidad.values(), default=0.0) > VEL_QUIETA
        r = detector.paso(rasgos(reciente), moviendo) if detector and len(reciente) == VENTANA else None
        estado["ahora"] = str(detector.cand) if detector and detector.cand else None
        if r:
            estado["ultima"] = str(r[0])
            estado["emitidas"].append(str(r[0]))
            estado["total"] += 1
        # Mientras se graba, o si la base todavía no eligió a la persona sorda (o mira al oyente), nada va al teléfono.
        if r and not grabando.locked() and (solo or base.modo == "SORDO"):
            nombre, conf = r
            ahora = time.monotonic()
            if con_qwen:
                if glosas and len(nombre) == 1 and len(glosas[-1]) == 1 and ahora - t_ultima > PAUSA_PALABRA:
                    glosas.append(CORTE)  # pasó más de 2 s desde la letra anterior: empieza otra palabra
                glosas.append(nombre)
                print("  +", nombre, conf)
            else:
                enviar(srv, f"S:{nombre}|{conf}")
            t_ultima = ahora
        if glosas and time.monotonic() - t_ultima > PAUSA_FRASE:
            # en segundo plano: mientras Qwen piensa (~6 s) se sigue reconociendo lo que se firma
            tareas.append(asyncio.create_task(enviar_frase(srv, glosas)))
            glosas = []
        await asyncio.sleep(0.04)


async def enviar_frase(srv, glosas):
    try:
        frase = await asyncio.to_thread(armar_frase, glosas)
    except Exception as e:  # sin Qwen, manda las glosas tal cual para no perder lo firmado
        print("[aviso] Qwen falló:", e)
        frase = " ".join(glosas)
    estado["frase"] = frase
    enviar(srv, f"S:{frase}|100")


def prueba():
    rng = np.random.default_rng(0)
    REP, A, I = [5] * 5, [90] * 5, [90, 90, 90, 90, 5]

    def lectura(flex, roll=0.0, giro=0.0, dist=(60, 30, 4, 22)):
        return list(np.array(flex + [roll, 0, giro, *dist], dtype=float) + rng.normal(0, 2, TAM)) + [0.0] * TAM

    def jota():  # la J: forma de I que gira la muñeca 90°. Al grabarla uno espera con la I antes de mover.
        return ([lectura(I) for _ in range(30)]
                + [lectura(I, roll=90 * k / 11, giro=180) for k in range(12)]
                + [lectura(I, roll=90) for _ in range(8)])

    filas = []
    for t in range(4):
        for nombre, lecturas, mov in [("REPOSO", [lectura(REP) for _ in range(50)], 0),
                                      ("A", [lectura(A) for _ in range(50)], 0),
                                      ("I", [lectura(I) for _ in range(50)], 0),
                                      ("J", jota(), 1)]:
            filas += [[nombre, f"{nombre}{t}", str(mov)] + lec for lec in lecturas]
    det = Detector(entrenar(filas))

    def firmar(lecturas):
        reciente, salidas = deque(maxlen=VENTANA), []
        for lec in lecturas:
            reciente.append(lec)
            if len(reciente) == VENTANA and (r := det.paso(rasgos(reciente))):
                salidas.append(r[0])
        return salidas

    quietas = firmar([lectura(p) for p in [REP] * 25 + [A] * 25 + [REP] * 25 + [A] * 25 + [REP] * 25 + [I] * 25])
    assert quietas == ["A", "A", "I"], quietas
    movimiento = firmar([lectura(REP) for _ in range(25)] + jota()[28:] + [lectura(REP) for _ in range(25)])
    assert movimiento == ["J"], movimiento
    rara = firmar([lectura([5, 90, 5, 90, 5]) for _ in range(40)])
    assert rara == [], "una pose rara no debe escribir nada"
    # Grabada solo con la derecha, se reconoce con la izquierda.
    zurda = firmar([espejo(lectura(p)) for p in [REP] * 25 + [I] * 25 + [REP] * 25 + [A] * 25])
    assert zurda == ["I", "A"], zurda
    # Con la mano trasladándose (bajándola, por ejemplo) no se escribe una seña quieta.
    det = Detector(det.modelo)
    assert [r for x in [rasgos([lectura(A)] * VENTANA)] * 8 if (r := det.paso(x, moviendo=True))] == []

    # TRANSICION: pasar rápido de A a T (A con la muñeca girada) se parece a GIRO (el mismo giro, lento y a propósito)
    def girar(desde, hasta, cuadros, giro):
        return [lectura(A, roll=desde + (hasta - desde) * k / (cuadros - 1), giro=giro) for k in range(cuadros)]

    def paso_rapido():
        return [lectura(A) for _ in range(10)] + girar(0, 60, 4, 400) + [lectura(A, roll=60) for _ in range(10)]

    def con_transicion(incluir):
        filas2 = []
        for t in range(4):
            tomas = [("A", [lectura(A) for _ in range(50)], 0),
                     ("T", [lectura(A, roll=60) for _ in range(50)], 0),
                     ("GIRO", [lectura(A) for _ in range(15)] + girar(0, 60, 12, 120)
                      + [lectura(A, roll=60) for _ in range(23)], 1)]
            if incluir:  # se graba moviéndose libremente entre señas ya grabadas
                ida_vuelta = paso_rapido() + girar(60, 0, 4, 400) + [lectura(A) for _ in range(10)]
                tomas.append(("TRANSICION", ida_vuelta + ida_vuelta[:50 - len(ida_vuelta)], 0))
            for nombre, lecturas, mov in tomas:
                filas2 += [[nombre, f"{nombre}{t}", str(mov)] + lec for lec in lecturas]
        return Detector(entrenar(filas2))

    rapido = [lectura(A) for _ in range(25)] + girar(0, 60, 4, 400) + [lectura(A, roll=60) for _ in range(25)]
    lento = [lectura(REP) for _ in range(25)] + girar(0, 60, 12, 120) + [lectura(REP) for _ in range(25)]
    det = con_transicion(incluir=False)
    sin_trans = firmar(rapido)
    det = con_transicion(incluir=True)
    con_trans, giro_lento = firmar(rapido), firmar(lento)
    assert "GIRO" not in con_trans, con_trans
    assert giro_lento == ["GIRO"], giro_lento
    global qwen, FRASES
    import tempfile
    llamadas = []
    real, qwen = qwen, lambda g: llamadas.append(g) or "QWEN(" + " ".join(g) + ")"
    real_frases, FRASES = FRASES, Path(tempfile.mkdtemp()) / "frases.json"
    try:
        assert armar_frase(["BUENOS DIAS"]) == "BUENOS DIAS"
        assert armar_frase(list("HOLA")) == "HOLA"
        assert armar_frase(["YO", "J", "U", "A", "N"]) == "QWEN(YO JUAN)"
        assert armar_frase(["YO", "AGUA", "QUERER"]) == "QWEN(YO AGUA QUERER)"
        assert armar_frase(["YO", "AGUA", "QUERER"]) == "QWEN(YO AGUA QUERER)"
        assert len(llamadas) == 2, "la frase repetida no debe volver a pasar por Qwen"
        assert armar_frase(list("HOLA") + [CORTE] + list("JUAN")) == "QWEN(HOLA JUAN)"  # pausa larga: dos palabras
    finally:
        qwen, FRASES = real, real_frases
    # msgpack de [0, 1, "girar", [90]] y [.., [180]] (180 ya no entra en un byte "fixint")
    assert empaquetar([0, 1, "girar", [90]]) == bytes.fromhex("940001a5") + b"girar" + bytes.fromhex("915a")
    assert empaquetar([0, 1, "girar", [180]]).endswith(bytes.fromhex("91ccb4"))
    # Cámara: mano derecha de frente, dedos hacia arriba (y negativa), índice doblado 90° + 90° hacia la palma.
    mano = [(0, 0, 0)]
    for i, x in enumerate([0.04, 0.02, 0.0, -0.02, -0.04]):  # pulgar a la derecha de la imagen
        mano += [(x, -0.03 - 0.025 * k, 0) for k in range(4)]
    abierta = pose_mano(mano, izquierda=False)[0]  # los dedos se abren en abanico: eso lo quita la calibración
    mano[7], mano[8] = (0.02, -0.08, -0.02), (0.02, -0.06, -0.02)
    doblado, roll, pitch, _, _, dist = pose_mano(mano, izquierda=False)
    f = flexion(doblado, {"CAL_OPEN": abierta, "CAL_FIST": [a + 180 for a in abierta]})
    assert f[1] > 85 and max(f[0], *f[2:]) < 1, f
    assert abs(roll) < 1 and abs(pitch - 90) < 15, (roll, pitch)
    medidas = dist + [4.0, 22.0]  # distancias entre dedos + posición respecto de la cara
    assert leer_linea_mano(linea_mano("D", doblado, roll, pitch, 3.0, medidas, 0.8)) == (
        "D", [round(d, 1) for d in doblado], round(roll, 1), round(pitch, 1), 3.0, [round(d, 1) for d in medidas], 0.8)
    assert leer_linea_mano("M:D:1,2,3,4,5,6,7,8,9,10,11,12")[-1] == 0.0  # sin velocidad: se toma 0
    assert leer_linea_mano("M:X:1,2,3,4,5,6,7,8,9,0") is None and leer_linea_mano("M:D:1,2,nan,4,5,6,7,8,9,0") is None
    assert leer_linea_mano("M:D:1,2,3,4,5,6,7,8") is None  # formato viejo, sin distancias
    # O (pulgar toca el índice) y C (con espacio): mismos dedos doblados, distinta pinza.
    curva = [60, 55, 55, 55, 55]
    filas_co = [[nombre, f"{nombre}{t}", "0"] + lectura(curva, dist=d) for t in range(3)
                for nombre, d in [("O", (8, 15, 4, 22)), ("C", (55, 15, 4, 22))] for _ in range(50)]
    det_co = Detector(entrenar(filas_co))
    co = [r[0] for x in [lectura(curva, dist=(55, 15, 4, 22))] * 6 + [lectura(curva, dist=(8, 15, 4, 22))] * 6
          if (r := det_co.paso(rasgos([x] * VENTANA)))]
    assert co == ["C", "O"], co
    seg, nada = Seguidor(), [(0, 0, 0)] * 21

    def vista(lado, x, y=0.5):
        return (lado, nada, [(x, y)] * 21)

    lados = [seg.asignar([vista(l, 0.3 + k * 0.01)], k / 15)[0][0] for k, l in enumerate("DDIDDIDD")]
    assert lados == ["D"] * 8, lados  # etiquetas sueltas cambiadas no la mueven de lado
    assert [m[0] for m in seg.asignar([vista("D", 0.38), vista("D", 0.385)], 0.6)] == ["D"]  # duplicada
    assert sorted(m[0] for m in Seguidor().asignar([vista("D", 0.3), vista("D", 0.7)], 0)) == ["D", "I"]
    reflejada = [(-x, y, z) for x, y, z in mano]  # la izquierda de frente es la derecha en espejo
    assert abs(pose_mano(reflejada, izquierda=True)[1]) < 1

    # Base: busca, elige a quien levanta las dos manos, la sigue, gira al oyente y vuelve.
    reloj = [0.0]
    giros = []
    b = Base(giros.append, reloj=lambda: reloj[0])

    def correr(segundos, cara=None):
        for _ in range(int(segundos * 10)):
            reloj[0] += 0.1
            b.ver(*(cara or (None, 0, False)))
            b.paso()

    correr(4)
    assert b.modo == "BUSCAR" and len(giros) >= 2, giros  # sin nadie, barre
    correr(4, (0.0, 0.2, False))                          # alguien sin levantar las manos: el posible oyente
    vio_oyente = b.angulo
    correr(1, (0.0, 0.2, False))                          # deja la parada (la de alguien dura MIRAR_CON_CARA)
    while abs(b.angulo - vio_oyente) < 60:
        correr(1.5)
    correr(2, (0.0, 0.2, True))                           # manos arriba, al centro de la imagen
    assert b.modo == "SORDO", b.modo
    correr(1, (0.0, 0.2, False))
    sordo = b.angulo
    assert linea_cara(None, 640, False) == "C:-\n" and leer_linea_cara(linea_cara((480, 200, 128), 640, True)) == (0.5, 0.2, True)
    b.pedir("T:OYENTE")
    assert b.modo == "OYENTE" and abs(b.angulo - vio_oyente) <= 2, (b.angulo, vio_oyente)
    b.pedir("T:SORDO")
    assert b.modo == "SORDO" and b.angulo == sordo
    correr(SIN_CARA + 1)
    assert b.modo == "BUSCAR"                             # se fue: vuelve a buscar
    assert manos_arriba([("D", None, [(0.4, 0.2)]), ("I", None, [(0.6, 0.25)])], (320, 150, 100), 480)
    assert not manos_arriba([("D", None, [(0.4, 0.2)]), ("I", None, [(0.6, 0.7)])], (320, 150, 100), 480)
    print("autoprueba OK: quietas", quietas, "· con movimiento", movimiento, "· pose rara ignorada",
          f"· paso rápido A→T: sin TRANSICION {sin_trans}, con TRANSICION {con_trans}")


if __name__ == "__main__":
    args = sys.argv[1:]
    for a in [a for a in args if a.startswith("--pantalla")]:
        args.remove(a)
        zona = a.partition("=")[2]
        PANTALLA = tuple(int(v) for v in zona.split(",")) if zona else ()
        assert len(PANTALLA) in (0, 4), "--pantalla=x,y,ancho,alto"
    if args[:1] == ["vivo"]:
        asyncio.run(vivo("--sin-qwen" not in args, "local" if "--camara" in args else "pc"))
    elif args[:1] == ["importar"] and len(args) == 3:  # importar <carpeta de fotos> <salida.csv>
        with open(args[2], "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(importar_fotos(args[1]))
    elif args[:1] == ["solo-pc"]:
        asyncio.run(vivo(False, "solo"))
    elif args[:1] == ["cargar"] and len(args) == 2:
        cargar_en_placa(args[1])
    elif args[:1] == ["camara-pc"]:
        camara_pc(args[1] if len(args) > 1 else f"127.0.0.1:{PUERTO_CAMARA}")
    elif args[:1] == ["prueba"]:
        prueba()
    else:
        print(__doc__)
