import { useRef } from 'react';
import { PanResponder } from 'react-native';

interface Options {
  /** Current track width in px. */
  getWidth: () => number;
  /** Called on touch down with the ratio (0..1) under the finger. */
  onStart: (ratio: number) => void;
  /** Called while dragging with the clamped ratio. */
  onMove: (ratio: number) => void;
  /** Called on release with the clamped ratio. */
  onEnd: (ratio: number) => void;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Shared horizontal drag behaviour for the seek and volume bars.
 * Keeps PanResponder out of the screen component.
 */
export function useScrubber(options: Options) {
  const startRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const width = optionsRef.current.getWidth();
        if (width <= 0) return;
        const ratio = clamp01(evt.nativeEvent.locationX / width);
        startRef.current = ratio;
        optionsRef.current.onStart(ratio);
      },
      onPanResponderMove: (_evt, gesture) => {
        const width = optionsRef.current.getWidth();
        if (width <= 0) return;
        optionsRef.current.onMove(clamp01(startRef.current + gesture.dx / width));
      },
      onPanResponderRelease: (_evt, gesture) => {
        const width = optionsRef.current.getWidth();
        if (width <= 0) return;
        optionsRef.current.onEnd(clamp01(startRef.current + gesture.dx / width));
      },
    })
  ).current;
}
