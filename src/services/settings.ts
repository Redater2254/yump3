import AsyncStorage from '@react-native-async-storage/async-storage';

const QUALITY_KEY = 'yump3_audio_quality';

/** yt-dlp --audio-quality values for mp3 ("best" = VBR 0, otherwise a bitrate). */
export const AUDIO_QUALITY_OPTIONS = [
  { label: '자동 (최고 VBR)', value: 'best' },
  { label: '320 kbps', value: '320K' },
  { label: '192 kbps', value: '192K' },
  { label: '128 kbps', value: '128K' },
] as const;

export type AudioQuality = (typeof AUDIO_QUALITY_OPTIONS)[number]['value'];

export async function getAudioQuality(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(QUALITY_KEY)) || 'best';
  } catch (e) {
    return 'best';
  }
}

export async function setAudioQuality(value: string) {
  try {
    await AsyncStorage.setItem(QUALITY_KEY, value);
  } catch (e) {
    // ignore
  }
}

/** Maps the setting to the value passed to yt-dlp. */
export function toYtDlpQuality(value: string): string {
  return !value || value === 'best' ? '0' : value;
}
