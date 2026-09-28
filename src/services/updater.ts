import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { ApkUpdater, ApkInstaller } = NativeModules;

const RELEASES_API = 'https://api.github.com/repos/Redater2254/yump3/releases/latest';
const APK_NAME = 'yump3.apk';
const DOWNLOAD_ID_KEY = 'yump3_update_download_id';

export interface UpdateInfo {
  hasUpdate: boolean;
  installed: string;
  latest?: string;
  notes?: string;
  size?: number;
  apkUrl?: string;
  error?: string;
}

export type UpdateDownloadStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'successful'
  | 'failed'
  | 'unknown';

export interface UpdateDownloadState {
  id: number;
  status: UpdateDownloadStatus;
  progress: number; // 0..1
  downloaded: number;
  total: number;
  localUri?: string | null;
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

function mapStatus(code: number): UpdateDownloadStatus {
  switch (code) {
    case 1:
      return 'pending';
    case 2:
      return 'running';
    case 4:
      return 'paused';
    case 8:
      return 'successful';
    case 16:
      return 'failed';
    default:
      return 'unknown';
  }
}

/**
 * Starts a system (DownloadManager) download so it keeps running in the
 * background with a progress notification, even after leaving the app.
 */
export async function startUpdateDownload(info: UpdateInfo): Promise<number> {
  if (!ApkUpdater || !info.apkUrl) {
    throw new Error('이 빌드에서는 백그라운드 업데이트를 지원하지 않습니다.');
  }
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    try {
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
    } catch (e) {
      // notification permission is optional; the download still works
    }
  }
  const id = await ApkUpdater.startDownload(
    info.apkUrl,
    'yump3-update.apk',
    'yump3 업데이트',
    `v${info.latest} 다운로드 중...`
  );
  await AsyncStorage.setItem(DOWNLOAD_ID_KEY, String(id));
  return Number(id);
}

/** Current state of the background update download (null when none). */
export async function getUpdateDownloadState(): Promise<UpdateDownloadState | null> {
  if (!ApkUpdater) return null;
  let id: number;
  try {
    id = Number(await AsyncStorage.getItem(DOWNLOAD_ID_KEY));
  } catch (e) {
    return null;
  }
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const res = await ApkUpdater.query(id);
    const total = Number(res?.total || 0);
    const downloaded = Number(res?.downloaded || 0);
    return {
      id,
      status: mapStatus(Number(res?.status ?? -1)),
      progress: total > 0 ? Math.max(0, Math.min(1, downloaded / total)) : 0,
      downloaded,
      total,
      localUri: res?.localUri ?? null,
    };
  } catch (e) {
    return null;
  }
}

export async function clearUpdateDownload(removeFile = false) {
  try {
    const id = Number(await AsyncStorage.getItem(DOWNLOAD_ID_KEY));
    if (removeFile && ApkUpdater && Number.isFinite(id) && id > 0) {
      try {
        await ApkUpdater.remove(id);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }
  await AsyncStorage.removeItem(DOWNLOAD_ID_KEY);
}

/** Opens the system installer for the finished background download. */
export async function installDownloadedUpdate(id: number): Promise<boolean> {
  if (!ApkInstaller || !ApkUpdater) {
    throw new Error('이 빌드에서는 자동 설치를 지원하지 않습니다.');
  }
  const canInstall = await ApkInstaller.canInstall();
  if (!canInstall) {
    await ApkInstaller.openInstallSettings();
    return false;
  }
  await ApkUpdater.install(id);
  return true;
}
