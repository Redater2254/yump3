import { NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getAudioQuality, toYtDlpQuality } from './settings';

const { YtDlp } = NativeModules;

const emitter = YtDlp ? new NativeEventEmitter(YtDlp) : null;

export const isYtDlpAvailable = !!YtDlp;

// App-specific external storage (visible to file managers, no permission needed).
export const LIBRARY_DIR = 'file:///storage/emulated/0/Android/media/com.yump3/yump3/';
export const LIBRARY_DIR_RAW = '/storage/emulated/0/Android/media/com.yump3/yump3';

let initPromise = null;
let lastInitError = null;

/** Initialize the bundled yt-dlp + ffmpeg once. */
export async function initYtDlp() {
  if (!YtDlp) return false;
  if (!initPromise) {
    initPromise = YtDlp.init().then(() => true).catch((e) => {
      lastInitError = String(e?.message || e);
      initPromise = null;
      return false;
    });
  }
  return initPromise;
}

export function getLastInitError() {
  return lastInitError;
}

/** Search YouTube via yt-dlp ytsearch. Returns raw yt-dlp entries. */
export async function ytSearch(query, limit = 10) {
  await initYtDlp();
  const out = await YtDlp.search(query, limit);
  const data = JSON.parse(out);
  const entries = data.entries || (data.id ? [data] : []);
  return entries.filter(Boolean);
}

function mapEntry(entry) {
  const rawArtist = entry.uploader || entry.channel || entry.artist || 'Unknown Artist';
  const suffixTopic = / - (topic|주제)$/i.test(rawArtist);
  // Topic/art tracks carry music metadata (artist/album/track); MVs and user
  // uploads do not. The channel name no longer always ends in " - Topic" in
  // yt-dlp output, so metadata presence is the reliable signal.
  const hasMusicMeta = !!(entry.artist && entry.album && entry.track);
  const isTopic = hasMusicMeta || suffixTopic;
  const artist =
    entry.artist || (suffixTopic ? rawArtist.replace(/ - (topic|주제)$/i, '') : rawArtist);
  const fallbackThumb = `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
  return {
    youtube_id: entry.id,
    // Prefer the music tag ("Chrome") over the video title ("... Official MV").
    title: entry.track || entry.title || 'Unknown Title',
    artist,
    album: entry.album || null,
    // Kept so the "official audio" filter still works after the suffix strip.
    is_topic: isTopic,
    channel_verified: entry.channel_is_verified === true,
    duration: entry.duration || 0,
    thumbnail_url:
      entry.thumbnail ||
      (entry.thumbnails && entry.thumbnails.length ? entry.thumbnails[entry.thumbnails.length - 1].url : null) ||
      fallbackThumb,
  };
}

/** Search and normalize entries into app track shape. */
export async function searchTracks(query, limit = 10) {
  const entries = await ytSearch(query, limit);
  return entries.map(mapEntry);
}

/**
 * Deep search for album-art ("Topic") tracks. Unlike [searchTracks] this makes
 * yt-dlp extract every candidate (slower) and keeps only entries with
 * artist/album/track metadata, which filters out MVs, lyric videos and covers.
 * Returns an empty list when the native method is unavailable.
 */
export async function searchArtTracks(query, limit = 8) {
  if (!YtDlp?.searchArtTracks) return [];
  await initYtDlp();
  const out = await YtDlp.searchArtTracks(query, limit);
  const entries = String(out || '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
  return entries.map(mapEntry);
}

/**
 * Flat metadata for a single video URL. Unlike a `ytsearch<id>` lookup this
 * always returns the requested video, so direct URL/ID adds get real names.
 */
export async function getVideoInfo(url) {
  if (!YtDlp) return null;
  const inited = await initYtDlp();
  if (!inited) return null;
  const out = await YtDlp.playlistInfo(url, 1);
  const data = JSON.parse(out);
  const entry = data.entries && data.entries.length ? data.entries[0] : data;
  if (!entry || !entry.id) return null;
  return mapEntry(entry);
}

/** Playlist metadata via yt-dlp. Returns { title, tracks }. */
export async function getPlaylistInfo(url, limit = 100) {
  if (!YtDlp) throw new Error('downloader unavailable');
  const inited = await initYtDlp();
  if (!inited) throw new Error('downloader init failed');
  const out = await YtDlp.playlistInfo(url, limit);
  const data = JSON.parse(out);
  const entries = (data.entries || []).filter(Boolean);
  return {
    title: data.title || data.playlist_title || null,
    tracks: entries.map(mapEntry),
  };
}

async function ensureLibraryDir() {
  try {
    const info = await FileSystem.getInfoAsync(LIBRARY_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(LIBRARY_DIR, { intermediates: true });
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Deletes leftovers from a previous (possibly failed) attempt for this video.
 * Without this, yt-dlp sees an existing mp3 and skips the download, which also
 * skips post-processing (embedded cover art and metadata).
 */
async function removeExistingArtifacts(youtubeId) {
  try {
    const files = await FileSystem.readDirectoryAsync(LIBRARY_DIR);
    const stale = files.filter((f) => f.includes(`[${youtubeId}]`));
    for (const f of stale) {
      await FileSystem.deleteAsync(`${LIBRARY_DIR}${f}`, { idempotent: true });
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Download + transcode a video to mp3 with embedded cover/tags, then resolve
 * the resulting local file path.
 */
export async function downloadTrack(youtubeId, onProgress) {
  await initYtDlp();
  await ensureLibraryDir();
  await removeExistingArtifacts(youtubeId);

  let sub;
  if (emitter && onProgress) {
    sub = emitter.addListener('YtDlpProgress', (e) => {
      if (!e || e.id !== youtubeId) return;
      onProgress(e);
    });
  }

  let result = '';
  try {
    const url = `https://www.youtube.com/watch?v=${youtubeId}`;
    const quality = toYtDlpQuality(await getAudioQuality());
    result = await YtDlp.download(url, LIBRARY_DIR_RAW, youtubeId, quality);
  } finally {
    if (sub) sub.remove();
  }

  // Resolve the output file: "<title> [<youtubeId>].mp3"
  const files = await FileSystem.readDirectoryAsync(LIBRARY_DIR);
  const match = files.find((f) => f.includes(`[${youtubeId}]`) && f.toLowerCase().endsWith('.mp3'));
  if (!match) {
    throw new Error('Downloaded file not found.');
  }
  // Cover art saved next to the mp3 (avoids the network delay in the player).
  const thumbMatch = files.find(
    (f) => f.includes(`[${youtubeId}]`) && /\.(jpe?g|png|webp)$/i.test(f)
  );

  // yt-dlp prints "YMP3META|field|value" lines (see the native download method).
  // This is the real metadata of the downloaded video, so the library entry is
  // correct even when the caller only had a placeholder.
  const meta = { title: '', track: '', artist: '', uploader: '' };
  let duration = 0;
  for (const line of String(result || '').split('\n')) {
    if (!line.startsWith('YMP3META|')) continue;
    const parts = line.split('|');
    const field = parts[1];
    const value = parts.slice(2).join('|').trim();
    if (field === 'duration') {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) duration = parsed;
    } else if (field in meta) {
      meta[field] = value === 'NA' ? '' : value;
    }
  }
  if (duration === 0) {
    // Fallback for an older native build that printed the duration alone.
    try {
      const lines = String(result || '').trim().split('\n').filter(Boolean);
      const parsed = parseFloat(lines[lines.length - 1]);
      if (Number.isFinite(parsed) && parsed > 0) duration = parsed;
    } catch (e) {
      // keep 0
    }
  }

  return {
    filePath: `${LIBRARY_DIR}${match}`,
    duration,
    thumbnailPath: thumbMatch ? `${LIBRARY_DIR}${thumbMatch}` : null,
    title: meta.track || meta.title,
    artist: meta.artist || meta.uploader,
  };
}

export async function cancelDownload(youtubeId) {
  if (!YtDlp) return false;
  return YtDlp.cancel(youtubeId);
}

export async function updateYtDlp() {
  if (!YtDlp) return false;
  return YtDlp.update();
}

/** Current bundled yt-dlp version, e.g. "2025.09.05". */
export async function getYtDlpVersion() {
  if (!YtDlp) return null;
  await initYtDlp();
  return YtDlp.getVersion();
}

/** yt-dlp releases are date-based; treat anything older than 60 days as outdated. */
export function isYtDlpOutdated(version, maxAgeDays = 60) {
  if (!version) return false;
  const m = String(version).match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return false;
  const released = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return (Date.now() - released) / 86400000 > maxAgeDays;
}

/** Maps raw yt-dlp/Android errors to a short, actionable Korean message. */
export function friendlyYtDlpError(raw) {
  const s = String(raw || '');
  if (/older than 90 days|yt-dlp version|outdated/i.test(s)) {
    return 'yt-dlp가 오래되었습니다. My Page의 "yt-dlp 업데이트"를 눌러주세요.';
  }
  if (/not initialized|not been initialized|instance/i.test(s)) {
    return '다운로더 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.';
  }
  if (/Sign in to confirm|not a bot|bot check/i.test(s)) {
    return 'YouTube가 봇 확인을 요구하고 있습니다. 잠시 후 다시 시도해주세요.';
  }
  if (/Unable to extract|nsig|player|Video unavailable|Private video/i.test(s)) {
    return 'YouTube 영상 추출에 실패했습니다. yt-dlp 업데이트 후 다시 시도해주세요.';
  }
  if (/HTTP Error|urlopen|Connection|timed out|network/i.test(s)) {
    return '네트워크 오류입니다. 연결을 확인하고 다시 시도해주세요.';
  }
  return '다운로드에 실패했습니다. 자세한 원인은 항목을 탭해 확인하세요.';
}

/**
 * Startup bootstrap: initializes the bundled runtime, runs an integrity check,
 * compares against the latest release and updates when needed. Reports progress
 * (0..1) and a status message so the UI can show a progress bar.
 */
/** Runs `yt-dlp --version` for real so a corrupt/partial extraction is caught
 * before the first download. */
export async function selfCheckYtDlp() {
  if (!YtDlp) throw new Error('downloader unavailable');
  const version = await YtDlp.selfCheck();
  return String(version || '').trim();
}

const LATEST_KEY = 'yump3_ytdlp_latest';
const LATEST_AT_KEY = 'yump3_ytdlp_latest_at';

/** Latest yt-dlp release version from GitHub, cached for 24h. null when unknown. */
export async function fetchLatestYtDlpVersion() {
  try {
    const at = Number(await AsyncStorage.getItem(LATEST_AT_KEY)) || 0;
    const cached = await AsyncStorage.getItem(LATEST_KEY);
    if (cached && Date.now() - at < 24 * 60 * 60 * 1000) return cached;
  } catch (e) {
    // ignore
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const tag = String(json?.tag_name || '').replace(/^v/, '').trim();
    if (tag) {
      AsyncStorage.setItem(LATEST_KEY, tag).catch(() => {});
      AsyncStorage.setItem(LATEST_AT_KEY, String(Date.now())).catch(() => {});
    }
    return tag || null;
  } catch (e) {
    return null;
  }
}

function versionScore(v) {
  const m = String(v || '').match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : 0;
}

export function isVersionOlder(current, latest) {
  const a = versionScore(current);
  const b = versionScore(latest);
  return a > 0 && b > 0 && a < b;
}

async function runIntegrityCheck() {
  try {
    return await selfCheckYtDlp();
  } catch (e) {
    return null;
  }
}

async function runUpdateStep(report, version, latest) {
  const needsUpdate = !version || (latest ? isVersionOlder(version, latest) : isYtDlpOutdated(version));
  if (!needsUpdate) return { version, updateError: null };

  report(0.7, 'yt-dlp 업데이트 중...');
  let updateError = null;
  try {
    await updateYtDlp();
  } catch (e) {
    updateError = String(e?.message || e);
  }
  report(0.9, '무결성 재검사 중...');
  return { version: await runIntegrityCheck(), updateError };
}

/**
 * Startup bootstrap: initializes the bundled runtime, runs an integrity check,
 * compares against the latest release and updates when needed. Reports progress
 * (0..1) and a status message so the UI can show a progress bar.
 */
export async function runYtDlpBootstrap(onProgress) {
  const report = (progress, message) => onProgress?.({ progress, message });

  if (!YtDlp) {
    report(1, '이 기기에서는 다운로더를 사용할 수 없습니다.');
    return { ok: false, reason: 'unavailable', error: 'YtDlp native module missing' };
  }

  report(0.08, '다운로더 준비 중...');
  const inited = await initYtDlp();
  if (!inited) {
    report(1, '다운로더를 준비하지 못했습니다.');
    return { ok: false, reason: 'init', error: getLastInitError() || 'init failed' };
  }
  report(0.3, '다운로더 준비 완료');

  report(0.4, '무결성 검사 중...');
  const checked = await runIntegrityCheck();

  report(0.55, '최신 버전 확인 중...');
  const latest = await fetchLatestYtDlpVersion();

  const { version, updateError } = await runUpdateStep(report, checked, latest);
  if (!version) {
    report(1, '다운로더를 준비하지 못했습니다.');
    return { ok: false, reason: 'integrity', error: updateError || 'integrity check failed' };
  }

  report(1, `준비 완료 (yt-dlp ${version})`);
  return { ok: true, version, latest: latest || null };
}

export async function deleteLocalFile(fileUri) {
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch (e) {
    // ignore
  }
}

/** Thumbnail URL for a library track: prefers the local cover saved at download time. */
export function trackThumbUrl(track) {
  if (!track) return undefined;
  if (track.thumbnail_path) return track.thumbnail_path;
  const url = track.thumbnail_url;
  if (url && /(maxresdefault|sddefault|hqdefault)/.test(url)) return url;
  if (track.youtube_id) return `https://i.ytimg.com/vi/${track.youtube_id}/hqdefault.jpg`;
  return url || undefined;
}
