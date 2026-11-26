/**
 * Conversación en horizontal, a pantalla completa.
 *
 * El teléfono va sobre la base giratoria con la cámara encima y muestra un
 * solo texto, en grande:
 *   - La base busca a la persona sorda (la que levanta las dos manos) y la
 *     sigue. Lo que firma, la app lo dice en voz alta para el oyente.
 *   - El oyente habla → la base gira hacia él mientras el micrófono lo
 *     transcribe, y vuelve a la persona sorda para que lo lea.
 * El micrófono escucha solo desde que se abre la pantalla (manos libres).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BotonControl } from '@/components/controles';
import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { PantallaGrande } from '@/components/pantalla-grande';
import { COLORES_FASE, ETIQUETAS_FASE } from '@/constants/guante-fases';
import { COLOR, FUENTE } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';
import { useGuante } from '@/hooks/use-guante';
import { useReconocimientoVoz } from '@/hooks/use-reconocimiento-voz';
import { useTextoAVoz } from '@/hooks/use-texto-a-voz';
import { useTurnos } from '@/hooks/use-turnos';

const ANCHO_RIEL = 84;

export default function Conversacion() {
  useKeepAwake();

  const {
    texto,
    fase,
    dispositivos,
    conectar,
    desconectar,
    enviarBase,
    limpiarTexto,
    inyectarLinea,
  } = useGuante();

  const { hablar, preparar, detener: detenerVoz, hablando } = useTextoAVoz();
  // Lo firmado se lee en voz alta por defecto: es la forma en que el oyente "escucha" al sordo.
  const [autoVoz, setAutoVoz] = useState(true);

  // Lo que dice la voz y el hilo se necesitan mutuamente: la voz entrega frases
  // finales al hilo, y el hilo cierra el turno del guante cuando alguien habla.
  const agregarVozRef = useRef<(texto: string) => void>(() => {});
  const cerrarGuanteRef = useRef<() => void>(() => {});

  const {
    escuchando,
    parcial,
    error: errorVoz,
    iniciar,
    detener,
  } = useReconocimientoVoz((frase) => {
    cerrarGuanteRef.current();
    agregarVozRef.current(frase);
  });

  const { turnos, guanteVivo, agregarVoz, cerrarGuante, limpiar } = useTurnos({
    texto,
    parcial,
    alCerrarGuante: (cerrado) => {
      if (autoVoz) hablar(cerrado);
    },
  });

  // El turno se cierra (y se lee) tras 2 s sin señas nuevas. Apenas lo firmado se
  // queda quieto, se pide la voz a Fish (~1.5 s): al cerrarse el turno ya está lista.
  useEffect(() => {
    if (!autoVoz || !guanteVivo) return;
    const timer = setTimeout(() => preparar(guanteVivo), 500);
    return () => clearTimeout(timer);
  }, [guanteVivo, autoVoz, preparar]);

  useEffect(() => {
    agregarVozRef.current = agregarVoz;
    cerrarGuanteRef.current = cerrarGuante;
  });

  // Manos libres: el micrófono empieza a escuchar al abrir la pantalla.
  useEffect(() => {
    if (Platform.OS !== 'web') void iniciar();
    // Solo al montar; el usuario puede pausarlo con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras el teléfono habla, el micrófono se pausa para no transcribirse a sí mismo.
  const reanudarRef = useRef(false);
  useEffect(() => {
    if (hablando && escuchando) {
      reanudarRef.current = true;
      detener();
    } else if (!hablando && reanudarRef.current) {
      reanudarRef.current = false;
      void iniciar();
    }
  }, [hablando, escuchando, detener, iniciar]);

  const alternarMic = useCallback(() => {
    reanudarRef.current = false;
    if (escuchando) detener();
    else void iniciar();
  }, [escuchando, detener, iniciar]);

  const borrarTodo = useCallback(() => {
    limpiarTexto();
    limpiar();
    detenerVoz();
  }, [limpiarTexto, limpiar, detenerVoz]);

  const terminar = useCallback(() => {
    reanudarRef.current = false;
    detener();
    detenerVoz();
    desconectar();
    router.replace('/');
  }, [detener, detenerVoz, desconectar]);

  // --- Quién tiene la palabra -------------------------------------------
  const vivoFuente: Fuente | null = parcial ? 'voz' : guanteVivo ? 'guante' : null;
  const ultimo = turnos.length > 0 ? turnos[turnos.length - 1] : null;

  const actual = parcial
    ? { fuente: 'voz' as const, texto: parcial, vivo: true }
    : guanteVivo
      ? { fuente: 'guante' as const, texto: guanteVivo, vivo: true }
      : ultimo
        ? { ...ultimo, vivo: false }
        : null;
  const previo = vivoFuente ? ultimo : turnos.length > 1 ? turnos[turnos.length - 2] : null;

  // --- Base giratoria: la cámara y la pantalla van juntas sobre la base ------
  // La placa busca y sigue a la persona sorda (la que levanta las dos manos).
  // Mientras el oyente habla, la base gira hacia él; al terminar la frase vuelve
  // a la persona sorda, que lee lo dicho. Desde 2 palabras: el ruido suelto no la mueve.
  const baseLista = dispositivos.guantes.fase === 'operativo'; // el servo está en el cerebro UNO Q
  const hablaOyente = parcial.trim().split(/\s+/).length >= 2;
  useEffect(() => {
    if (baseLista) enviarBase(hablaOyente ? 'T:OYENTE' : 'T:SORDO').catch(() => {});
  }, [hablaOyente, baseLista, enviarBase]);

  const sinGuante = fase !== 'operativo';
  const ocupado =
    fase === 'verificando' ||
    fase === 'escaneando' ||
    fase === 'conectando' ||
    fase === 'conectado' ||
    fase === 'reconectando';

  // --- Demo (solo web): simula guante y voz para ver la interfaz sin hardware ---
  const esDemo = Platform.OS === 'web';
  const demoRef = useRef(0);

  useEffect(
    () => () => {
      demoRef.current = -1; // corta cualquier demo en curso al salir
    },
    [],
  );

  const esperar = (ms: number) =>
    new Promise<void>((resolver) => {
      setTimeout(resolver, ms);
    });

  const firmar = async (contenido: string, token: number) => {
    for (const caracter of contenido) {
      if (demoRef.current !== token) return;
      inyectarLinea(caracter === ' ' ? 'S:ESPACIO' : `S:${caracter}|96`);
      await esperar(240);
    }
    inyectarLinea('S:ESPACIO');
  };

  const decirVoz = (frase: string) => {
    cerrarGuanteRef.current();
    agregarVozRef.current(frase);
  };

  const correrDemo = async () => {
    demoRef.current += 1;
    const token = demoRef.current;
    const activa = () => demoRef.current === token;

    inyectarLinea('HELLO:SIM');
    await firmar('HOLA', token);
    await esperar(3800);
    if (!activa()) return;
    decirVoz('Hola, ¿cómo estás?');
    await esperar(2200);
    if (!activa()) return;
    await firmar('ESTOY BIEN', token);
    await esperar(3800);
    if (!activa()) return;
    decirVoz('Qué bueno. ¿Quieres un café?');
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.raiz}>
      <Fondo activo={vivoFuente} />

      <View
        style={[
          styles.marco,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingLeft: Math.max(insets.left, 14),
            paddingRight: Math.max(insets.right, 14),
          },
        ]}
      >
        <View style={styles.escena}>
          {/* Solo avisos cuando algo falla: el resto de la pantalla es para el texto */}
          {sinGuante || errorVoz ? (
            <View style={styles.avisos}>
              {sinGuante ? (
                <Cristal style={styles.aviso}>
                  <View style={[styles.punto, { backgroundColor: COLORES_FASE[fase] }]} />
                  <Text style={styles.avisoTexto} numberOfLines={1}>
                    {ocupado ? ETIQUETAS_FASE[fase] : 'Placa sin conexión.'}
                  </Text>
                  {!ocupado ? (
                    <Pressable
                      onPress={conectar}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Conectar la placa"
                      style={styles.avisoAccion}
                    >
                      <Text style={styles.avisoAccionTexto}>Conectar</Text>
                    </Pressable>
                  ) : null}
                </Cristal>
              ) : null}
              {errorVoz ? (
                <Cristal tinte={COLOR.coralBorde} style={styles.aviso}>
                  <Text style={[styles.avisoTexto, { color: COLOR.coral }]} numberOfLines={1}>
                    {errorVoz}
                  </Text>
                </Cristal>
              ) : null}
            </View>
          ) : null}

          {esDemo ? (
            <View style={styles.demoFila}>
              <Text style={styles.demoTitulo}>Demo web:</Text>
              <Pressable onPress={() => void correrDemo()} style={styles.demoBoton}>
                <Text style={styles.demoTexto}>Conversación de ejemplo</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  demoRef.current += 1;
                  void firmar('BUENOS DIAS', demoRef.current);
                }}
                style={styles.demoBoton}
              >
                <Text style={styles.demoTexto}>Firmar</Text>
              </Pressable>
              <Pressable
                onPress={() => decirVoz('Buenos días, ¿en qué te ayudo?')}
                style={styles.demoBoton}
              >
                <Text style={styles.demoTexto}>Hablar</Text>
              </Pressable>
            </View>
          ) : null}

          {/* La pantalla grande: el texto del turno actual */}
          <View style={styles.grande}>
            <PantallaGrande actual={actual} previo={previo} />
          </View>
        </View>

        {/* Riel de controles, angosto para dejarle la pantalla al texto */}
        <View style={styles.riel}>
          <BotonControl
            icono={escuchando ? 'parar' : 'mic'}
            etiqueta={escuchando ? 'Oyendo' : 'Mic'}
            descripcion={escuchando ? 'Pausar el micrófono' : 'Escuchar al oyente'}
            tono="voz"
            encendido={escuchando}
            alPresionar={alternarMic}
          />
          <BotonControl
            icono="voz"
            etiqueta={autoVoz ? 'Leer: sí' : 'Leer: no'}
            descripcion={
              autoVoz
                ? 'Leer las señas en voz alta automáticamente: activado'
                : 'Leer las señas en voz alta automáticamente: desactivado'
            }
            tono="guante"
            encendido={autoVoz}
            alPresionar={() => setAutoVoz((valor) => !valor)}
          />
          <BotonControl icono="borrar" etiqueta="Borrar" alPresionar={borrarTodo} />
          <BotonControl icono="apagar" etiqueta="Terminar" tono="coral" alPresionar={terminar} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: COLOR.abismo,
  },
  marco: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  escena: {
    flex: 1,
    gap: 8,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  avisos: {
    flexDirection: 'row',
    gap: 8,
  },
  aviso: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  avisoTexto: {
    flex: 1,
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.suave,
  },
  avisoAccion: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLOR.guanteSuave,
    borderWidth: 1,
    borderColor: COLOR.guanteBorde,
  },
  avisoAccionTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.guante,
  },
  demoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  demoTitulo: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.tenue,
  },
  demoBoton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  demoTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 11,
    color: COLOR.texto,
  },
  grande: {
    flex: 1,
  },
  riel: {
    width: ANCHO_RIEL,
    gap: 8,
  },
});
