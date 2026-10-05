import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const { Lighting } = NativeModules;

/** Loudness envelope of a track: `energy` (full band) and `low` (bass). */
export interface WaveformData {
  hz: number;
  duration: number;
  energy: number[];
  low: number[];
}

/** Colors pulled from the cover art. */
export interface CoverPalette {
  glow: string;
  wash: string;
  rim: string;
  dark: string;
}

const WAVE_HZ = 40;

const waveformCache = new Map<string, WaveformData>();
const paletteCache = new Map<string, CoverPalette>();

function cacheKey(track: any): string | null {
  const raw = track?.youtube_id || track?.id || track?.file_path;
  if (!raw) return null;
  const key = String(raw).replace(/[^A-Za-z0-9_-]/g, '').slice(-48);
  return key || null;
}

function waveformDir(): string | null {
  return FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}yump3_waveforms/` : null;
}

async function readDiskWaveform(file: string): Promise<WaveformData | null> {
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(file)) as WaveformData;
    return parsed?.energy?.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeDiskWaveform(dir: string, file: string, data: WaveformData) {
  FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    .then(() => FileSystem.writeAsStringAsync(file, JSON.stringify(data)))
    .catch(() => {});
}

/**
 * Decodes the local audio file once and returns its loudness envelope.
 * Results are cached in memory and on disk, so replaying a song is instant.
 */
export async function getWaveform(track: any): Promise<WaveformData | null> {
  if (!Lighting?.extractWaveform || !track?.file_path) return null;
  const key = cacheKey(track);
  if (!key) return null;

  const cached = waveformCache.get(key);
  if (cached) return cached;

  const dir = waveformDir();
  const file = dir ? `${dir}${key}.json` : null;
  if (file) {
    const stored = await readDiskWaveform(file);
    if (stored) {
      waveformCache.set(key, stored);
      return stored;
    }
  }

  try {
    const res = await Lighting.extractWaveform(track.file_path, WAVE_HZ);
    const data: WaveformData = {
      hz: Number(res?.hz) || WAVE_HZ,
      duration: Number(res?.duration) || 0,
      energy: Array.from(res?.energy || [], Number),
      low: Array.from(res?.low || [], Number),
    };
    if (data.energy.length === 0) return null;
    waveformCache.set(key, data);
    if (file && dir) writeDiskWaveform(dir, file, data);
    return data;
  } catch (e) {
    return null;
  }
}

/** Extracts the cover palette from the locally saved artwork (if any). */
export async function getCoverPalette(track: any): Promise<CoverPalette | null> {
  if (!Lighting?.extractColors || !track?.thumbnail_path) return null;
  const key = cacheKey(track);
  if (!key) return null;

  const cached = paletteCache.get(key);
  if (cached) return cached;

  try {
    const res = await Lighting.extractColors(track.thumbnail_path);
    const vibrant = String(res?.vibrant || '');
    const dominant = String(res?.dominant || '');
    const colors: CoverPalette = {
      glow: vibrant || dominant,
      wash: dominant || vibrant,
      rim: String(res?.light || ''),
      dark: String(res?.dark || ''),
    };
    paletteCache.set(key, colors);
    return colors;
  } catch (e) {
    return null;
  }
}

/* --------------------------- setting + events --------------------------- */

const SETTING_KEY = 'yump3_stage_light';

let stageLightEnabled = true;
const stageLightListeners = new Set<(enabled: boolean) => void>();

export function getStageLightEnabled(): boolean {
  return stageLightEnabled;
}

export function subscribeStageLight(listener: (enabled: boolean) => void): () => void {
  stageLightListeners.add(listener);
  return () => {
    stageLightListeners.delete(listener);
  };
}

export async function loadStageLightEnabled(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(SETTING_KEY);
    stageLightEnabled = stored !== 'false';
  } catch (e) {
    stageLightEnabled = true;
  }
  stageLightListeners.forEach((listener) => listener(stageLightEnabled));
  return stageLightEnabled;
}

export async function setStageLightEnabled(enabled: boolean): Promise<void> {
  stageLightEnabled = enabled;
  stageLightListeners.forEach((listener) => listener(enabled));
  await AsyncStorage.setItem(SETTING_KEY, enabled ? 'true' : 'false').catch(() => {});
}
