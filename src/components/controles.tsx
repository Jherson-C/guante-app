/**
 * Controles de la conversación. `BotonMic` es el protagonista (rectángulo
 * grande que respira mientras escucha); `BotonControl` es el resto de acciones.
 */

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Cristal } from '@/components/cristal';
import { Icono } from '@/components/icono';
import type { NombreIcono } from '@/components/icono';
import { COLOR, FUENTE } from '@/constants/tema';

type Tono = 'neutro' | 'guante' | 'voz' | 'coral';

const TONOS: Record<Tono, { color: string; suave: string; borde: string }> = {
  neutro: { color: COLOR.suave, suave: 'rgba(255,255,255,0.08)', borde: COLOR.borde },
  guante: { color: COLOR.guante, suave: COLOR.guanteSuave, borde: COLOR.guanteBorde },
  voz: { color: COLOR.voz, suave: COLOR.vozSuave, borde: COLOR.vozBorde },
  coral: { color: COLOR.coral, suave: COLOR.coralSuave, borde: 'rgba(255,93,93,0.4)' },
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

interface PropsMic {
  escuchando: boolean;
  alPresionar: () => void;
}

export function BotonMic({ escuchando, alPresionar }: PropsMic) {
  const reducir = useReducedMotion();
  const rebote = useRebote();
  const onda = useSharedValue(0);

  useEffect(() => {
    if (escuchando && !reducir) {
      onda.value = 0;
      onda.value = withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(onda);
      onda.value = 0;
    }
    return () => cancelAnimation(onda);
  }, [escuchando, reducir, onda]);

  const anillo1 = useAnimatedStyle(() => ({
    opacity: interpolate(onda.value, [0, 1], [0.45, 0]),
    transform: [{ scale: interpolate(onda.value, [0, 1], [1, 1.28]) }],
  }));
  const anillo2 = useAnimatedStyle(() => {
    const fase = (onda.value + 0.5) % 1;
    return {
      opacity: interpolate(fase, [0, 1], [0.35, 0]),
      transform: [{ scale: interpolate(fase, [0, 1], [1, 1.28]) }],
    };
  });

  return (
    <AnimadoPressable
      onPress={alPresionar}
      onPressIn={rebote.alPresionar}
      onPressOut={rebote.alSoltar}
      accessibilityRole="button"
      accessibilityLabel={escuchando ? 'Detener el micrófono' : 'Escuchar al oyente'}
      accessibilityState={{ selected: escuchando }}
      style={[styles.mic, rebote.estilo]}
    >
      {escuchando ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.anillo, anillo1]} />
          <Animated.View pointerEvents="none" style={[styles.anillo, anillo2]} />
        </>
      ) : null}
      <View style={[styles.micCara, escuchando ? styles.micActivo : styles.micReposo]}>
        <Icono
          nombre={escuchando ? 'parar' : 'mic'}
          tamano={30}
          color={escuchando ? '#1A1206' : COLOR.voz}
          grosor={2.2}
        />
        <Text style={[styles.micEtiqueta, escuchando && { color: '#1A1206' }]}>
          {escuchando ? 'Escuchando' : 'Escuchar'}
        </Text>
        <Text style={[styles.micAyuda, escuchando && { color: 'rgba(26,18,6,0.7)' }]}>
          {escuchando ? 'Toca para detener' : 'Toca para empezar'}
        </Text>
      </View>
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
  mic: {
    flex: 2.1,
    minHeight: 80,
  },
  anillo: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLOR.voz,
  },
  micCara: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  micReposo: {
    backgroundColor: COLOR.vozSuave,
    borderColor: COLOR.vozBorde,
  },
  micActivo: {
    backgroundColor: COLOR.voz,
    borderColor: COLOR.voz,
  },
  micEtiqueta: {
    fontFamily: FUENTE.display,
    fontSize: 18,
    color: COLOR.voz,
    letterSpacing: -0.3,
  },
  micAyuda: {
    fontFamily: FUENTE.normal,
    fontSize: 11,
    color: COLOR.tenue,
  },
});
