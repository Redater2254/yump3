import * as FileSystem from 'expo-file-system/legacy';
import { LIBRARY_DIR } from './ytdlp';
import {
  getTracks,
  addTrack,
  getPlaylists,
  createPlaylist,
  addTracksToPlaylist,
  addLikes,
} from './library';

const YT_ID = /\[([A-Za-z0-9_-]{11})\]/;

/**
 * Registers MP3 files that were copied into the library folder by hand
 * (for example migrated from the old yustream app).
 *
 * Optional manifest.json next to the files can provide title/artist/duration/
 * thumbnail/liked and playlists; otherwise metadata is parsed from filenames
 * of the form "<title> [<youtubeId>].mp3".
 */
export async function importLibraryFromFolder() {
  const info = await FileSystem.getInfoAsync(LIBRARY_DIR);
  if (!info.exists) return { added: 0, total: 0, likes: 0, playlists: 0 };

  const files = await FileSystem.readDirectoryAsync(LIBRARY_DIR);
  const existing = await getTracks();
  const known = new Set(existing.map((t) => String(t.youtube_id || t.id)));

  let manifest = null;
  if (files.includes('manifest.json')) {
    try {
      manifest = JSON.parse(await FileSystem.readAsStringAsync(`${LIBRARY_DIR}manifest.json`));
    } catch (e) {
      manifest = null;
    }
  }

  const entries = [];
  const seenFiles = new Set();

  if (manifest && Array.isArray(manifest.tracks)) {
    for (const m of manifest.tracks) {
      if (!m || !m.file) continue;
      seenFiles.add(m.file);
      entries.push({
        id: String(m.youtube_id || m.file),
        youtube_id: m.youtube_id || null,
        title: m.title || m.file.replace(/\.mp3$/i, ''),
        artist: m.artist || 'Unknown Artist',
        duration: m.duration || 0,
        thumbnail_url:
          m.thumbnail_url ||
          (m.youtube_id ? `https://i.ytimg.com/vi/${m.youtube_id}/hqdefault.jpg` : null),
        file_path: `${LIBRARY_DIR}${m.file}`,
        liked: !!m.liked,
      });
    }
  }

  for (const f of files) {
    if (!f.toLowerCase().endsWith('.mp3') || seenFiles.has(f)) continue;
    const idMatch = f.match(YT_ID);
    const youtubeId = idMatch ? idMatch[1] : null;
    entries.push({
      id: String(youtubeId || f),
      youtube_id: youtubeId,
      title: f.replace(/\s*\[[A-Za-z0-9_-]{11}\]/, '').replace(/\.mp3$/i, ''),
      artist: 'Unknown Artist',
      duration: 0,
      thumbnail_url: youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null,
      file_path: `${LIBRARY_DIR}${f}`,
      liked: false,
    });
  }

  const fileSet = new Set(files);
  const findLocalThumb = (mp3File) => {
    const base = mp3File.replace(/\.mp3$/i, '');
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      if (fileSet.has(base + ext)) return `${LIBRARY_DIR}${base}${ext}`;
    }
    return null;
  };

  let added = 0;
  const likedIds = [];
  for (const e of entries) {
    const key = String(e.youtube_id || e.id);
    if (!known.has(key)) {
      await addTrack({
        id: e.id,
        youtube_id: e.youtube_id,
        title: e.title,
        artist: e.artist,
        duration: e.duration,
        thumbnail_url: e.thumbnail_url,
        thumbnail_path: e.thumbnail_path || findLocalThumb(e.file_path.split('/').pop() || ''),
        file_path: e.file_path,
      });
      known.add(key);
      added++;
    }
    if (e.liked) likedIds.push(e.id);
  }

  const likes = likedIds.length > 0 ? await addLikes(likedIds) : 0;

  let playlists = 0;
  if (manifest && Array.isArray(manifest.playlists)) {
    const existingPlaylists = await getPlaylists();
    const existingNames = new Set(existingPlaylists.map((p) => p.name));
    for (const p of manifest.playlists) {
      if (!p || !p.name || !Array.isArray(p.track_ids) || p.track_ids.length === 0) continue;
      if (existingNames.has(p.name)) continue;
      const created = await createPlaylist(p.name);
      await addTracksToPlaylist(created.id, p.track_ids);
      playlists++;
    }
  }

  return { added, total: entries.length, likes, playlists };
}
