import { palette } from '../theme';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { 
  usePlaybackState, 
  useProgress,
  useTrackPlayerEvents, 
  Event, 
  State 
} from 'react-native-track-player';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlayerControls } from '../services/player';
import { MarqueeText } from './MarqueeText';
import { TrackArtwork } from './TrackArtwork';
import { PressableScale } from './ui/PressableScale';

interface MiniPlayerProps {
  onPress: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onPress }) => {
  const playbackState = usePlaybackState();
  const progress = useProgress();
  const insets = useSafeAreaInsets();
  const [currentTrack, setCurrentTrack] = useState<any>(null);

  const bottomOffset = 60 + (Platform.OS === 'android' ? insets.bottom : 0);

  const fetchCurrentTrack = async () => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      setCurrentTrack(track || null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCurrentTrack();
  }, []);

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    if (event.track) {
      setCurrentTrack(event.track);
    } else {
      setCurrentTrack(null);
    }
  });

  // Swipe up on the bar to expand into the full player.
  // onPress is a JS prop, so it must be marshalled from the worklet via runOnJS.
  const pan = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .onEnd((e) => {
      if (e.translationY < -30) {
        runOnJS(onPress)();
      }
    });

  if (!currentTrack) return null;

  const isPlaying = playbackState.state === State.Playing;
  const isBuffering = playbackState.state === State.Buffering || playbackState.state === State.Loading;
  const progressPercent = progress.duration > 0 ? Math.min(100, (progress.position / progress.duration) * 100) : 0;

  return (
    <GestureDetector gesture={pan}>
      <PressableScale
        style={[styles.container, { bottom: bottomOffset }]}
        activeScale={0.99}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${currentTrack.title} by ${currentTrack.artist}. Tap to open player.`}
      >
        {/* Artwork */}
        <TrackArtwork
          youtubeId={currentTrack.youtube_id}
          uri={currentTrack.thumbnail_path || currentTrack.thumbnail_url || currentTrack.artwork}
          style={styles.artwork}
          placeholderIconSize={20}
        />

        {/* Meta Text */}
        <View style={styles.meta}>
          <MarqueeText text={currentTrack.title} style={styles.title} />
          <Text style={styles.artist} numberOfLines={1}>{currentTrack.artist}</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <PressableScale
            style={styles.controlBtn}
            onPress={PlayerControls.skipToPrevious}
            activeScale={0.85}
            accessibilityRole="button"
            accessibilityLabel="Previous track"
          >
            <Ionicons name="play-back" size={22} color={palette.text} />
          </PressableScale>

          <PressableScale 
            style={styles.controlBtn} 
            onPress={isPlaying ? PlayerControls.pause : PlayerControls.play}
            activeScale={0.85}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Ionicons name={isPlaying ? "pause" : "play"} size={22} color={palette.text} />
            )}
          </PressableScale>
          
          <PressableScale
            style={styles.controlBtn}
            onPress={PlayerControls.skipToNext}
            activeScale={0.85}
            accessibilityRole="button"
            accessibilityLabel="Next track"
          >
            <Ionicons name="play-forward" size={22} color={palette.text} />
          </PressableScale>
        </View>

        {/* Thin progress line */}
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </PressableScale>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 60, // Sits exactly above the custom bottom tab bar which is 60px high
    left: 14,
    right: 14,
    height: 56,
    backgroundColor: palette.surfaceAlt, // obsidian black tint
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    overflow: 'hidden',
  },
  artwork: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: palette.border,
  },
  meta: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  title: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  artist: {
    color: palette.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBtn: {
    padding: 8,
    marginLeft: 4,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.accent,
  },
});
