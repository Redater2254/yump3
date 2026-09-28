import React, { createContext, useContext, useState, useRef } from 'react';
import { downloadTrack, searchTracks, friendlyYtDlpError } from '../services/ytdlp';
import { addTrack } from '../services/library';

export interface DownloadTask {
  id: string; // youtube_id
  title: string;
  artist: string;
  status: 'downloading' | 'completed' | 'failed';
  progress?: number;
  errorMsg?: string;
  errorDetail?: string;
}

interface DownloadContextType {
  downloadTasks: DownloadTask[];
  triggerDownload: (track: { youtube_id: string; title: string; artist: string; duration?: number; thumbnail_url?: string }) => Promise<void>;
  handleDirectAdd: (urlOrId: string) => Promise<void>;
  retryDownload: (taskId: string) => Promise<void>;
  dismissTask: (taskId: string) => void;
  clearDownloads: () => void;
  isDownloadingAny: boolean;
  activeCount: number;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 11) return trimmed;
  const match = trimmed.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  if (match && match[2] && match[2].length === 11) return match[2];
  return null;
}

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const inFlightRef = useRef<Set<string>>(new Set());

  const updateTask = (taskId: string, patch: Partial<DownloadTask>) => {
    setDownloadTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const runDownload = async (
    taskId: string,
    youtubeId: string,
    meta: { title?: string; artist?: string; duration?: number; thumbnail_url?: string }
  ) => {
    if (inFlightRef.current.has(taskId)) return;
    inFlightRef.current.add(taskId);
    try {
      const { filePath, duration } = await downloadTrack(youtubeId, (e: any) => {
        updateTask(taskId, { progress: typeof e.progress === 'number' ? e.progress : undefined });
      });

      await addTrack({
        id: youtubeId,
        youtube_id: youtubeId,
        title: meta.title || 'Unknown Title',
        artist: meta.artist || 'Unknown Artist',
        duration: meta.duration || duration || 0,
        thumbnail_url: meta.thumbnail_url || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        file_path: filePath,
      });

      updateTask(taskId, { status: 'completed', progress: 100, errorMsg: undefined, errorDetail: undefined });
    } catch (err: any) {
      const detail = String(err?.message || err);
      updateTask(taskId, {
        status: 'failed',
        errorMsg: friendlyYtDlpError(detail),
        errorDetail: detail,
      });
    } finally {
      inFlightRef.current.delete(taskId);
    }
  };

  const triggerDownload = async (track: { youtube_id: string; title: string; artist: string; duration?: number; thumbnail_url?: string }) => {
    const youtubeId = track.youtube_id;
    if (inFlightRef.current.has(youtubeId)) return;

    setDownloadTasks((prev) => [
      { id: youtubeId, title: track.title || 'Downloading…', artist: track.artist || 'YouTube', status: 'downloading', progress: 0 },
      ...prev.filter((t) => t.id !== youtubeId),
    ]);
    await runDownload(youtubeId, youtubeId, track);
  };

  const handleDirectAdd = async (urlOrId: string) => {
    const youtubeId = extractVideoId(urlOrId);
    if (!youtubeId) {
      throw new Error('Invalid YouTube URL or ID.');
    }
    if (inFlightRef.current.has(youtubeId)) return;

    // Try to enrich metadata via search, but fall back to a placeholder.
    let meta: any = { title: `YouTube (${youtubeId})`, artist: 'Unknown Artist' };
    try {
      const results = await searchTracks(youtubeId, 1);
      if (results[0] && results[0].youtube_id === youtubeId) meta = results[0];
    } catch (e) {
      // offline / search failed: keep placeholder
    }

    setDownloadTasks((prev) => [
      { id: youtubeId, title: meta.title, artist: meta.artist, status: 'downloading', progress: 0 },
      ...prev.filter((t) => t.id !== youtubeId),
    ]);
    await runDownload(youtubeId, youtubeId, meta);
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
