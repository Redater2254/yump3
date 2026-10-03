import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

const { AudioEffects } = NativeModules;
const KEY = 'yump3_audio_effects';

export interface AudioEffectsSettings {
  enabled: boolean;
  /** Preset index, or null when using custom band levels. */
  preset: number | null;
  /** Per-band gain in millibels. */
  bandLevels: number[];
  /** 0..1000 */
  bass: number;
  /** 0..1000 (3D / virtualizer) */
  virtualizer: number;
  /** 0..2000 mB */
  loudness: number;
  /** Disable fades/rate ramps and DSP for untouched output. */
  bitPerfect: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioEffectsSettings = {
  enabled: false,
  preset: null,
  bandLevels: [],
  bass: 0,
  virtualizer: 0,
  loudness: 0,
  bitPerfect: false,
};

export interface AudioEffectsBand {
  index: number;
  centerFreq: number;
  level: number;
}

export interface AudioEffectsInfo {
  available: boolean;
  sessionId: number;
  numBands?: number;
  levelMin?: number;
  levelMax?: number;
  bands?: AudioEffectsBand[];
  presets?: { index: number; name: string }[];
}

export async function loadAudioSettings(): Promise<AudioEffectsSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    // ignore
  }
  return { ...DEFAULT_AUDIO_SETTINGS };
}

export async function saveAudioSettings(settings: AudioEffectsSettings) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) {
    // ignore
  }
}

export async function getAudioEffectsInfo(): Promise<AudioEffectsInfo> {
  if (!AudioEffects) return { available: false, sessionId: 0 };
  try {
    const info = await AudioEffects.getInfo();
    return {
      available: !!info?.available,
      sessionId: Number(info?.sessionId || 0),
      numBands: Number(info?.numBands || 0),
      levelMin: Number(info?.levelMin ?? -1500),
      levelMax: Number(info?.levelMax ?? 1500),
      bands: info?.bands || [],
      presets: info?.presets || [],
    };
  } catch (e) {
    return { available: false, sessionId: 0 };
  }
}

/** Pushes the stored settings to the native effects. */
export async function applyAudioSettings(settings: AudioEffectsSettings): Promise<boolean> {
  if (!AudioEffects) return false;
  try {
    const ok = await AudioEffects.setEnabled(!!settings.enabled);
    if (!ok) return false;
    if (settings.preset !== null && settings.preset !== undefined) {
      await AudioEffects.setPreset(settings.preset);
    } else if (Array.isArray(settings.bandLevels)) {
      for (let i = 0; i < settings.bandLevels.length; i++) {
        await AudioEffects.setBandLevel(i, settings.bandLevels[i]);
      }
    }
    await AudioEffects.setBassBoost(settings.bass || 0);
    await AudioEffects.setVirtualizer(settings.virtualizer || 0);
    await AudioEffects.setLoudness(settings.loudness || 0);
    return true;
  } catch (e) {
    return false;
  }
}

export async function releaseAudioEffects() {
  try {
    await AudioEffects?.release();
  } catch (e) {
    // ignore
  }
}
