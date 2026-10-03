import React, { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { palette } from '../../theme';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Called when the drag ends (use for persisting / applying). */
  onComplete?: (value: number) => void;
  label?: string;
  valueLabel?: string;
}

/** Minimal draggable slider (no extra dependency). */
export const Slider: React.FC<Props> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  onComplete,
  label,
  valueLabel,
}) => {
  const widthRef = useRef(0);
  const dragStartRef = useRef(value);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;
  valueRef.current = value;

  const quantize = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    if (step > 0) return Math.round(clamped / step) * step;
    return clamped;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const width = widthRef.current;
        if (width <= 0) return;
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / width));
        const next = quantize(min + ratio * (max - min));
        dragStartRef.current = next;
        onChangeRef.current(next);
      },
      onPanResponderMove: (_evt, gesture) => {
        const width = widthRef.current;
        if (width <= 0) return;
        const delta = (gesture.dx / width) * (max - min);
        onChangeRef.current(quantize(dragStartRef.current + delta));
      },
      onPanResponderRelease: () => {
        onCompleteRef.current?.(valueRef.current);
      },
    })
  ).current;

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <View style={styles.wrap}>
      {(label || valueLabel) && (
        <View style={styles.headerRow}>
          <Text style={styles.label}>{label || ''}</Text>
          <Text style={styles.value}>{valueLabel || ''}</Text>
        </View>
      )}
      <View
        style={styles.touchArea}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
          <View style={[styles.knob, { left: `${Math.max(0, Math.min(100, percent))}%` }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  value: { color: palette.accent, fontSize: 12, fontWeight: '700' },
  touchArea: { paddingVertical: 12, paddingHorizontal: 6 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 2, backgroundColor: palette.accent },
  knob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.accent,
    top: -5,
    marginLeft: -7,
    elevation: 2,
    zIndex: 2,
  },
});
