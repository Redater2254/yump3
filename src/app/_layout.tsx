import React, { useEffect } from 'react';
import { Slot } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DownloadProvider } from '../context/DownloadContext';
import { AlertProvider } from '../context/AlertContext';
import { CustomAlert } from '../components/CustomAlert';
import { Toast } from '../components/Toast';
import { YtDlpBootstrap } from '../components/YtDlpBootstrap';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { loadHapticsSetting } from '../services/haptics';

export default function RootLayout() {
  useEffect(() => {
    loadHapticsSetting();

    // Persist fatal JS errors so they can be shown on the next launch (no adb needed).
    const errorUtils: any = (globalThis as any).ErrorUtils;
    if (errorUtils?.setGlobalHandler) {
      const previous = errorUtils.getGlobalHandler?.();
      errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        try {
          AsyncStorage.setItem(
            'yump3_last_error',
            `${String(error?.message || error)}\n\n${String(error?.stack || '')}`
          ).catch(() => {});
        } catch (e) {
          // ignore
        }
        if (previous) previous(error, isFatal);
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AlertProvider>
            <DownloadProvider>
              <Slot />
              <YtDlpBootstrap />
              <CustomAlert />
              <Toast />
            </DownloadProvider>
          </AlertProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
