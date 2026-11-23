/**
 * Superficie de cristal. En iOS 26 usa el efecto nativo (`GlassView`); en el
 * resto, una capa translúcida con un reborde de luz arriba que simula el
 * canto del vidrio. Se ve "a través" gracias al fondo con gradientes de
 * `Fondo`, que es lo que le da profundidad sin necesitar blur nativo.
 */

import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { COLOR } from '@/constants/tema';

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Color con el que se tiñe el cristal (por ejemplo, el de quien habla). */
  tinte?: string;
  fuerte?: boolean;
}

const GLASS_NATIVO = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

export function Cristal({ style, tinte, fuerte, children }: PropsWithChildren<Props>) {
  if (GLASS_NATIVO) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tinte}
        style={[styles.base, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: fuerte ? COLOR.capaFuerte : COLOR.capa },
        tinte ? { borderColor: tinte } : null,
        style,
      ]}
    >
      <View pointerEvents="none" style={styles.canto} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: COLOR.borde,
    overflow: 'hidden',
  },
  canto: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: COLOR.brillo,
  },
});
