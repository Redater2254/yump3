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

export interface StageLightSettings {
  enabled: boolean;
  /** Overall brightness multiplier (0.5 - 1.6). */
  intensity: number;
  /** Glow spread multiplier (0.8 - 1.4). */
  size: number;
  /** How strongly the light reacts to the music (0 - 1.5). */
  pulse: number;
}

export const DEFAULT_STAGE_LIGHT: StageLightSettings = {
  enabled: true,
  intensity: 1,
  size: 1,
  pulse: 1,
};

/** Presets shown in the lighting settings sheet. */
export const STAGE_LIGHT_PRESETS: { id: string; label: string; settings: Partial<StageLightSettings> }[] = [
  { id: 'soft', label: '은은하게', settings: { intensity: 0.65, size: 0.9, pulse: 0.65 } },
  { id: 'basic', label: '기본', settings: { intensity: 1, size: 1, pulse: 1 } },
  { id: 'vivid', label: '화려하게', settings: { intensity: 1.4, size: 1.25, pulse: 1.4 } },
];

const SETTING_KEY = 'yump3_stage_light';

let stageLightSettings: StageLightSettings = { ...DEFAULT_STAGE_LIGHT };
const stageLightListeners = new Set<(settings: StageLightSettings) => void>();

function emitStageLight() {
  stageLightListeners.forEach((listener) => listener(stageLightSettings));
}

export function getStageLightSettings(): StageLightSettings {
  return stageLightSettings;
}

export function subscribeStageLight(
  listener: (settings: StageLightSettings) => void
): () => void {
  stageLightListeners.add(listener);
  return () => {
    stageLightListeners.delete(listener);
  };
}

export async function loadStageLightSettings(): Promise<StageLightSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTING_KEY);
    if (stored === 'true' || stored === 'false') {
      // Older builds stored a plain boolean.
      stageLightSettings = { ...DEFAULT_STAGE_LIGHT, enabled: stored === 'true' };
    } else if (stored) {
      stageLightSettings = { ...DEFAULT_STAGE_LIGHT, ...JSON.parse(stored) };
    }
  } catch (e) {
    stageLightSettings = { ...DEFAULT_STAGE_LIGHT };
  }
  emitStageLight();
  return stageLightSettings;
}

export async function updateStageLightSettings(
  patch: Partial<StageLightSettings>
): Promise<StageLightSettings> {
  stageLightSettings = { ...stageLightSettings, ...patch };
  emitStageLight();
  await AsyncStorage.setItem(SETTING_KEY, JSON.stringify(stageLightSettings)).catch(() => {});
  return stageLightSettings;
}
