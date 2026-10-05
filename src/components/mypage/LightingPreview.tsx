import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { palette } from '../../theme';
import type { CoverPalette, StageLightSettings } from '../../services/lighting';

const HALO = require('../../../assets/images/halo.png');
const GLOW = require('../../../assets/images/glow.png');
const SAMPLE = require('../../../assets/images/light-sample.png');

interface Props {
  settings: StageLightSettings;
  /** Cover of the active track; falls back to a bundled sample. */
  cover?: string | null;
  colors?: CoverPalette | null;
  /** Cover size inside the preview stage. */
  size?: number;
}

/**
 * Live preview of the stage light. Mirrors the player math (same assets, same
 * opacity/spread curves) and breathes with a demo pulse so the sliders show
 * their effect immediately.
 */
export const LightingPreview: React.FC<Props> = ({
  settings,
  cover,
  colors,
  size = 132,
}) => {
  const pulse = useSharedValue(0.25);

  useEffect(() => {
    if (!settings.enabled) {
      pulse.value = withTiming(0, { duration: 220 });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.2, { duration: 950, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
    return () => {
      pulse.value = 0;
    };
  }, [settings.enabled]);

  const glow = colors?.glow || palette.accent;
  const wash = colors?.wash || palette.accent;
  const spread = settings.size;

  const haloStyle = useAnimatedStyle(() => {
    const p = pulse.value * settings.pulse;
    return {
      opacity: settings.enabled ? Math.min(1, (0.24 + p * 0.3) * settings.intensity) : 0,
      transform: [{ scale: 1 + p * 0.05 }],
    };
  });

  const auraStyle = useAnimatedStyle(() => {
    const p = pulse.value * settings.pulse;
    return {
      opacity: settings.enabled ? Math.min(1, (0.08 + p * 0.16) * settings.intensity) : 0,
      transform: [{ scale: 0.98 + p * 0.06 }],
    };
  });

  const auraSize = size * 1.9 * spread;
  const haloSize = size * 1.44 * spread;

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <Animated.Image
        source={GLOW}
        style={[
          styles.layer,
          {
            width: auraSize,
            height: auraSize,
            left: (size - auraSize) / 2,
            top: (size - auraSize) / 2,
            tintColor: wash,
          },
          auraStyle,
        ]}
      />
      <Animated.Image
        source={HALO}
        style={[
          styles.layer,
          {
            width: haloSize,
            height: haloSize,
            left: (size - haloSize) / 2,
            top: (size - haloSize) / 2,
            tintColor: glow,
          },
          haloStyle,
        ]}
      />
      <Image
        source={cover ? { uri: cover } : SAMPLE}
        style={[styles.cover, { width: size, height: size }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  cover: {
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
});
