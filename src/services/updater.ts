import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { ApkUpdater, ApkInstaller } = NativeModules;

const RELEASES_API = 'https://api.github.com/repos/Redater2254/yump3/releases/latest';
const APK_NAME = 'yump3.apk';
const UPDATE_VERSION_KEY = 'yump3_update_version';

export interface UpdateInfo {
  hasUpdate: boolean;
  installed: string;
  latest?: string;
  notes?: string;
  size?: number;
  apkUrl?: string;
  error?: string;
}

export interface UpdateDownloadState {
  running: boolean;
  progress: number; // 0..1
  downloaded: number;
  total: number;
  error?: string | null;
  ready: boolean;
}

export function getInstalledVersion(): string {
  return Constants.expoConfig?.version || '0.0.0';
}

/** Reads the real versionName from the native build (falls back to the config). */
export async function loadInstalledVersion(): Promise<string> {
  try {
    if (ApkInstaller?.getVersionName) {
      const v = await ApkInstaller.getVersionName();
      if (v) return String(v);
    }
  } catch (e) {
    // ignore
  }
  return getInstalledVersion();
}

function parseVersion(v?: string | null): number[] | null {
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(installed: string, latest: string): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

/** Asks GitHub for the latest release and compares it with the installed version. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const installed = await loadInstalledVersion();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const tag = String(data.tag_name || '').replace(/^v/, '').trim();
    const assets: any[] = data.assets || [];
    const asset = assets.find((a) => a.name === APK_NAME) || assets[0];
    if (!tag || !asset) return { hasUpdate: false, installed };
    return {
      hasUpdate: isNewer(installed, tag),
      installed,
      latest: tag,
      notes: String(data.body || ''),
      size: asset.size,
      apkUrl: asset.browser_download_url,
    };
  } catch (e: any) {
    return { hasUpdate: false, installed, error: String(e?.message || e) };
  }
}

async function ensureNotificationPermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  try {
    await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
  } catch (e) {
    // download still works without the notification
  }
}

/**
 * Starts the APK download in a foreground service so it keeps running in the
 * background with a progress notification.
 */
export async function startUpdateDownload(info: UpdateInfo): Promise<void> {
  if (!ApkUpdater || !info.apkUrl) {
    throw new Error('이 빌드에서는 백그라운드 업데이트를 지원하지 않습니다.');
  }
  await ensureNotificationPermission();
  try {
    if (info.latest) await AsyncStorage.setItem(UPDATE_VERSION_KEY, info.latest);
  } catch (e) {
    // ignore
  }
  await ApkUpdater.start(info.apkUrl, info.latest || '');
}

/** Current state of the background update download. */
export async function getUpdateDownloadState(): Promise<UpdateDownloadState> {
  const empty: UpdateDownloadState = {
    running: false,
    progress: 0,
    downloaded: 0,
    total: 0,
    ready: false,
  };
  if (!ApkUpdater) return empty;
  try {
    const res = await ApkUpdater.status();
    const total = Number(res?.total || 0);
    const downloaded = Number(res?.downloaded || 0);
    const percent = Number(res?.progress ?? -1);
    const running = !!res?.running;
    const error = res?.error ? String(res.error) : null;
    const path = res?.path ? String(res.path) : null;

    let ready = false;
    if (!running && !error && path) {
      // Only treat a leftover file as an update when it is newer than the
      // installed version; otherwise clean it up (prevents false "완료" notices).
      const stored = await AsyncStorage.getItem(UPDATE_VERSION_KEY);
      const installed = await loadInstalledVersion();
      if (stored && isNewer(installed, stored)) {
        ready = true;
      } else {
        try {
          await AsyncStorage.removeItem(UPDATE_VERSION_KEY);
        } catch (e) {
          // ignore
        }
        try {
          await ApkUpdater.clear();
        } catch (e) {
          // ignore
        }
      }
    }

    return {
      running,
      progress:
        total > 0
          ? Math.max(0, Math.min(1, downloaded / total))
          : percent >= 0
            ? Math.max(0, Math.min(1, percent / 100))
            : 0,
      downloaded,
      total,
      error,
      ready,
    };
  } catch (e) {
    return empty;
  }
}

export async function cancelUpdateDownload(): Promise<void> {
  try {
    await ApkUpdater?.cancel();
  } catch (e) {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(UPDATE_VERSION_KEY);
  } catch (e) {
    // ignore
  }
  try {
    await ApkUpdater?.clear();
  } catch (e) {
    // ignore
  }
}

/** Opens the system installer for the downloaded update. */
export async function installDownloadedUpdate(): Promise<boolean> {
  if (!ApkInstaller || !ApkUpdater) {
    throw new Error('이 빌드에서는 자동 설치를 지원하지 않습니다.');
  }
  const canInstall = await ApkInstaller.canInstall();
  if (!canInstall) {
    await ApkInstaller.openInstallSettings();
    return false;
  }
  await ApkUpdater.install();
  return true;
}
