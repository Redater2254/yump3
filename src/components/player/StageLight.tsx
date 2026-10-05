import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import type { CoverPalette } from '../../services/lighting';
import { palette } from '../../theme';

const GLOW = require('../../../assets/images/glow.png');

interface Props {
  colors: CoverPalette | null;
  /** Smoothed full-band loudness (0..1). */
  energy: SharedValue<number>;
  /** Smoothed bass loudness (0..1). */
  bass: SharedValue<number>;
  enabled: boolean;
}

/**
 * Ambient stage wash. Two large off-center lamps (key light top-left, fill
 * light bottom-right) tinted with the cover colors and breathing with the
 * track's envelope. Purely decorative, never touches input.
 */
export const StageLight: React.FC<Props> = ({ colors, energy, bass, enabled }) => {
  const wash = colors?.wash || palette.accent;
  const glow = colors?.glow || palette.accent;

  const keyStyle = useAnimatedStyle(() => ({
    opacity: enabled ? 0.1 + energy.value * 0.17 : 0.05,
    transform: [{ scale: enabled ? 0.96 + energy.value * 0.08 : 1 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    opacity: enabled ? 0.08 + bass.value * 0.16 : 0.045,
    transform: [{ scale: enabled ? 0.94 + bass.value * 0.1 : 1 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.Image source={GLOW} style={[styles.key, { tintColor: wash }, keyStyle]} />
      <Animated.Image source={GLOW} style={[styles.fill, { tintColor: glow }, fillStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  key: { position: 'absolute', top: -150, left: -130, width: 520, height: 520 },
  fill: { position: 'absolute', bottom: -170, right: -150, width: 460, height: 460 },
});
