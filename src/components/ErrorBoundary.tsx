import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const LAST_ERROR_KEY = 'yump3_last_error';
// Written by the native CrashLogger (MainApplication) on the previous run.
const NATIVE_CRASH_FILE = 'file:///storage/emulated/0/Android/media/com.yump3/yump3/crash.txt';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time JS errors and shows them on screen instead of crashing,
 * so the app can be diagnosed on a device without adb/logcat. Also surfaces the
 * last fatal JS error captured by the global handler on the next launch.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  async componentDidMount() {
    if (this.state.error) return;
    try {
      const saved = await AsyncStorage.getItem(LAST_ERROR_KEY);
      if (saved) {
        await AsyncStorage.removeItem(LAST_ERROR_KEY);
        this.setState({ error: new Error(saved) });
        return;
      }
    } catch (e) {
      // ignore
    }

    // Surface a native crash captured on the previous launch, if present.
    try {
      const info = await FileSystem.getInfoAsync(NATIVE_CRASH_FILE);
      if (info.exists) {
        const text = await FileSystem.readAsStringAsync(NATIVE_CRASH_FILE);
        await FileSystem.deleteAsync(NATIVE_CRASH_FILE, { idempotent: true });
        this.setState({ error: new Error(text) });
      }
    } catch (e) {
      // ignore
    }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[yump3] Uncaught render error:', error, info);
  }

  render() {
    if (this.state.error) {
      const err: any = this.state.error;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>yump3 오류</Text>
          <Text style={styles.subtitle}>이 내용을 스크린샷으로 보내주세요.</Text>
          <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.msg} selectable>
              {String(err?.message || err)}
              {'\n\n'}
              {String(err?.stack || '')}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children as any;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg, paddingTop: 60, paddingHorizontal: 16 },
  title: { color: palette.danger, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: palette.textMuted, fontSize: 12, marginBottom: 12 },
  box: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  msg: { color: palette.text, fontSize: 12, fontFamily: 'monospace' },
});
