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

function baseName(file) {
  return file.replace(/\.mp3$/i, '');
}

function findLocalThumb(fileSet, mp3File) {
  const base = baseName(mp3File);
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    if (fileSet.has(base + ext)) return `${LIBRARY_DIR}${base}${ext}`;
  }
  return null;
}

function titleFromFile(file) {
  return file.replace(/\s*\[[A-Za-z0-9_-]{11}\]/, '').replace(/\.mp3$/i, '');
}

/** Entries described by an optional manifest.json next to the files. */
function entriesFromManifest(manifest, seenFiles) {
  const entries = [];
  if (!manifest || !Array.isArray(manifest.tracks)) return entries;
  for (const item of manifest.tracks) {
    if (!item || !item.file) continue;
    seenFiles.add(item.file);
    entries.push({
      id: String(item.youtube_id || item.file),
      youtube_id: item.youtube_id || null,
      title: item.title || titleFromFile(item.file),
      artist: item.artist || 'Unknown Artist',
      duration: item.duration || 0,
      thumbnail_url:
        item.thumbnail_url ||
        (item.youtube_id ? `https://i.ytimg.com/vi/${item.youtube_id}/hqdefault.jpg` : null),
      file_path: `${LIBRARY_DIR}${item.file}`,
      liked: !!item.liked,
    });
  }
  return entries;
}

/** MP3s dropped into the folder without a manifest, parsed from the filename. */
function entriesFromFiles(files, seenFiles, fileSet) {
  const entries = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.mp3') || seenFiles.has(file)) continue;
    const idMatch = file.match(YT_ID);
    const youtubeId = idMatch ? idMatch[1] : null;
    entries.push({
      id: String(youtubeId || file),
      youtube_id: youtubeId,
      title: titleFromFile(file),
      artist: 'Unknown Artist',
      duration: 0,
      thumbnail_url: youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null,
      file_path: `${LIBRARY_DIR}${file}`,
      thumbnail_path: findLocalThumb(fileSet, file),
      liked: false,
    });
  }
  return entries;
}

async function readManifest(files) {
  if (!files.includes('manifest.json')) return null;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(`${LIBRARY_DIR}manifest.json`));
  } catch (e) {
    return null;
  }
}

/** Adds every new entry to the library and collects liked ids. */
async function applyEntries(entries, known) {
  let added = 0;
  const likedIds = [];
  for (const entry of entries) {
    const key = String(entry.youtube_id || entry.id);
    if (!known.has(key)) {
      await addTrack({
        id: entry.id,
        youtube_id: entry.youtube_id,
        title: entry.title,
        artist: entry.artist,
        duration: entry.duration,
        thumbnail_url: entry.thumbnail_url,
        thumbnail_path: entry.thumbnail_path || null,
        file_path: entry.file_path,
      });
      known.add(key);
      added++;
    }
    if (entry.liked) likedIds.push(entry.id);
  }
  return { added, likedIds };
}

/** Recreates playlists from the manifest (skipping names that already exist). */
async function applyPlaylists(manifest) {
  if (!manifest || !Array.isArray(manifest.playlists)) return 0;
  const existing = await getPlaylists();
  const existingNames = new Set(existing.map((playlist) => playlist.name));
  let created = 0;
  for (const item of manifest.playlists) {
    if (!item || !item.name || !Array.isArray(item.track_ids) || item.track_ids.length === 0) {
      continue;
    }
    if (existingNames.has(item.name)) continue;
    const playlist = await createPlaylist(item.name);
    await addTracksToPlaylist(playlist.id, item.track_ids);
    created++;
  }
  return created;
}

/**
 * Registers MP3 files that were copied into the library folder by hand
 * (for example migrated from the old yustream app).
 */
export async function importLibraryFromFolder() {
  const info = await FileSystem.getInfoAsync(LIBRARY_DIR);
  if (!info.exists) return { added: 0, total: 0, likes: 0, playlists: 0 };

  const files = await FileSystem.readDirectoryAsync(LIBRARY_DIR);
  const fileSet = new Set(files);
  const manifest = await readManifest(files);

  const seenFiles = new Set();
  const entries = [
    ...entriesFromManifest(manifest, seenFiles),
    ...entriesFromFiles(files, seenFiles, fileSet),
  ];

  const existing = await getTracks();
  const known = new Set(existing.map((track) => String(track.youtube_id || track.id)));
  const { added, likedIds } = await applyEntries(entries, known);
  const likes = likedIds.length > 0 ? await addLikes(likedIds) : 0;
  const playlists = await applyPlaylists(manifest);

  return { added, total: entries.length, likes, playlists };
}
