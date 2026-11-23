/**
 * La pantalla principal de la conversación: un solo texto, lo más grande que
 * quepa, para leerlo a distancia con el teléfono sobre la base giratoria.
 * Cian = lo que firmó el guante, ámbar = lo que dijo la voz. Debajo, en chico,
 * el turno anterior para no perder el hilo.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Cristal } from '@/components/cristal';
import { Icono } from '@/components/icono';
import { ACENTO, COLOR, FUENTE } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';

const MIN_FUENTE = 26;
const MAX_FUENTE = 150;
/** Ancho medio de un carácter de Bricolage ExtraBold en mayúsculas, en "em". */
const ANCHO_CARACTER = 0.62;
const INTERLINEA = 1.08;

/**
 * Tamaño de letra más grande con el que `texto` cabe en ancho × alto.
 * shortcut: estima por cantidad de caracteres, no mide palabras; si una palabra
 * muy larga se corta mal, pasar a medir con onTextLayout.
 */
export function tamanoQueCabe(texto: string, ancho: number, alto: number): number {
  const largo = Math.max(1, texto.length);
  for (let t = Math.min(MAX_FUENTE, alto); t > MIN_FUENTE; t -= 2) {
    const porLinea = Math.max(1, Math.floor(ancho / (t * ANCHO_CARACTER)));
    if (Math.ceil(largo / porLinea) * t * INTERLINEA <= alto) return t;
  }
  return MIN_FUENTE;
}

function Cursor({ color, alto }: { color: string; alto: number }) {
  const reducir = useReducedMotion();
  const brillo = useSharedValue(1);

  useEffect(() => {
    if (reducir) return;
    brillo.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 480, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    return () => cancelAnimation(brillo);
  }, [reducir, brillo]);

  const estilo = useAnimatedStyle(() => ({ opacity: brillo.value }));
  return <Animated.View style={[styles.cursor, { backgroundColor: color, height: alto }, estilo]} />;
}

interface Turno {
  fuente: Fuente;
  texto: string;
}

interface Props {
  actual: (Turno & { vivo: boolean }) | null;
  previo: Turno | null;
}

export function PantallaGrande({ actual, previo }: Props) {
  const [area, setArea] = useState({ ancho: 0, alto: 0 });

  if (!actual) {
    return (
      <Animated.View entering={FadeIn.duration(500)} style={styles.vacio}>
        <View style={styles.vacioIconos}>
          <Icono nombre="mano" tamano={30} color={COLOR.guante} />
          <View style={styles.vacioLinea} />
          <Icono nombre="mic" tamano={30} color={COLOR.voz} />
        </View>
        <Text style={styles.vacioTitulo}>Listo para traducir</Text>
        <Text style={styles.vacioTexto}>
          Lo que se firme con los guantes se dice en voz alta. Lo que diga la otra persona
          aparece aquí, en grande.
        </Text>
      </Animated.View>
    );
  }

  const acento = ACENTO[actual.fuente];
  const tamano = area.ancho ? tamanoQueCabe(actual.texto, area.ancho - 12, area.alto) : MIN_FUENTE;

  return (
    <Cristal fuerte tinte={acento.borde} style={styles.tarjeta}>
      <View style={[styles.marca, { backgroundColor: acento.color }]} />
      <View style={styles.cabecera}>
        <Icono nombre={actual.fuente === 'guante' ? 'mano' : 'mic'} tamano={18} color={acento.color} />
        <Text style={[styles.nombre, { color: acento.color }]}>
          {actual.fuente === 'guante' ? 'Guante · firmado' : 'Voz · dicho'}
        </Text>
      </View>

      <View
        style={styles.zonaTexto}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width !== area.ancho || height !== area.alto) setArea({ ancho: width, alto: height });
        }}
      >
        <Text
          style={[styles.texto, { fontSize: tamano, lineHeight: Math.round(tamano * INTERLINEA) }]}
          accessibilityLabel={`${acento.nombre}: ${actual.texto}`}
          accessibilityLiveRegion="polite"
        >
          {actual.texto}
          {actual.vivo ? ' ' : ''}
        </Text>
        {actual.vivo ? <Cursor color={acento.color} alto={Math.round(tamano * 0.8)} /> : null}
      </View>

      {previo ? (
        <Text style={styles.previo} numberOfLines={1}>
          <Text style={{ color: ACENTO[previo.fuente].color }}>
            {previo.fuente === 'guante' ? 'Guante: ' : 'Voz: '}
          </Text>
          {previo.texto}
        </Text>
      ) : null}
    </Cristal>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 28,
    gap: 6,
  },
  marca: {
    position: 'absolute',
    left: 0,
    top: 22,
    bottom: 22,
    width: 4,
    borderRadius: 2,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nombre: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
  },
  zonaTexto: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'center',
  },
  texto: {
    flexShrink: 1,
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    letterSpacing: -0.8,
  },
  cursor: {
    width: 5,
    borderRadius: 3,
  },
  previo: {
    fontFamily: FUENTE.negrita,
    fontSize: 15,
    color: COLOR.suave,
  },
  vacio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  vacioIconos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  vacioLinea: {
    width: 52,
    height: 1,
    backgroundColor: COLOR.borde,
  },
  vacioTitulo: {
    fontFamily: FUENTE.display,
    fontSize: 30,
    color: COLOR.texto,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  vacioTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 15,
    lineHeight: 22,
    color: COLOR.suave,
    textAlign: 'center',
    maxWidth: 440,
  },
});
