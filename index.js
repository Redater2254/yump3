import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import { playbackService } from './playback-service';

// Register the background playback service
TrackPlayer.registerPlaybackService(() => playbackService);

export function App() {
  // Expo Router context for resolving screens
  const ctx = require.context('./src/app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
