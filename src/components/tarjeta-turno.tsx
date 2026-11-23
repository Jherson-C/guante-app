/**
 * Un turno del hilo. El guante se alinea a la izquierda en cian y la voz a la
 * derecha en ámbar. El turno vivo es grande y lleva un cursor que parpadea;
 * los cerrados se reducen y se apagan según su antigüedad.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
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

interface Props {
  fuente: Fuente;
  texto: string;
  hora?: number;
  vivo?: boolean;
  /** 0–1: los turnos viejos se apagan. */
  opacidad?: number;
  tamano: number;
  anchoMax: number;
  /** Solo en turnos cerrados del guante: leerlo en voz alta. */
  alHablar?: () => void;
}

function formatearHora(ms: number): string {
  const fecha = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
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
  return (
    <Animated.View
      style={[styles.cursor, { backgroundColor: color, height: alto }, estilo]}
    />
  );
}

export function TarjetaTurno({
  fuente,
  texto,
  hora,
  vivo = false,
  opacidad = 1,
  tamano,
  anchoMax,
  alHablar,
}: Props) {
  const acento = ACENTO[fuente];
  const esGuante = fuente === 'guante';
  const tamanoTexto = vivo ? tamano : Math.round(tamano * 0.56);

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      layout={LinearTransition.duration(240)}
      style={[
        styles.contenedor,
        { maxWidth: anchoMax, opacity: opacidad },
        esGuante ? styles.izquierda : styles.derecha,
      ]}
    >
      <Cristal
        fuerte={vivo}
        tinte={vivo ? acento.borde : undefined}
        style={[styles.tarjeta, vivo && styles.tarjetaViva]}
      >
        <View
          style={[
            styles.marca,
            { backgroundColor: acento.color },
            esGuante ? styles.marcaIzquierda : styles.marcaDerecha,
          ]}
        />

        <View style={[styles.cabecera, !esGuante && styles.filaInversa]}>
          <Icono nombre={esGuante ? 'mano' : 'mic'} tamano={14} color={acento.color} />
          <Text style={[styles.nombre, { color: acento.color }]}>{acento.nombre}</Text>
          {hora ? <Text style={styles.hora}>{formatearHora(hora)}</Text> : null}
          {alHablar && !vivo ? (
            <Pressable
              onPress={alHablar}
              hitSlop={10}
              style={styles.hablar}
              accessibilityRole="button"
              accessibilityLabel="Leer este turno en voz alta"
            >
              <Icono nombre="voz" tamano={15} color={COLOR.suave} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.cuerpo, !esGuante && styles.filaInversa]}>
          <Text
            style={[
              vivo ? styles.textoVivo : styles.texto,
              { fontSize: tamanoTexto, lineHeight: Math.round(tamanoTexto * 1.12) },
              !esGuante && styles.alineadoDerecha,
            ]}
            accessibilityLabel={`${acento.nombre}: ${texto}`}
          >
            {texto}
          </Text>
          {vivo ? <Cursor color={acento.color} alto={Math.round(tamanoTexto * 0.86)} /> : null}
        </View>
      </Cristal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    width: '100%',
  },
  izquierda: {
    alignSelf: 'flex-start',
  },
  derecha: {
    alignSelf: 'flex-end',
  },
  tarjeta: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  tarjetaViva: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 26,
  },
  marca: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 2,
  },
  marcaIzquierda: {
    left: 0,
  },
  marcaDerecha: {
    right: 0,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filaInversa: {
    flexDirection: 'row-reverse',
  },
  nombre: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
  },
  hora: {
    fontFamily: FUENTE.normal,
    fontSize: 11,
    color: COLOR.tenue,
  },
  hablar: {
    marginLeft: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cuerpo: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  texto: {
    flexShrink: 1,
    fontFamily: FUENTE.negrita,
    color: COLOR.texto,
    letterSpacing: -0.2,
  },
  textoVivo: {
    flexShrink: 1,
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    letterSpacing: -0.8,
  },
  alineadoDerecha: {
    textAlign: 'right',
  },
  cursor: {
    width: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
});
