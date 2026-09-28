import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'yump3_haptics_enabled';

let enabled = true;

export async function loadHapticsSetting() {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    enabled = value !== 'false';
  } catch (e) {
    enabled = true;
  }
  return enabled;
}

export async function setHapticsEnabled(value) {
  enabled = value;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch (e) {
    // ignore
  }
}

export function isHapticsEnabled() {
  return enabled;
}

function run(fn) {
  if (!enabled) return;
  try {
    fn().catch(() => {});
  } catch (e) {
    // Haptics unsupported (web/older devices) - ignore
  }
}

export function hapticLight() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticMedium() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticSelection() {
  run(() => Haptics.selectionAsync());
}

export function hapticSuccess() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticError() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
