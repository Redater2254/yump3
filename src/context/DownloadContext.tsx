import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { downloadTrack, getVideoInfo, getPlaylistInfo, friendlyYtDlpError } from '../services/ytdlp';
import { getWaveform } from '../services/lighting';
import { addTrack, getTrack, createPlaylist, addTracksToPlaylist } from '../services/library';

const { DownloadNotifier } = NativeModules;

export interface DownloadTask {
  id: string; // youtube_id
  title: string;
  artist: string;
  status: 'downloading' | 'completed' | 'failed';
  progress?: number;
  errorMsg?: string;
  errorDetail?: string;
}

export type DirectAddResult =
  | { type: 'video' }
  | { type: 'playlist'; total: number; title: string | null };

interface DownloadContextType {
  downloadTasks: DownloadTask[];
  triggerDownload: (track: { youtube_id: string; title: string; artist: string; duration?: number; thumbnail_url?: string }) => Promise<void>;
  handleDirectAdd: (urlOrId: string) => Promise<DirectAddResult>;
  retryDownload: (taskId: string) => Promise<void>;
  dismissTask: (taskId: string) => void;
  clearDownloads: () => void;
  isDownloadingAny: boolean;
  activeCount: number;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

const PLAYLIST_LIMIT = 100;

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 11) return trimmed;
  const match = trimmed.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  if (match && match[2] && match[2].length === 11) return match[2];
  return null;
}

/** Pure playlist links only; watch links that also contain a video id stay single-video. */
function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!/[?&]list=/.test(trimmed)) return null;
  if (/[?&]v=/.test(trimmed) || /youtu\.be\/[A-Za-z0-9_-]{11}/.test(trimmed)) return null;
  const m = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const playlistInFlightRef = useRef<Set<string>>(new Set());
  const notifierActiveRef = useRef(false);
  const lastNotifyAtRef = useRef(0);
  // Ids created in the current download batch (old finished tasks are excluded).
  const batchIdsRef = useRef<Set<string>>(new Set());

  const ensureNotificationPermission = async () => {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
    try {
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
    } catch (e) {
      // the download still works without the notification
    }
  };

  /** Mirrors download progress into the Android notification shade. */
  const syncDownloadNotification = async (tasks: DownloadTask[]) => {
    if (!DownloadNotifier) return;
    // Keep the foreground service alive for the whole batch: stopping it between
    // tracks would make Android refuse to restart it from the background.
    if (tasks.length === 0) {
      batchIdsRef.current.clear();
      if (notifierActiveRef.current) {
        notifierActiveRef.current = false;
        try {
          await DownloadNotifier.stop();
        } catch (e) {
          // ignore
        }
      }
      return;
    }
    const now = Date.now();
    if (notifierActiveRef.current && now - lastNotifyAtRef.current < 800) return;
    lastNotifyAtRef.current = now;

    const active = tasks.filter((t) => t.status === 'downloading');
    const batch = tasks.filter((t) => batchIdsRef.current.has(t.id));
    const total = batch.length > 0 ? batch.length : tasks.length;
    const done = (batch.length > 0 ? batch : tasks).filter((t) => t.status !== 'downloading').length;
    let sub: string;
    let progress: number;
    if (active.length > 0) {
      const current = active[0];
      progress = typeof current.progress === 'number' ? Math.round(current.progress) : -1;
      sub = `${Math.min(done + 1, total)}/${total} · ${current.title}`;
    } else {
      const failed = tasks.filter((t) => t.status === 'failed').length;
      progress = 100;
      sub = failed > 0 ? `${total}곡 중 ${failed}곡 실패` : `${total}곡 다운로드 완료`;
    }
    try {
      if (!notifierActiveRef.current) {
        notifierActiveRef.current = true;
        await DownloadNotifier.start('yump3 다운로드', sub, progress);
      } else {
        await DownloadNotifier.update('yump3 다운로드', sub, progress);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    syncDownloadNotification(downloadTasks);
  }, [downloadTasks]);

  const updateTask = (taskId: string, patch: Partial<DownloadTask>) => {
    setDownloadTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const runDownload = async (
    taskId: string,
    youtubeId: string,
    meta: { title?: string; artist?: string; duration?: number; thumbnail_url?: string }
  ): Promise<boolean> => {
    if (inFlightRef.current.has(taskId)) return false;
    inFlightRef.current.add(taskId);
    try {
      const {
        filePath,
        duration,
        thumbnailPath,
        title: realTitle,
        artist: realArtist,
      } = await downloadTrack(youtubeId, (e: any) => {
        updateTask(taskId, { progress: typeof e.progress === 'number' ? e.progress : undefined });
      });

      // The file's own metadata wins over whatever the caller passed in.
      const finalTitle = realTitle || meta.title || 'Unknown Title';
      const finalArtist = realArtist || meta.artist || 'Unknown Artist';

      await addTrack({
        id: youtubeId,
        youtube_id: youtubeId,
        title: finalTitle,
        artist: finalArtist,
        duration: duration || meta.duration || 0,
        thumbnail_url: meta.thumbnail_url || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        thumbnail_path: thumbnailPath || null,
        file_path: filePath,
      });

      updateTask(taskId, {
        title: finalTitle,
        artist: finalArtist,
        status: 'completed',
        progress: 100,
        errorMsg: undefined,
        errorDetail: undefined,
      });

      // Warm the stage-light cache in the background so the first play has the
      // waveform ready instead of waiting for the decode.
      void getWaveform({ youtube_id: youtubeId, file_path: filePath }).catch(() => {});
      return true;
    } catch (err: any) {
      const detail = String(err?.message || err);
      updateTask(taskId, {
        status: 'failed',
        errorMsg: friendlyYtDlpError(detail),
        errorDetail: detail,
      });
      return false;
    } finally {
      inFlightRef.current.delete(taskId);
    }
  };

  const triggerDownload = async (track: { youtube_id: string; title: string; artist: string; duration?: number; thumbnail_url?: string }) => {
    const youtubeId = track.youtube_id;
    if (inFlightRef.current.has(youtubeId)) return;
    batchIdsRef.current.add(youtubeId);
    await ensureNotificationPermission();

    setDownloadTasks((prev) => [
      { id: youtubeId, title: track.title || 'Downloading…', artist: track.artist || 'YouTube', status: 'downloading', progress: 0 },
      ...prev.filter((t) => t.id !== youtubeId),
    ]);
    await runDownload(youtubeId, youtubeId, track);
  };

  const runPlaylistQueue = async (
    tracks: { youtube_id: string; title: string; artist: string; duration: number; thumbnail_url: string }[],
    playlistTitle: string | null
  ) => {
    const doneIds: string[] = [];
    let first = true;
    for (const t of tracks) {
      // Space out requests so DNS/rate limits don't fail mid-playlist.
      if (!first) await new Promise((r) => setTimeout(r, 1200));
      first = false;
      const already = await getTrack(t.youtube_id);
      if (already) {
        updateTask(t.youtube_id, { status: 'completed', progress: 100 });
        doneIds.push(t.youtube_id);
        continue;
      }
      const ok = await runDownload(t.youtube_id, t.youtube_id, t);
      if (ok) doneIds.push(t.youtube_id);
    }
    if (playlistTitle && doneIds.length > 0) {
      try {
        const playlist = await createPlaylist(playlistTitle);
        await addTracksToPlaylist(playlist.id, doneIds);
      } catch (e) {
        // ignore playlist creation failures
      }
    }
  };

  const enqueuePlaylist = async (url: string, playlistId: string): Promise<DirectAddResult> => {
    if (playlistInFlightRef.current.has(playlistId)) {
      throw new Error('이미 다운로드 중인 재생목록입니다.');
    }
    await ensureNotificationPermission();
    playlistInFlightRef.current.add(playlistId);
    try {
      const info = await getPlaylistInfo(url, PLAYLIST_LIMIT);
      const tracks = (info.tracks || []).filter((t: any) => t && t.youtube_id);
      if (tracks.length === 0) {
        throw new Error('재생목록에서 곡을 찾지 못했습니다.');
      }

      tracks.forEach((t: any) => batchIdsRef.current.add(t.youtube_id));
      setDownloadTasks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        const fresh = tracks
          .filter((t: any) => !existing.has(t.youtube_id))
          .map((t: any) => ({
            id: t.youtube_id,
            title: t.title,
            artist: t.artist,
            status: 'downloading' as const,
            progress: 0,
          }));
        return [...fresh, ...prev];
      });

      // Downloads continue in the background and are tracked in the download panel.
      void runPlaylistQueue(tracks, info.title).finally(() => {
        playlistInFlightRef.current.delete(playlistId);
      });

      return { type: 'playlist', total: tracks.length, title: info.title };
    } catch (e) {
      playlistInFlightRef.current.delete(playlistId);
      throw e;
    }
  };

  const handleDirectAdd = async (urlOrId: string): Promise<DirectAddResult> => {
    const playlistId = extractPlaylistId(urlOrId);
    if (playlistId) {
      return await enqueuePlaylist(urlOrId.trim(), playlistId);
    }

    const youtubeId = extractVideoId(urlOrId);
    if (!youtubeId) {
      throw new Error('Invalid YouTube URL or ID.');
    }
    if (inFlightRef.current.has(youtubeId)) return { type: 'video' };

    // Fetch metadata for the exact video (a ytsearch<id> lookup can return a
    // different video entirely). The download fills in the real tags anyway.
    let meta: any = { title: `YouTube (${youtubeId})`, artist: 'Unknown Artist' };
    try {
      const info = await getVideoInfo(`https://www.youtube.com/watch?v=${youtubeId}`);
      if (info && info.youtube_id === youtubeId) meta = info;
    } catch (e) {
      // offline / lookup failed: keep placeholder
    }

    setDownloadTasks((prev) => [
      { id: youtubeId, title: meta.title, artist: meta.artist, status: 'downloading', progress: 0 },
      ...prev.filter((t) => t.id !== youtubeId),
    ]);
    await runDownload(youtubeId, youtubeId, meta);
    return { type: 'video' };
  };

  const retryDownload = async (taskId: string) => {
    const task = downloadTasks.find((t) => t.id === taskId);
    if (!task) return;
    updateTask(taskId, { status: 'downloading', errorMsg: undefined, progress: 0 });
    await runDownload(taskId, taskId, { title: task.title, artist: task.artist });
  };

  const dismissTask = (taskId: string) => {
    setDownloadTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const clearDownloads = () => setDownloadTasks([]);

  const isDownloadingAny = downloadTasks.some((t) => t.status === 'downloading');
  const activeCount = downloadTasks.filter((t) => t.status === 'downloading').length;

  return (
    <DownloadContext.Provider
      value={{
        downloadTasks,
        triggerDownload,
        handleDirectAdd,
        retryDownload,
        dismissTask,
        clearDownloads,
        isDownloadingAny,
        activeCount,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export const useDownload = () => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
};
