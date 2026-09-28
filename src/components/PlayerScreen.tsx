import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Image, 
  Dimensions,
  ActivityIndicator,
  PanResponder,
  FlatList,
  Platform,
  Modal,
  ScrollView
} from 'react-native';
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
import { runOnJS } from 'react-native-reanimated';
import { PlayerControls } from '../services/player';
import { MarqueeText } from './MarqueeText';
import { TrackArtwork } from './TrackArtwork';
import { PressableScale } from './ui/PressableScale';
import { getLikedIds, toggleLike, updateTrackDuration } from '../services/library';

const { width, height } = Dimensions.get('window');

export const PlayerScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const artSize = Math.min(width * 0.72, height * 0.32, 320);
  const playbackState = usePlaybackState();
  const progress = useProgress();
  
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(PlayerControls.getRepeatMode ? PlayerControls.getRepeatMode() : RepeatMode.Off);
  const [isShuffle, setIsShuffle] = useState(PlayerControls.getShuffleState());
  const [updatingLike, setUpdatingLike] = useState(false);

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
  
  const dragStartPercent = useRef(0);
  const dragStartVolume = useRef(0);

  // Sync refs to avoid stale closures inside PanResponder
  const currentTrackRef = useRef(currentTrack);
  const durationRef = useRef(progress.duration);
  const progressBarWidthRef = useRef(progressBarWidth);
  const volumeBarWidthRef = useRef(volumeBarWidth);

  currentTrackRef.current = currentTrack;
  durationRef.current = progress.duration;
  progressBarWidthRef.current = progressBarWidth;
  volumeBarWidthRef.current = volumeBarWidth;

  const progressPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const widthVal = progressBarWidthRef.current;
        const durVal = durationRef.current;
        if (!currentTrackRef.current || durVal === 0 || widthVal <= 0) return;
        setIsDraggingProgress(true);
        const native = evt.nativeEvent;
        const initialPercent = Math.max(0, Math.min(1, native.locationX / widthVal));
        dragStartPercent.current = initialPercent;
        setDragProgressPercent(initialPercent);
      },
      onPanResponderMove: (evt, gestureState) => {
        const widthVal = progressBarWidthRef.current;
        if (widthVal <= 0) return;
        const deltaPercent = gestureState.dx / widthVal;
        const currentPercent = Math.max(0, Math.min(1, dragStartPercent.current + deltaPercent));
        setDragProgressPercent(currentPercent);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const widthVal = progressBarWidthRef.current;
        const durVal = durationRef.current;
        if (widthVal <= 0 || durVal === 0) {
          setIsDraggingProgress(false);
          return;
        }
        const deltaPercent = gestureState.dx / widthVal;
        const finalPercent = Math.max(0, Math.min(1, dragStartPercent.current + deltaPercent));
        const targetSeconds = finalPercent * durVal;
        if (isFinite(targetSeconds) && !isNaN(targetSeconds)) {
          PlayerControls.seekTo(targetSeconds);
        }
        setIsDraggingProgress(false);
      },
    })
  ).current;

  const volumePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const widthVal = volumeBarWidthRef.current;
        if (widthVal <= 0) return;
        const native = evt.nativeEvent;
        const initialPercent = Math.max(0, Math.min(1, native.locationX / widthVal));
        dragStartVolume.current = initialPercent;
        handleVolumeChange(initialPercent);
      },
      onPanResponderMove: (evt, gestureState) => {
        const widthVal = volumeBarWidthRef.current;
        if (widthVal <= 0) return;
        const deltaPercent = gestureState.dx / widthVal;
        const currentPercent = Math.max(0, Math.min(1, dragStartVolume.current + deltaPercent));
        handleVolumeChange(currentPercent);
      },
      onPanResponderRelease: (evt, gestureState) => {
        const widthVal = volumeBarWidthRef.current;
        if (widthVal <= 0) return;
        const deltaPercent = gestureState.dx / widthVal;
        const finalPercent = Math.max(0, Math.min(1, dragStartVolume.current + deltaPercent));
        handleVolumeChange(finalPercent);
      },
    })
  ).current;

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
  }, []);

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
  const isPlaying = playbackState.state === State.Playing;
  const isBuffering = playbackState.state === State.Buffering || playbackState.state === State.Loading;

  const progressPercent = isDraggingProgress
    ? dragProgressPercent * 100
    : progress.duration > 0
      ? (progress.position / progress.duration) * 100
      : 0;
  const safePercent = Number.isFinite(progressPercent) ? Math.max(0, Math.min(100, progressPercent)) : 0;

  const displayPosition = isDraggingProgress
    ? dragProgressPercent * progress.duration
    : progress.position;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {currentTrack ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.nowPlayingText}>NOW PLAYING</Text>

            <GestureDetector gesture={swipeGesture}>
              <View style={[styles.artContainer, { width: artSize, height: artSize }]}>
                <TrackArtwork
                  youtubeId={currentTrack.youtube_id}
                  uri={currentTrack.thumbnail_path || currentTrack.thumbnail_url || currentTrack.artwork}
                  style={styles.albumArt}
                  placeholderIconSize={64}
                />
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
              <Ionicons name="list" size={26} color="#7c8598" />
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
            <PressableScale onPress={handleToggleShuffle} style={styles.secondaryControl} activeScale={0.85}>
              <Ionicons 
                name="shuffle" 
                size={22} 
                color={isShuffle ? "#00e676" : "#707888"} 
              />
            </PressableScale>

            <PressableScale onPress={PlayerControls.skipToPrevious} style={styles.primaryControl} activeScale={0.88}>
              <Ionicons name="play-back" size={36} color="#ffffff" />
            </PressableScale>

            <PressableScale 
              onPress={isPlaying ? PlayerControls.pause : PlayerControls.play} 
              style={styles.playPauseButton}
              activeScale={0.9}
            >
              {isBuffering ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={38} 
                  color="#0a0a0a" 
                  style={!isPlaying && { marginLeft: 4 }} 
                />
              )}
            </PressableScale>

            <PressableScale onPress={PlayerControls.skipToNext} style={styles.primaryControl} activeScale={0.88}>
              <Ionicons name="play-forward" size={36} color="#ffffff" />
            </PressableScale>

            <PressableScale onPress={handleToggleRepeat} style={styles.secondaryControl} activeScale={0.85}>
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
            <Ionicons name="volume-mute" size={18} color="#7c8598" onPress={() => handleVolumeChange(0)} />
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
            <Ionicons name="volume-high" size={18} color="#7c8598" onPress={() => handleVolumeChange(1.0)} />
          </View>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.noTrackView}>
          <Ionicons name="musical-notes-outline" size={80} color="#202430" />
          <Text style={styles.noTrackTitle}>No Song Playing</Text>
          <Text style={styles.noTrackText}>Select a playlist in the library tab to start playback.</Text>
        </View>
      )}

      <Modal
        visible={queueVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueVisible(false)}
      >
        <View style={styles.queueOverlay}>
          <View style={styles.queueCard}>
            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>재생 대기열 ({queue.length})</Text>
              <PressableScale
                onPress={() => setQueueVisible(false)}
                style={styles.queueCloseBtn}
                activeScale={0.8}
                accessibilityRole="button"
                accessibilityLabel="Close queue"
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </PressableScale>
            </View>
            <FlatList
              data={queue}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              renderItem={({ item, index }) => {
                const isActive = index === queueActiveIndex;
                return (
                  <PressableScale
                    style={[styles.queueRow, isActive && styles.queueRowActive]}
                    onPress={() => handleSelectQueueItem(index)}
                    activeScale={0.98}
                  >
                    <Ionicons
                      name={isActive ? 'volume-high' : 'musical-note-outline'}
                      size={16}
                      color={isActive ? '#00e676' : '#7c8598'}
                    />
                    <View style={styles.queueMeta}>
                      <Text style={[styles.queueRowTitle, isActive && styles.queueRowTitleActive]} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.queueRowArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    {isActive && <Text style={styles.queueNowBadge}>재생 중</Text>}
                  </PressableScale>
                );
              }}
              ListEmptyComponent={<Text style={styles.queueEmpty}>대기열이 비어 있습니다.</Text>}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0e12',
    paddingHorizontal: 28,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nowPlayingText: {
    color: '#00e676',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 16,
  },
  artContainer: {
    borderRadius: 20,
    backgroundColor: '#161920',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
    marginBottom: 22,
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
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  artistText: {
    color: '#707888',
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
    backgroundColor: '#20242e',
    borderRadius: 2,
    width: '100%',
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00e676',
    borderRadius: 2,
    width: '0%',
    zIndex: 1,
  },
  progressKnob: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00e676',
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
    color: '#7c8598',
    fontSize: 11,
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
    color: '#00e676',
    fontSize: 9,
    fontWeight: '800',
    top: 2,
    right: 2,
  },
  playPauseButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#00e676',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00e676',
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
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 8,
  },
  noTrackText: {
    color: '#7c8598',
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
    backgroundColor: '#20242e',
    borderRadius: 2,
    width: '100%',
    position: 'relative',
  },
  volumeBarFill: {
    height: '100%',
    backgroundColor: '#00e676',
    borderRadius: 2,
    zIndex: 1,
  },
  volumeKnob: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00e676',
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
    color: '#7c8598',
    fontSize: 11,
    opacity: 0.7,
  },
  queueOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  queueCard: {
    backgroundColor: '#161920',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: '#20242e',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#252a36',
    paddingBottom: 12,
    marginBottom: 8,
  },
  queueTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  queueCloseBtn: {
    padding: 4,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#1b1f28',
  },
  queueRowActive: {
    backgroundColor: '#182220',
    borderWidth: 1,
    borderColor: '#00e676',
  },
  queueMeta: {
    flex: 1,
    marginLeft: 10,
  },
  queueRowTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  queueRowTitleActive: {
    color: '#00e676',
  },
  queueRowArtist: {
    color: '#7c8598',
    fontSize: 11,
    marginTop: 2,
  },
  queueNowBadge: {
    color: '#00e676',
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 8,
  },
  queueEmpty: {
    color: '#7c8598',
    textAlign: 'center',
    marginVertical: 30,
    fontSize: 13,
  },
});
