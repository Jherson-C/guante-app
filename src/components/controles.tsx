/**
 * Controles de la conversación (riel de botones con ícono y etiqueta).
 */

import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Cristal } from '@/components/cristal';
import { Icono } from '@/components/icono';
import type { NombreIcono } from '@/components/icono';
import { COLOR, FUENTE } from '@/constants/tema';

type Tono = 'neutro' | 'guante' | 'voz' | 'coral';

const TONOS: Record<Tono, { color: string; suave: string; borde: string }> = {
  neutro: { color: COLOR.suave, suave: 'rgba(255,255,255,0.08)', borde: COLOR.borde },
  guante: { color: COLOR.guante, suave: COLOR.guanteSuave, borde: COLOR.guanteBorde },
  voz: { color: COLOR.voz, suave: COLOR.vozSuave, borde: COLOR.vozBorde },
  coral: { color: COLOR.coral, suave: COLOR.coralSuave, borde: COLOR.coralBorde },
};

export const AnimadoPressable = Animated.createAnimatedComponent(Pressable);

/** Escala suave al pulsar: confirma el toque sin llamar la atención. */
export function useRebote() {
  const escala = useSharedValue(1);
  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  return {
    estilo,
    alPresionar: () => {
      escala.set(withSpring(0.95, { damping: 18, stiffness: 320 }));
    },
    alSoltar: () => {
      escala.set(withSpring(1, { damping: 14, stiffness: 260 }));
    },
  };
}

interface PropsControl {
  icono: NombreIcono;
  etiqueta: string;
  alPresionar: () => void;
  tono?: Tono;
  encendido?: boolean;
  descripcion?: string;
}

export function BotonControl({
  icono,
  etiqueta,
  alPresionar,
  tono = 'neutro',
  encendido = false,
  descripcion,
}: PropsControl) {
  const paleta = TONOS[tono];
  const rebote = useRebote();

  return (
    <AnimadoPressable
      onPress={alPresionar}
      onPressIn={rebote.alPresionar}
      onPressOut={rebote.alSoltar}
      accessibilityRole="button"
      accessibilityLabel={descripcion ?? etiqueta}
      accessibilityState={{ selected: encendido }}
      style={[styles.control, rebote.estilo]}
    >
      <Cristal
        tinte={encendido || tono === 'coral' ? paleta.borde : undefined}
        style={[styles.controlCara, encendido && { backgroundColor: paleta.suave }]}
      >
        <Icono nombre={icono} tamano={22} color={encendido || tono !== 'neutro' ? paleta.color : COLOR.texto} />
        <Text
          numberOfLines={1}
          style={[styles.etiqueta, (encendido || tono === 'coral') && { color: paleta.color }]}
        >
          {etiqueta}
        </Text>
      </Cristal>
    </AnimadoPressable>
  );
}

const styles = StyleSheet.create({
  control: {
    flex: 1,
    minHeight: 52,
  },
  controlCara: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 20,
  },
  etiqueta: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.suave,
  },
});
