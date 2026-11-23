/**
 * Indicador de quién tiene la palabra: una píldora de cristal con dos
 * posiciones (Guante · Voz) y una pieza que se desliza al que habla. Cambia de
 * color al pasar de uno a otro y se atenúa cuando nadie habla.
 */

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Cristal } from '@/components/cristal';
import { Icono } from '@/components/icono';
import { ACENTO, COLOR, FUENTE } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';

const ANCHO = 98;
const ALTO = 40;
const MARGEN = 4;

interface Props {
  /** Último que habló (o `null` si todavía nadie). */
  fuente: Fuente | null;
  /** `true` mientras esa persona está hablando o firmando ahora mismo. */
  vivo: boolean;
}

export function IndicadorTurno({ fuente, vivo }: Props) {
  const reducir = useReducedMotion();
  const posicion = useSharedValue(0);
  const presencia = useSharedValue(0);

  useEffect(() => {
    if (fuente) {
      const destino = fuente === 'voz' ? 1 : 0;
      posicion.value = reducir ? destino : withSpring(destino, { damping: 17, stiffness: 190 });
    }
    presencia.value = withTiming(fuente ? (vivo ? 1 : 0.5) : 0, {
      duration: reducir ? 0 : 280,
    });
  }, [fuente, vivo, reducir, posicion, presencia]);

  const estiloPieza = useAnimatedStyle(() => ({
    opacity: presencia.value,
    transform: [{ translateX: posicion.value * ANCHO }],
    backgroundColor: interpolateColor(
      posicion.value,
      [0, 1],
      ['rgba(41, 217, 242, 0.22)', 'rgba(255, 181, 74, 0.22)'],
    ),
    borderColor: interpolateColor(
      posicion.value,
      [0, 1],
      [COLOR.guanteBorde, COLOR.vozBorde],
    ),
  }));

  return (
    <Cristal style={styles.pildora}>
      <Animated.View style={[styles.pieza, estiloPieza]} />
      {(['guante', 'voz'] as const).map((valor) => {
        const encendido = fuente === valor && vivo;
        return (
          <View
            key={valor}
            style={styles.opcion}
            accessible
            accessibilityLabel={`${ACENTO[valor].nombre}${encendido ? ', hablando ahora' : ''}`}
          >
            <Icono
              nombre={valor === 'guante' ? 'mano' : 'mic'}
              tamano={16}
              color={encendido ? ACENTO[valor].color : COLOR.tenue}
            />
            <Text
              style={[styles.etiqueta, encendido && { color: ACENTO[valor].color }]}
            >
              {ACENTO[valor].nombre}
            </Text>
          </View>
        );
      })}
    </Cristal>
  );
}

const styles = StyleSheet.create({
  pildora: {
    flexDirection: 'row',
    width: ANCHO * 2 + MARGEN * 2,
    height: ALTO + MARGEN * 2,
    padding: MARGEN,
    borderRadius: 999,
  },
  pieza: {
    position: 'absolute',
    left: MARGEN,
    top: MARGEN,
    width: ANCHO,
    height: ALTO,
    borderRadius: 999,
    borderWidth: 1,
  },
  opcion: {
    width: ANCHO,
    height: ALTO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  etiqueta: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.tenue,
  },
});
