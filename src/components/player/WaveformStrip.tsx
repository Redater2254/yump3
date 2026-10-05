import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import type { WaveformData } from '../../services/lighting';

const BARS = 40;
const WINDOW_SECONDS = 1.7;
const BAR_STEP = WINDOW_SECONDS / BARS;
const MAX_HEIGHT = 30;

interface BarProps {
  dataSV: SharedValue<WaveformData | null>;
  position: SharedValue<number>;
  index: number;
  color: string;
}

/**
 * One centered bar of the rolling waveform. Its amplitude is the loudest
 * envelope sample inside this bar's slice of the window, so the wave reads as
 * music instead of jitter.
 */
const WaveBar = React.memo(function WaveBar({ dataSV, position, index, color }: BarProps) {
  const style = useAnimatedStyle(() => {
    const wave = dataSV.value;
    if (!wave) {
      return { transform: [{ scaleY: 0.05 }], opacity: 0.2 };
    }
    const t = position.value + (index - BARS + 1) * BAR_STEP;
    const start = Math.floor(t * wave.hz);
    const end = Math.max(start + 1, Math.floor((t + BAR_STEP) * wave.hz));
    let peak = 0;
    for (let s = start; s < end; s++) {
      if (s >= 0 && s < wave.energy.length) {
        const value = wave.energy[s];
        if (value > peak) peak = value;
      }
    }
    const level = peak / 255;
    return {
      transform: [{ scaleY: 0.06 + level * 0.94 }],
      opacity: 0.28 + level * 0.72,
    };
  });

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
});

interface Props {
  dataSV: SharedValue<WaveformData | null>;
  position: SharedValue<number>;
  /** 1 while playing; used to dim the strip when paused. */
  playingSV: SharedValue<number>;
  color: string;
}

/**
 * Rolling waveform strip: the last ~1.7 s of the song, scrolling right to
 * left, colored with the cover's vibrant tone. Not interactive; the progress
 * bar above stays the seek control.
 */
export const WaveformStrip: React.FC<Props> = ({ dataSV, position, playingSV, color }) => {
  const containerStyle = useAnimatedStyle(() => ({
    opacity: playingSV.value ? 1 : 0.55,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      {Array.from({ length: BARS }, (_, i) => (
        <WaveBar key={i} dataSV={dataSV} position={position} index={i} color={color} />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: MAX_HEIGHT + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bar: {
    width: 3,
    height: MAX_HEIGHT,
    borderRadius: 1.5,
  },
});
