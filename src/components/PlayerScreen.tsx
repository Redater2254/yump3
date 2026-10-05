import { palette, HIT_SLOP } from '../theme';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { 
  usePlaybackState, 
  useProgress, 
  useTrackPlayerEvents,
  Event,
  State,
  RepeatMode
} from 'react-native-track-player';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { PlayerControls } from '../services/player';
import { MarqueeText } from './MarqueeText';
import { QueueModal } from './player/QueueModal';
import { useScrubber } from './player/useScrubber';
import { TrackArtwork } from './TrackArtwork';
import { PressableScale } from './ui/PressableScale';
import { getLikedIds, toggleLike, updateTrackDuration } from '../services/library';
import {
  loadAudioSettings,
  saveAudioSettings,
  applyAudioSettings,
} from '../services/audioEffects';
import { setBitPerfectMode } from '../services/player';
import {
  getCoverPalette,
  getStageLightEnabled,
  getWaveform,
  loadStageLightEnabled,
  subscribeStageLight,
} from '../services/lighting';
import type { CoverPalette, WaveformData } from '../services/lighting';

const { width, height } = Dimensions.get('window');
const GLOW = require('../../assets/images/glow.png');
const HALO = require('../../assets/images/halo.png');

export const PlayerScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const artSize = Math.min(width * 0.72, height * 0.32, 320);
  const playbackState = usePlaybackState();
  const progress = useProgress();
  const isPlaying = playbackState.state === State.Playing;
  const isBuffering = playbackState.state === State.Buffering || playbackState.state === State.Loading;
  
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(PlayerControls.getRepeatMode ? PlayerControls.getRepeatMode() : RepeatMode.Off);
  const [isShuffle, setIsShuffle] = useState(PlayerControls.getShuffleState());
  const [updatingLike, setUpdatingLike] = useState(false);
  const [bitPerfect, setBitPerfect] = useState(false);

  const [queue, setQueue] = useState<any[]>([]);
  const [queueVisible, setQueueVisible] = useState(false);
  const [queueActiveIndex, setQueueActiveIndex] = useState(-1);

  // Liked track ids are cached so switching tracks doesn't refetch the whole list every time
  const likedIdsRef = useRef<Set<string>>(new Set());
  const likesLoadedRef = useRef(false);
  const durationBackfilledRef = useRef<Set<string>>(new Set());

  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [volume, setVolumeState] = useState(1.0);
  const [volumeBarWidth, setVolumeBarWidth] = useState(0);

  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [dragProgressPercent, setDragProgressPercent] = useState(0);

  // Stage light (cover-colored ambient lighting driven by the waveform).
  const [coverColors, setCoverColors] = useState<CoverPalette | null>(null);
  const [hasWaveform, setHasWaveform] = useState(false);
  const [stageLight, setStageLight] = useState(getStageLightEnabled());
  

  // Sync refs to avoid stale closures inside PanResponder
  const currentTrackRef = useRef(currentTrack);
  const durationRef = useRef(progress.duration);
  const progressBarWidthRef = useRef(progressBarWidth);
  const volumeBarWidthRef = useRef(volumeBarWidth);

  currentTrackRef.current = currentTrack;
  durationRef.current = progress.duration;
  progressBarWidthRef.current = progressBarWidth;
  volumeBarWidthRef.current = volumeBarWidth;

  const positionRef = useRef(progress.position);
  positionRef.current = progress.position;

  const waveSV = useSharedValue<WaveformData | null>(null);
  const posSV = useSharedValue(0);
  const energySV = useSharedValue(0);
  const bassSV = useSharedValue(0);
  const playingSV = useSharedValue(0);
  const lightSV = useSharedValue(1);

  // Advances a local playback clock and samples the envelope every frame.
  useFrameCallback((info) => {
    'worklet';
    const wave = waveSV.value;
    if (!lightSV.value || !playingSV.value || !wave) {
      // Settle the lights instead of freezing mid-pulse.
      energySV.value += (0 - energySV.value) * 0.08;
      bassSV.value += (0 - bassSV.value) * 0.08;
      return;
    }
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    posSV.value += dt;
    const idx = Math.round(posSV.value * wave.hz);
    const energy = idx >= 0 && idx < wave.energy.length ? wave.energy[idx] / 255 : 0;
    const low = idx >= 0 && idx < wave.low.length ? wave.low[idx] / 255 : 0;
    energySV.value += (energy - energySV.value) * 0.35;
    bassSV.value += (low - bassSV.value) * 0.24;
  });

  const haloStyle = useAnimatedStyle(() => {
    const pulse = energySV.value * 0.45 + bassSV.value * 0.55;
    return {
      opacity: stageLight ? 0.24 + pulse * 0.3 : 0,
      transform: [{ scale: 1 + pulse * 0.05 }],
    };
  });

  const auraStyle = useAnimatedStyle(() => {
    const pulse = energySV.value * 0.45 + bassSV.value * 0.55;
    return {
      opacity: stageLight ? 0.08 + pulse * 0.16 : 0,
      transform: [{ scale: 0.98 + pulse * 0.06 }],
    };
  });

  const progressPanResponder = useScrubber({
    getWidth: () => progressBarWidthRef.current,
    onStart: (ratio) => {
      if (!currentTrackRef.current || durationRef.current === 0) return;
      setIsDraggingProgress(true);
      setDragProgressPercent(ratio);
    },
    onMove: (ratio) => {
      if (durationRef.current === 0) return;
      setDragProgressPercent(ratio);
    },
    onEnd: (ratio) => {
      if (durationRef.current === 0) {
        setIsDraggingProgress(false);
        return;
      }
      const targetSeconds = ratio * durationRef.current;
      if (Number.isFinite(targetSeconds)) {
        PlayerControls.seekTo(targetSeconds);
      }
      setIsDraggingProgress(false);
    },
  });

  const volumePanResponder = useScrubber({
    getWidth: () => volumeBarWidthRef.current,
    onStart: (ratio) => handleVolumeChange(ratio),
    onMove: (ratio) => handleVolumeChange(ratio),
    onEnd: (ratio) => handleVolumeChange(ratio),
  });

  const loadLikedIds = async (force = false) => {
    if (likesLoadedRef.current && !force) return;
    try {
      const ids = await getLikedIds();
      likedIdsRef.current = new Set((ids || []).map((id: any) => String(id)));
      likesLoadedRef.current = true;
    } catch (err) {
      console.error(err);
    }
  };

  const checkIfTrackIsLiked = async (trackId: string) => {
    await loadLikedIds();
    setIsLiked(likedIdsRef.current.has(String(trackId)));
  };

  const fetchCurrentTrack = async () => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      setCurrentTrack(track || null);
      if (track) {
        checkIfTrackIsLiked(track.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getInitialVolume = async () => {
    try {
      const vol = await PlayerControls.getVolume();
      setVolumeState(vol);
    } catch (e) {
      console.error(e);
    }
  };

  const getInitialRepeatMode = async () => {
    try {
      const mode = await TrackPlayer.getRepeatMode();
      if (mode !== undefined && mode !== null) {
        setRepeatMode(mode);
        if (PlayerControls.updateCachedRepeatMode) {
          PlayerControls.updateCachedRepeatMode(mode);
        }
      }
    } catch (e) {
      console.warn('Failed to get native repeat mode, using cached:', e);
      if (PlayerControls.getRepeatMode) {
        setRepeatMode(PlayerControls.getRepeatMode());
      }
    }
  };

  useEffect(() => {
    loadLikedIds(true);
    fetchCurrentTrack();
    getInitialVolume();
    getInitialRepeatMode();
    loadAudioSettings().then((settings) => setBitPerfect(settings.bitPerfect));
  }, []);

  // Stage light setting is shared with the playback sheet on My Page.
  useEffect(() => {
    let mounted = true;
    loadStageLightEnabled().then((value) => {
      if (mounted) setStageLight(value);
    });
    const unsubscribe = subscribeStageLight(setStageLight);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    playingSV.value = isPlaying ? 1 : 0;
  }, [isPlaying]);

  useEffect(() => {
    lightSV.value = stageLight && hasWaveform ? 1 : 0;
  }, [stageLight, hasWaveform]);

  // Keep the animation clock close to the real position without jitter.
  useEffect(() => {
    if (Math.abs(posSV.value - progress.position) > 0.4) {
      posSV.value = progress.position;
    }
  }, [progress.position]);

  // Decode the waveform and cover palette once per track (cached afterwards).
  useEffect(() => {
    let cancelled = false;
    waveSV.value = null;
    setHasWaveform(false);
    setCoverColors(null);
    energySV.value = 0;
    bassSV.value = 0;
    if (!stageLight || !currentTrack?.id) return;
    const track = currentTrack;
    (async () => {
      const [wave, colors] = await Promise.all([getWaveform(track), getCoverPalette(track)]);
      if (cancelled) return;
      if (wave) {
        waveSV.value = wave;
        posSV.value = positionRef.current || 0;
        setHasWaveform(true);
      }
      if (colors) setCoverColors(colors);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, stageLight]);

  const handleToggleBitPerfect = async () => {
    const settings = await loadAudioSettings();
    const next = { ...settings, bitPerfect: !settings.bitPerfect };
    setBitPerfect(next.bitPerfect);
    setBitPerfectMode(next.bitPerfect);
    await saveAudioSettings(next);
    await applyAudioSettings(next);
  };

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    if (event.track) {
      setCurrentTrack(event.track);
      checkIfTrackIsLiked(event.track.id);
    } else {
      setCurrentTrack(null);
      setIsLiked(false);
    }
  });

  // Backfill the duration for tracks saved before yt-dlp reported it (0:00 in the UI).
  useEffect(() => {
    if (!currentTrack?.id || !(progress.duration > 0)) return;
    const id = String(currentTrack.youtube_id || currentTrack.id);
    if (durationBackfilledRef.current.has(id)) return;
    durationBackfilledRef.current.add(id);
    if (!currentTrack.duration || currentTrack.duration <= 0) {
      updateTrackDuration(id, progress.duration);
    }
  }, [progress.duration, currentTrack?.id]);

  const handleToggleLike = async () => {
    if (!currentTrack || updatingLike) return;
    setUpdatingLike(true);
    try {
      const nowLiked = await toggleLike(String(currentTrack.id));
      if (nowLiked) {
        likedIdsRef.current.add(String(currentTrack.id));
      } else {
        likedIdsRef.current.delete(String(currentTrack.id));
      }
      setIsLiked(nowLiked);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingLike(false);
    }
  };

  const handleToggleRepeat = async () => {
    let nextMode = RepeatMode.Off;
    if (repeatMode === RepeatMode.Off) nextMode = RepeatMode.Queue;
    else if (repeatMode === RepeatMode.Queue) nextMode = RepeatMode.Track;

    await PlayerControls.setRepeatMode(nextMode);
    setRepeatMode(nextMode);
  };

  const handleToggleShuffle = async () => {
    const nextState = !isShuffle;
    setIsShuffle(nextState);
    await PlayerControls.toggleShuffle(nextState);
  };

  const openQueue = async () => {
    try {
      const [q, idx] = await Promise.all([
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrackIndex(),
      ]);
      setQueue(q || []);
      setQueueActiveIndex(typeof idx === 'number' ? idx : -1);
      setQueueVisible(true);
    } catch (e) {
      console.error('Failed to open queue:', e);
    }
  };

  const handleSelectQueueItem = async (index: number) => {
    try {
      await TrackPlayer.skip(index);
      await TrackPlayer.play();
      setQueueVisible(false);
    } catch (e) {
      console.error('Failed to skip to queue item:', e);
    }
  };

  // Horizontal swipe on the artwork to change tracks.
  // These run on the JS thread because the gesture callback executes as a worklet.
  const swipeToNext = () => { PlayerControls.skipToNext(); };
  const swipeToPrevious = () => { PlayerControls.skipToPrevious(); };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .onEnd((e) => {
      if (e.translationX < -60) {
        runOnJS(swipeToNext)();
      } else if (e.translationX > 60) {
        runOnJS(swipeToPrevious)();
      }
    });


  const handleVolumeChange = async (vol: number) => {
    if (vol === undefined || isNaN(vol) || !isFinite(vol)) return;
    const newVol = Math.max(0, Math.min(1, vol));
    setVolumeState(newVol);
    try {
      // Route through PlayerControls so the source-of-truth volume stays in sync
      // with fade-in / fade-out / sleep-timer logic.
      await PlayerControls.setVolume(newVol);
    } catch (e) {
      console.error(e);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const progressPercent = isDraggingProgress
    ? dragProgressPercent * 100
    : progress.duration > 0
      ? (progress.position / progress.duration) * 100
      : 0;
  const safePercent = Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent)) : 0;

  const displayPosition = isDraggingProgress
    ? dragProgressPercent * progress.duration
    : progress.position;

  const glowColor = coverColors?.glow || coverColors?.wash || palette.accent;
  const washColor = coverColors?.wash || coverColors?.glow || palette.accent;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {currentTrack ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.topRow}>
              <Text style={styles.nowPlayingText}>재생 중</Text>
              <PressableScale
                style={[styles.bitPerfectChip, bitPerfect && styles.bitPerfectChipActive]}
                onPress={handleToggleBitPerfect}
                activeScale={0.95}
                hitSlop={HIT_SLOP}
                accessibilityRole="switch"
                accessibilityState={{ checked: bitPerfect }}
                accessibilityLabel="원음 모드"
              >
                <Text style={[styles.bitPerfectText, bitPerfect && styles.bitPerfectTextActive]}>
                  원음
                </Text>
              </PressableScale>
            </View>

            <GestureDetector gesture={swipeGesture}>
              <View style={[styles.artStage, { width: artSize, height: artSize }]}>
                {stageLight && (
                  <>
                    <Animated.Image
                      source={GLOW}
                      style={[
                        styles.artHalo,
                        {
                          width: artSize * 1.9,
                          height: artSize * 1.9,
                          left: -artSize * 0.45,
                          top: -artSize * 0.45,
                          tintColor: washColor,
                        },
                        auraStyle,
                      ]}
                    />
                    <Animated.Image
                      source={HALO}
                      style={[
                        styles.artHalo,
                        {
                          width: artSize * 1.44,
                          height: artSize * 1.44,
                          left: -artSize * 0.22,
                          top: -artSize * 0.22,
                          tintColor: glowColor,
                        },
                        haloStyle,
                      ]}
                    />
                  </>
                )}
                <View
                  style={[
                    styles.artContainer,
                    { width: artSize, height: artSize },
                    stageLight && styles.artContainerLit,
                  ]}
                >
                  <TrackArtwork
                    youtubeId={currentTrack.youtube_id}
                    uri={currentTrack.thumbnail_path || currentTrack.thumbnail_url || currentTrack.artwork}
                    style={styles.albumArt}
                    placeholderIconSize={64}
                  />
                </View>
              </View>
            </GestureDetector>

          <View style={styles.hintRow}>
            <Text style={styles.swipeHint}>좌우로 밀어 곡 전환</Text>
          </View>

          <View style={styles.metaContainer}>
            <View style={styles.trackDetails}>
              <MarqueeText text={currentTrack.title} style={styles.titleText} />
              <Text style={styles.artistText} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>

            <PressableScale
              style={styles.likeButton}
              onPress={openQueue}
              activeScale={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open play queue"
            >
              <Ionicons name="list" size={26} color={palette.textDim} />
            </PressableScale>

            <PressableScale style={styles.likeButton} onPress={handleToggleLike} disabled={updatingLike} activeScale={0.85} accessibilityRole="button" accessibilityLabel={isLiked ? 'Remove from favorites' : 'Add to favorites'}>
              <Ionicons 
                name={isLiked ? "heart" : "heart-outline"} 
                size={28} 
                color={isLiked ? "#ff1744" : "#707888"} 
              />
            </PressableScale>
          </View>

          <View style={styles.progressContainer}>
            <View 
              style={styles.progressBarWrapper} 
              onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
              {...progressPanResponder.panHandlers}
            >
              <View style={styles.progressBarBackground} pointerEvents="none">
                <View style={[styles.progressBarFill, { width: `${safePercent}%` }]} />
                <View style={[styles.progressKnob, { left: `${safePercent}%` }]} />
              </View>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
              <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
            </View>
          </View>

          <View style={styles.controlsRow}>
            <PressableScale onPress={handleToggleShuffle} style={styles.secondaryControl} activeScale={0.85} hitSlop={HIT_SLOP}>
              <Ionicons 
                name="shuffle" 
                size={22} 
                color={isShuffle ? "#00e676" : "#707888"} 
              />
            </PressableScale>

            <PressableScale onPress={PlayerControls.skipToPrevious} style={styles.primaryControl} activeScale={0.88}>
              <Ionicons name="play-back" size={36} color={palette.text} />
            </PressableScale>

            <PressableScale 
              onPress={isPlaying ? PlayerControls.pause : PlayerControls.play} 
              style={styles.playPauseButton}
              activeScale={0.9}
            >
              {isBuffering ? (
                <ActivityIndicator color={palette.accentInk} size="small" />
              ) : (
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={38} 
                  color={palette.accentInk} 
                  style={!isPlaying && { marginLeft: 4 }} 
                />
              )}
            </PressableScale>

            <PressableScale onPress={PlayerControls.skipToNext} style={styles.primaryControl} activeScale={0.88}>
              <Ionicons name="play-forward" size={36} color={palette.text} />
            </PressableScale>

            <PressableScale onPress={handleToggleRepeat} style={styles.secondaryControl} activeScale={0.85} hitSlop={HIT_SLOP}>
              <Ionicons 
                name={repeatMode === RepeatMode.Track ? "repeat-outline" : "repeat"} 
                size={22} 
                color={repeatMode === RepeatMode.Off ? "#707888" : "#00e676"} 
              />
              {repeatMode === RepeatMode.Track && (
                <Text style={styles.repeatBadge}>1</Text>
              )}
            </PressableScale>
          </View>

          <View style={styles.volumeContainer}>
            <Ionicons name="volume-mute" size={18} color={palette.textDim} onPress={() => handleVolumeChange(0)} />
            <View 
              style={styles.volumeBarWrapper} 
              onLayout={(e) => setVolumeBarWidth(e.nativeEvent.layout.width)}
              {...volumePanResponder.panHandlers}
            >
              <View style={styles.volumeBarBackground} pointerEvents="none">
                <View style={[styles.volumeBarFill, { width: `${volume * 100}%` }]} />
                <View style={[styles.volumeKnob, { left: `${volume * 100}%` }]} />
              </View>
            </View>
            <Ionicons name="volume-high" size={18} color={palette.textDim} onPress={() => handleVolumeChange(1.0)} />
          </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.noTrackView}>
          <Ionicons name="musical-notes-outline" size={80} color="#202430" />
          <Text style={styles.noTrackTitle}>재생 중인 곡이 없습니다</Text>
          <Text style={styles.noTrackText}>보관함에서 곡을 선택해 재생하세요.</Text>
        </View>
      )}

      <QueueModal
        visible={queueVisible}
        queue={queue}
        activeIndex={queueActiveIndex}
        onSelect={handleSelectQueueItem}
        onClose={() => setQueueVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: 28,
  },
  scroll: { flex: 1, marginHorizontal: -28 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  content: {
    width: '100%',
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  nowPlayingText: {
    color: palette.accent,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
  bitPerfectChip: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  bitPerfectChipActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentWash,
  },
  bitPerfectText: { color: palette.textDim, fontSize: 12, fontWeight: '700' },
  bitPerfectTextActive: { color: palette.accent },
  artStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  artHalo: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  artContainerLit: {
    elevation: 0,
    shadowOpacity: 0,
  },
  artContainer: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
    overflow: 'hidden',
  },
  albumArt: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  trackDetails: {
    flex: 1,
    alignItems: 'flex-start',
  },
  titleText: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  artistText: {
    color: palette.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  likeButton: {
    padding: 10,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 26,
  },
  progressBarWrapper: {
    paddingVertical: 10,
    paddingHorizontal: 7,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: palette.border,
    borderRadius: 2,
    width: '100%',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 2,
    width: '0%',
    zIndex: 1,
  },
  progressKnob: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.accent,
    top: -4,
    marginLeft: -6,
    zIndex: 2,
    elevation: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    color: palette.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  primaryControl: {
    padding: 10,
  },
  secondaryControl: {
    padding: 10,
    position: 'relative',
  },
  repeatBadge: {
    position: 'absolute',
    color: palette.accent,
    fontSize: 12,
    fontWeight: '800',
    top: 2,
    right: 2,
  },
  playPauseButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  noTrackView: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noTrackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginTop: 20,
    marginBottom: 8,
  },
  noTrackText: {
    color: palette.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 22,
    paddingHorizontal: 10,
  },
  volumeBarWrapper: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 7,
    marginHorizontal: 12,
  },
  volumeBarBackground: {
    height: 4,
    backgroundColor: palette.border,
    borderRadius: 2,
    width: '100%',
    position: 'relative',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: 2,
    zIndex: 1,
  },
  volumeKnob: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.accent,
    top: -3,
    marginLeft: -5,
    zIndex: 2,
    elevation: 2,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  swipeHint: {
    color: palette.textDim,
    fontSize: 12,
    opacity: 0.7,
  },
});
