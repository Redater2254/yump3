import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, LayoutChangeEvent, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

interface MarqueeTextProps {
  text: string;
  style?: any;
  speed?: number; // pixels per second
  delay?: number; // ms
}

// Utility to isolate margins and positioning from font styles
const extractMarginStyles = (styleObj: any) => {
  if (!styleObj) return { marginStyles: {}, textStyles: {} };
  
  const flattened = StyleSheet.flatten(styleObj);
  const marginKeys = [
    'margin', 'marginHorizontal', 'marginVertical', 
    'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'position', 'top', 'bottom', 'left', 'right', 'flex', 'alignSelf'
  ];
  
  const marginStyles: any = {};
  const textStyles: any = {};
  
  Object.keys(flattened).forEach(key => {
    if (marginKeys.includes(key)) {
      marginStyles[key] = flattened[key];
    } else {
      textStyles[key] = flattened[key];
    }
  });
  
  return { marginStyles, textStyles };
};

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  style,
  speed = 30,
  delay = 1500,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const translateX = useSharedValue(0);

  const { marginStyles, textStyles } = extractMarginStyles(style);

  // Set line-height and vertical padding to prevent descender clipping (bottom clipping)
  const finalTextStyle = {
    ...textStyles,
    includeFontPadding: false,
    textAlignVertical: 'center',
    lineHeight: textStyles.fontSize ? Math.round(textStyles.fontSize * 1.3) : undefined,
    paddingVertical: 2,
  };

  const onContainerLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  const shouldAnimate = textWidth > containerWidth && containerWidth > 0;

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.value = 0;

    if (!shouldAnimate) {
      return;
    }

    const distance = textWidth + 40; // distance to offset for seamless loop (text + gap)
    const duration = (distance / speed) * 1000;

    // Wait before scrolling so short glimpses of a title don't jump around.
    const timeout = setTimeout(() => {
      translateX.value = withRepeat(
        withTiming(-distance, {
          duration,
          easing: Easing.linear,
        }),
        -1, // infinite loop
        false // do not reverse, jump back instantly
      );
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimation(translateX);
    };
  }, [shouldAnimate, textWidth, containerWidth, text, delay, speed]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  return (
    <View style={[styles.container, marginStyles]} onLayout={onContainerLayout}>
      {/* Hidden measurement view: ScrollView horizontal allows unconstrained single line width measurement */}
      <View style={styles.hiddenMeasureContainer} pointerEvents="none">
        <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <Text
            key={text}
            style={finalTextStyle}
            onLayout={(e) => {
              setTextWidth(e.nativeEvent.layout.width);
            }}
          >
            {text}
          </Text>
        </ScrollView>
      </View>

      <View style={styles.contentWrapper}>
        <Animated.View style={[shouldAnimate ? animatedStyle : null, styles.row]}>
          <Text 
            style={finalTextStyle} 
            numberOfLines={1}
          >
            {text}
          </Text>
          {shouldAnimate && (
            <Text style={[finalTextStyle, { marginLeft: 40 }]} numberOfLines={1}>
              {text}
            </Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    position: 'relative',
  },
  contentWrapper: {
    flexDirection: 'row',
    width: '100%',
    overflow: 'hidden',
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hiddenMeasureContainer: {
    position: 'absolute',
    opacity: 0,
    top: -9999,
    left: -9999,
  }
});

