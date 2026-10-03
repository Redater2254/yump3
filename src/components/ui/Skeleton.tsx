import React, { useEffect } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { palette } from '../../theme';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/** A shimmering placeholder block used for skeleton loading states. */
export const Skeleton: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => {
  const opacity = useSharedValue(0.35);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.55;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.base, style, animatedStyle]} />;
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.border,
    borderRadius: 8,
  },
});
