import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules } from 'react-native';

const { ApkInstaller } = NativeModules;

const RELEASES_API = 'https://api.github.com/repos/Redater2254/yump3/releases/latest';
const APK_NAME = 'yump3.apk';

export interface UpdateInfo {
  hasUpdate: boolean;
  installed: string;
  latest?: string;
  notes?: string;
  size?: number;
  apkUrl?: string;
  error?: string;
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

/** Downloads the release APK into the cache directory and returns its file URI. */
export async function downloadUpdate(apkUrl: string, onProgress?: (p: number) => void): Promise<string> {
  const target = `${FileSystem.cacheDirectory}yump3-update.apk`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch (e) {
    // ignore
  }
  const resumable = FileSystem.createDownloadResumable(
    apkUrl,
    target,
    { headers: { 'User-Agent': 'yump3-updater' } },
    (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    }
  );
  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error('다운로드에 실패했습니다.');
  return result.uri;
}

/** Opens the system installer. Returns false when the user must allow installs first. */
export async function installUpdate(fileUri: string): Promise<boolean> {
  if (!ApkInstaller) throw new Error('이 빌드에서는 자동 설치를 지원하지 않습니다.');
  const canInstall = await ApkInstaller.canInstall();
  if (!canInstall) {
    await ApkInstaller.openInstallSettings();
    return false;
  }
  await ApkInstaller.install(fileUri);
  return true;
}
