import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  State,
  RepeatMode,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
  Event
} from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Re-export hook utilities for convenience in UI components
export { usePlaybackState, useProgress, useTrackPlayerEvents, Event, RepeatMode, State };

let isSetup = false;
let originalUserVolume = 1.0;
let isFadingOut = false;
let fadeInInterval = null;
let lastTrackBPM = null;
let rateRampInterval = null;

let sleepTimerId = null;
let sleepTimerRemaining = 0; // in seconds
let sleepTimerCallback = null;

function hashString(str) {
  let hash = 0;
  if (!str) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Deterministic BPM (80-160) and Camelot key (1A-12A, 1B-12B) from the track id
export function getTrackBPMAndKey(track) {
  if (!track) return { bpm: 120, key: '8A' };
  const seed = hashString(track.youtube_id || track.id || '');
  const bpm = 80 + (seed % 81);
  const keyNumber = 1 + (seed % 12);
  const keyMode = seed % 2 === 0 ? 'A' : 'B';
  return { bpm, key: `${keyNumber}${keyMode}` };
}

export function getHarmonicScore(track1, track2) {
  if (!track1 || !track2) return 0;
  const meta1 = getTrackBPMAndKey(track1);
  const meta2 = getTrackBPMAndKey(track2);

  const n1 = parseInt(meta1.key, 10);
  const m1 = meta1.key.slice(-1);
  const n2 = parseInt(meta2.key, 10);
  const m2 = meta2.key.slice(-1);

  let keyScore = 0;
  if (m1 === m2) {
    let diff = Math.abs(n1 - n2);
    diff = Math.min(diff, 12 - diff);
    if (diff === 0) keyScore = 15;
    else if (diff === 1) keyScore = 10;
  } else if (n1 === n2) {
    keyScore = 12;
  }

  const bpmDiff = Math.abs(meta1.bpm - meta2.bpm);
  let bpmScore = 0;
  if (bpmDiff <= 15) bpmScore = 15 - bpmDiff;

  return keyScore + bpmScore;
}

export function startSleepTimer(minutes, onTick) {
  stopSleepTimer();
  sleepTimerRemaining = minutes * 60;
  if (onTick) {
    sleepTimerCallback = onTick;
    onTick(sleepTimerRemaining);
  }

  sleepTimerId = setInterval(async () => {
    if (sleepTimerRemaining <= 0) {
      await stopSleepTimerAndPause();
      return;
    }
    sleepTimerRemaining -= 1;

    if (sleepTimerRemaining <= 10 && sleepTimerRemaining > 0) {
      try {
        const targetVol = (sleepTimerRemaining / 10.0) * originalUserVolume;
        await TrackPlayer.setVolume(targetVol);
      } catch (e) {
        // ignore
      }
    }

    if (sleepTimerCallback) sleepTimerCallback(sleepTimerRemaining);
  }, 1000);
}

export function stopSleepTimer(restoreVolume = true) {
  if (sleepTimerId) {
    clearInterval(sleepTimerId);
    sleepTimerId = null;
    if (restoreVolume) {
      TrackPlayer.setVolume(originalUserVolume).catch(() => {});
    }
  }
  sleepTimerRemaining = 0;
  sleepTimerCallback = null;
}

async function stopSleepTimerAndPause() {
  stopSleepTimer(false);
  try {
    await TrackPlayer.pause();
    await TrackPlayer.setVolume(originalUserVolume);
  } catch (e) {
    // ignore
  }
}

export function getSleepTimerRemaining() {
  return sleepTimerRemaining;
}

function triggerFadeIn() {
  if (fadeInInterval) clearInterval(fadeInInterval);
  let elapsed = 0;
  const duration = 2500;
  const step = 100;

  TrackPlayer.setVolume(0).catch(() => {});

  fadeInInterval = setInterval(async () => {
    elapsed += step;
    if (elapsed >= duration) {
      clearInterval(fadeInInterval);
      fadeInInterval = null;
      await TrackPlayer.setVolume(originalUserVolume);
    } else {
      const fadeFactor = elapsed / duration;
      await TrackPlayer.setVolume(originalUserVolume * fadeFactor);
    }
  }, step);
}

function rampPlaybackRate(startRate) {
  if (rateRampInterval) clearInterval(rateRampInterval);
  let currentRate = startRate;
  const duration = 15000;
  const steps = 15;
  const stepTime = duration / steps;
  const rateDelta = (1.0 - startRate) / steps;

  rateRampInterval = setInterval(async () => {
    try {
      currentRate += rateDelta;
      if ((rateDelta > 0 && currentRate >= 1.0) || (rateDelta < 0 && currentRate <= 1.0)) {
        clearInterval(rateRampInterval);
        rateRampInterval = null;
        await TrackPlayer.setRate(1.0);
      } else {
        await TrackPlayer.setRate(currentRate);
      }
    } catch (e) {
      clearInterval(rateRampInterval);
      rateRampInterval = null;
    }
  }, stepTime);
}

let progressMonitorId = null;
function startProgressVolumeMonitor() {
  if (progressMonitorId) return;

  progressMonitorId = setInterval(async () => {
    try {
      const stateObj = await TrackPlayer.getPlaybackState();
      const state = stateObj && stateObj.state ? stateObj.state : stateObj;
      if (state !== State.Playing) return;

      const smartTransition = await AsyncStorage.getItem('yump3_beta_smart_transition');
      if (smartTransition !== 'true') {
        if (isFadingOut) {
          isFadingOut = false;
          await TrackPlayer.setVolume(originalUserVolume);
        }
        return;
      }

      const { position, duration } = await TrackPlayer.getProgress();
      if (duration > 10 && position >= duration - 5) {
        isFadingOut = true;
        const remainingTime = duration - position;
        const fadeFactor = Math.max(0, Math.min(1, remainingTime / 5.0));
        await TrackPlayer.setVolume(originalUserVolume * fadeFactor);
      } else if (isFadingOut) {
        isFadingOut = false;
        await TrackPlayer.setVolume(originalUserVolume);
      }
    } catch (e) {
      // ignore
    }
  }, 500);
}

export async function setupPlayer() {
  if (isSetup) return true;

  try {
    await TrackPlayer.setupPlayer({ maxCacheSize: 1024 * 1024 * 100 });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious
      ],
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification
      }
    });

    isSetup = true;

    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      const activeTrack = event.track;
      if (!activeTrack || !activeTrack.id) return;
      try {
        const smartTransition = await AsyncStorage.getItem('yump3_beta_smart_transition');
        const { bpm: currentBPM } = getTrackBPMAndKey(activeTrack);

        if (smartTransition === 'true') {
          triggerFadeIn();

          if (isFadingOut && lastTrackBPM) {
            isFadingOut = false;
            let targetRate = lastTrackBPM / currentBPM;
            targetRate = Math.max(0.9, Math.min(1.1, targetRate));
            if (Math.abs(targetRate - 1.0) > 0.005) {
              await TrackPlayer.setRate(targetRate);
              rampPlaybackRate(targetRate);
            } else {
              await TrackPlayer.setRate(1.0);
            }
          } else {
            isFadingOut = false;
            if (rateRampInterval) {
              clearInterval(rateRampInterval);
              rateRampInterval = null;
            }
            await TrackPlayer.setRate(1.0);
          }

          // Harmonic re-ordering of the remaining queue
          const index = await TrackPlayer.getActiveTrackIndex();
          const queue = await TrackPlayer.getQueue();
          if (index !== null && index !== undefined && index + 2 < queue.length) {
            const remaining = queue.slice(index + 1);
            let bestScore = -1;
            let bestIdx = 0;
            for (let i = 0; i < remaining.length; i++) {
              const score = getHarmonicScore(activeTrack, remaining[i]);
              if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
              }
            }
            if (bestIdx > 0) {
              const targetTrack = remaining[bestIdx];
              const targetIndexInFullQueue = index + 1 + bestIdx;
              await TrackPlayer.remove(targetIndexInFullQueue);
              await TrackPlayer.add(targetTrack, index + 1);
            }
          }
        } else {
          isFadingOut = false;
          if (rateRampInterval) {
            clearInterval(rateRampInterval);
            rateRampInterval = null;
          }
          await TrackPlayer.setRate(1.0);
        }

        lastTrackBPM = currentBPM;
      } catch (e) {
        // ignore
      }
    });

    try {
      originalUserVolume = await TrackPlayer.getVolume();
    } catch (e) {
      // ignore
    }

    startProgressVolumeMonitor();
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already')) {
      isSetup = true;
      return true;
    }
    return false;
  }
}

export function formatTrack(track) {
  return {
    id: String(track.id),
    url: track.file_path, // local file:// uri
    title: track.title,
    artist: track.artist,
    artwork:
      track.thumbnail_path ||
      track.thumbnail_url ||
      (track.youtube_id ? `https://i.ytimg.com/vi/${track.youtube_id}/hqdefault.jpg` : undefined),
    duration: track.duration,
    youtube_id: track.youtube_id || null,
    file_path: track.file_path || null,
    thumbnail_url: track.thumbnail_url || null,
    thumbnail_path: track.thumbnail_path || null
  };
}

let originalTracks = [];
let isShuffle = false;
let cachedRepeatMode = RepeatMode.Off;

export async function playPlaylist(tracks, startIndex = 0) {
  try {
    await setupPlayer();
    await TrackPlayer.reset();

    const formattedTracks = tracks.map(formatTrack);
    originalTracks = [...formattedTracks];

    if (isShuffle) {
      const startTrack = formattedTracks[startIndex];
      const otherTracks = formattedTracks.filter((_, idx) => idx !== startIndex);
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }
      await TrackPlayer.add([startTrack, ...otherTracks]);
    } else {
      await TrackPlayer.add(formattedTracks);
      if (startIndex > 0 && startIndex < formattedTracks.length) {
        await TrackPlayer.skip(startIndex);
      }
    }

    await TrackPlayer.play();
  } catch (error) {
    console.error('Failed to play playlist:', error);
  }
}

export const PlayerControls = {
  async play() {
    await TrackPlayer.play();
  },
  async pause() {
    await TrackPlayer.pause();
  },
  async setVolume(vol) {
    originalUserVolume = vol;
    if (!isFadingOut && !sleepTimerId) {
      await TrackPlayer.setVolume(vol);
    }
  },
  async getVolume() {
    return originalUserVolume;
  },
  async skipToNext() {
    try {
      await TrackPlayer.skipToNext();
    } catch (e) {}
  },
  async skipToPrevious() {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (e) {}
  },
  async seekTo(positionSeconds) {
    await TrackPlayer.seekTo(positionSeconds);
  },
  async getQueue() {
    return await TrackPlayer.getQueue();
  },
  async getCurrentTrack() {
    return await TrackPlayer.getActiveTrack();
  },
  async getPlaybackState() {
    return await TrackPlayer.getPlaybackState();
  },
  async setRepeatMode(mode) {
    cachedRepeatMode = mode;
    await TrackPlayer.setRepeatMode(mode);
  },
  getRepeatMode() {
    return cachedRepeatMode;
  },
  updateCachedRepeatMode(mode) {
    cachedRepeatMode = mode;
  },
  async toggleShuffle(enabled) {
    isShuffle = enabled;
    try {
      const queue = await TrackPlayer.getQueue();
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (queue.length <= 1) return;

      const activeIndex = queue.findIndex((t) => t.id === activeTrack?.id);
      const otherTracks = queue.filter((_, idx) => idx !== activeIndex);

      if (enabled) {
        for (let i = otherTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
        }
        const removeIndices = [];
        for (let i = 0; i < queue.length; i++) {
          if (i !== activeIndex) removeIndices.push(i);
        }
        await TrackPlayer.remove(removeIndices);
        await TrackPlayer.add(otherTracks);
      } else if (originalTracks.length > 0) {
        const activeIndexInOriginal = originalTracks.findIndex((t) => t.id === activeTrack?.id);
        if (activeIndexInOriginal !== -1) {
          const rest = [
            ...originalTracks.slice(activeIndexInOriginal + 1),
            ...originalTracks.slice(0, activeIndexInOriginal)
          ];
          const removeIndices = [];
          for (let i = 0; i < queue.length; i++) {
            if (i !== activeIndex) removeIndices.push(i);
          }
          await TrackPlayer.remove(removeIndices);
          await TrackPlayer.add(rest);
        }
      }
    } catch (e) {
      console.error('Failed to toggle shuffle:', e);
    }
  },
  getShuffleState() {
    return isShuffle;
  }
};
