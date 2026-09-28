import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight } from '../../services/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  /** Scale applied while pressed. Smaller values = more pronounced. */
  activeScale?: number;
  /** Opacity applied while pressed (1 disables the fade). */
  activeOpacity?: number;
  /** Opacity applied while disabled. */
  disabledOpacity?: number;
  /** Fire a light haptic tick on press-in. */
  haptic?: boolean;
}

/**
 * A pressable that compresses with a light spring on touch and springs back with
 * a subtle overshoot, giving an iOS-like "chewy" tactile feel. Drop-in replacement
 * for TouchableOpacity (ignores the legacy `activeOpacity` prop).
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  activeScale = 0.94,
  activeOpacity = 0.85,
  disabledOpacity = 0.55,
  haptic = true,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? disabledOpacity : opacity.value,
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        if (haptic && !disabled) hapticLight();
        if (reduceMotion) {
          scale.value = activeScale;
          opacity.value = activeOpacity;
        } else {
          // Compress almost instantly so the tap feels immediate.
          scale.value = withSpring(activeScale, { damping: 20, stiffness: 600, mass: 0.35 });
          opacity.value = withTiming(activeOpacity, { duration: 70 });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (reduceMotion) {
          scale.value = 1;
          opacity.value = 1;
        } else {
          // Snap back fast with a tiny overshoot for a crisp, "chewy" release.
          scale.value = withSpring(1, { damping: 17, stiffness: 480, mass: 0.4 });
          opacity.value = withTiming(1, { duration: 90 });
        }
        onPressOut?.(e);
      }}
      style={[style as any, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
};
