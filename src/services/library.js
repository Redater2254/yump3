import AsyncStorage from '@react-native-async-storage/async-storage';

// All library data lives on-device. Track.id === youtube_id (string).
const TRACKS_KEY = 'yump3_tracks';
const PLAYLISTS_KEY = 'yump3_playlists';
const LIKES_KEY = 'yump3_likes';

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function writeJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore
  }
}


export async function getTracks() {
  const tracks = await readJSON(TRACKS_KEY, []);
  return tracks.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}

export async function getTrack(id) {
  const tracks = await readJSON(TRACKS_KEY, []);
  return tracks.find((t) => t.id === id) || null;
}

export async function addTrack(track) {
  const tracks = await readJSON(TRACKS_KEY, []);
  const next = tracks.filter((t) => t.id !== track.id);
  next.push({ ...track, created_at: Date.now() });
  await writeJSON(TRACKS_KEY, next);
  return track;
}

export async function removeTrack(id) {
  const tracks = await readJSON(TRACKS_KEY, []);
  await writeJSON(TRACKS_KEY, tracks.filter((t) => t.id !== id));

  // Cascade: remove from playlists and likes.
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  const nextPlaylists = playlists.map((p) => ({
    ...p,
    trackIds: (p.trackIds || []).filter((tid) => tid !== id),
  }));
  await writeJSON(PLAYLISTS_KEY, nextPlaylists);

  const likes = await readJSON(LIKES_KEY, []);
  await writeJSON(LIKES_KEY, likes.filter((lid) => lid !== id));
}


export async function getPlaylists() {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  return playlists.map((p) => ({ ...p, track_count: (p.trackIds || []).length }));
}

export async function createPlaylist(name) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  const playlist = { id: `pl_${Date.now()}`, name, trackIds: [], created_at: Date.now() };
  playlists.push(playlist);
  await writeJSON(PLAYLISTS_KEY, playlists);
  return playlist;
}

export async function renamePlaylist(id, name) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  await writeJSON(PLAYLISTS_KEY, playlists.map((p) => (p.id === id ? { ...p, name } : p)));
}

export async function deletePlaylist(id) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  await writeJSON(PLAYLISTS_KEY, playlists.filter((p) => p.id !== id));
}

export async function getPlaylist(id) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  return playlists.find((p) => p.id === id) || null;
}

export async function getPlaylistTracks(id) {
  const playlist = await getPlaylist(id);
  if (!playlist) return [];
  const tracks = await readJSON(TRACKS_KEY, []);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return (playlist.trackIds || []).map((tid) => byId.get(tid)).filter(Boolean);
}

export async function addTracksToPlaylist(playlistId, trackIds) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  await writeJSON(
    PLAYLISTS_KEY,
    playlists.map((p) => {
      if (p.id !== playlistId) return p;
      const existing = new Set(p.trackIds || []);
      const merged = [...(p.trackIds || [])];
      for (const tid of trackIds) {
        if (!existing.has(tid)) {
          merged.push(tid);
          existing.add(tid);
        }
      }
      return { ...p, trackIds: merged };
    })
  );
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  await writeJSON(
    PLAYLISTS_KEY,
    playlists.map((p) =>
      p.id === playlistId ? { ...p, trackIds: (p.trackIds || []).filter((t) => t !== trackId) } : p
    )
  );
}

export async function reorderPlaylist(playlistId, trackIds) {
  const playlists = await readJSON(PLAYLISTS_KEY, []);
  await writeJSON(
    PLAYLISTS_KEY,
    playlists.map((p) => (p.id === playlistId ? { ...p, trackIds } : p))
  );
}


export async function getLikedTracks() {
  const likes = await readJSON(LIKES_KEY, []);
  const tracks = await readJSON(TRACKS_KEY, []);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return likes.map((id) => byId.get(id)).filter(Boolean);
}

export async function getLikedIds() {
  return readJSON(LIKES_KEY, []);
}

export async function clearLibrary() {
  await writeJSON(TRACKS_KEY, []);
  await writeJSON(PLAYLISTS_KEY, []);
  await writeJSON(LIKES_KEY, []);
}

export async function isLiked(id) {
  const likes = await readJSON(LIKES_KEY, []);
  return likes.includes(id);
}

/** Adds multiple liked ids at once (used by the library importer). */
export async function addLikes(ids) {
  const likes = await readJSON(LIKES_KEY, []);
  const set = new Set(likes);
  let added = 0;
  for (const id of ids) {
    if (!set.has(id)) {
      set.add(id);
      added++;
    }
  }
  if (added > 0) await writeJSON(LIKES_KEY, Array.from(set));
  return added;
}

/** Backfills a missing duration (seconds) once the player knows the real one. */
export async function updateTrackDuration(id, duration) {
  if (!duration || duration <= 0) return;
  const tracks = await readJSON(TRACKS_KEY, []);
  let changed = false;
  const next = tracks.map((t) => {
    if (t.id === id && (!t.duration || t.duration <= 0)) {
      changed = true;
      return { ...t, duration: Math.round(duration) };
    }
    return t;
  });
  if (changed) await writeJSON(TRACKS_KEY, next);
}

export async function toggleLike(id) {
  const likes = await readJSON(LIKES_KEY, []);
  const next = likes.includes(id) ? likes.filter((l) => l !== id) : [...likes, id];
  await writeJSON(LIKES_KEY, next);
  return next.includes(id);
}
