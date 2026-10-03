import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../context/AlertContext';

const TOAST_DURATION = 2200;

const ICONS: Record<string, { name: any; color: string }> = {
  success: { name: 'checkmark-circle', color: palette.accent },
  error: { name: 'alert-circle', color: palette.danger },
  info: { name: 'information-circle', color: '#4fc3f7' },
};

export const Toast: React.FC = () => {
  const { toast, hideToast } = useAlert();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => hideToast(), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  if (!toast) return null;

  const icon = ICONS[toast.type] || ICONS.info;

  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(160)}
      style={[styles.wrapper, { top: insets.top + 12 }]}
    >
      <View style={styles.toast}>
        <Ionicons name={icon.name} size={18} color={icon.color} />
        <Text style={styles.text} numberOfLines={2}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10000,
    paddingHorizontal: 20,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 32, 42, 0.98)',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
    flexShrink: 1,
  },
});
