/**
 * Fondo vivo: dos resplandores (cian y ámbar) hechos con gradientes radiales.
 * El de quien tiene la palabra se enciende y el otro se apaga, así el color de
 * toda la pantalla dice quién está "hablando" sin leer nada.
 */

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { COLOR } from '@/constants/tema';
import type { Fuente } from '@/constants/tema';

interface Props {
  /** Quién tiene la palabra ahora; `null` = nadie (ambos en reposo). */
  activo: Fuente | null;
}

const REPOSO = 0.32;
const ENCENDIDO = 0.95;
const APAGADO = 0.12;

function Resplandor({
  id,
  color,
  cx,
  cy,
}: {
  id: string;
  color: string;
  cx: string;
  cy: string;
}) {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} rx="75%" ry="75%">
          <Stop offset="0" stopColor={color} stopOpacity={0.5} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.13} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function Fondo({ activo }: Props) {
  const reducir = useReducedMotion();
  const guante = useSharedValue(REPOSO);
  const voz = useSharedValue(REPOSO);

  useEffect(() => {
    const ms = reducir ? 0 : 700;
    const config = { duration: ms, easing: Easing.out(Easing.cubic) };
    guante.value = withTiming(
      activo === 'guante' ? ENCENDIDO : activo === 'voz' ? APAGADO : REPOSO,
      config,
    );
    voz.value = withTiming(
      activo === 'voz' ? ENCENDIDO : activo === 'guante' ? APAGADO : REPOSO,
      config,
    );
  }, [activo, reducir, guante, voz]);

  const estiloGuante = useAnimatedStyle(() => ({ opacity: guante.value }));
  const estiloVoz = useAnimatedStyle(() => ({ opacity: voz.value }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.base]}>
      <Animated.View style={[StyleSheet.absoluteFill, estiloGuante]}>
        <Resplandor id="g-guante" color={COLOR.guante} cx="8%" cy="6%" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, estiloVoz]}>
        <Resplandor id="g-voz" color={COLOR.voz} cx="94%" cy="96%" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: COLOR.abismo,
  },
});
