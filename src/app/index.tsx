import { palette } from '../theme';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  StatusBar,
  AppState,
  BackHandler,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchScreen } from '../components/SearchScreen';
import { PlaylistScreen } from '../components/PlaylistScreen';
import { PlayerScreen } from '../components/PlayerScreen';
import { MyPageScreen } from '../components/MyPageScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { GlobalDownloadIndicator } from '../components/GlobalDownloadIndicator';
import { setupPlayer, PlayerControls, State, setBitPerfectMode } from '../services/player';
import { loadAudioSettings, applyAudioSettings } from '../services/audioEffects';
import Reanimated, { FadeIn, FadeOut, withTiming, withSpring, Easing, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { PressableScale } from '../components/ui/PressableScale';

SplashScreen.preventAutoHideAsync().catch(() => {});

const screenEntering = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.975 }, { translateY: 6 }] },
    animations: {
      opacity: withTiming(1, { duration: 170, easing: Easing.out(Easing.cubic) }),
      transform: [
        { scale: withSpring(1, { damping: 22, stiffness: 340, mass: 0.5 }) },
        { translateY: withSpring(0, { damping: 22, stiffness: 340, mass: 0.5 }) },
      ],
    },
  };
};

const screenExiting = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 100, easing: Easing.in(Easing.cubic) }),
      transform: [{ scale: withTiming(0.99, { duration: 100, easing: Easing.in(Easing.cubic) }) }],
    },
  };
};

type TabName = 'search' | 'library' | 'player' | 'mypage';

export default function Index() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;

  const [activeTab, setActiveTab] = useState<TabName>('search');
  const [tabHistory, setTabHistory] = useState<TabName[]>(['search']);
  const [showExitToast, setShowExitToast] = useState(false);
  const exitTimeoutRef = useRef<any>(null);

  const [appReady, setAppReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const splashFadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setAppReady(true);
    SplashScreen.hideAsync().catch(() => {});
    Animated.timing(splashFadeAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: true,
    }).start(() => setSplashVisible(false));
  }, []);

  useEffect(() => {
    setTabHistory((prev) => {
      const filtered = prev.filter((t) => t !== activeTab);
      return [...filtered, activeTab];
    });
  }, [activeTab]);

  useEffect(() => {
    const handleAppState = (nextAppState: string) => {
      if (nextAppState !== 'active') {
        setShowExitToast(false);
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (tabHistory.length > 1) {
        const newHistory = [...tabHistory];
        newHistory.pop();
        setTabHistory(newHistory);
        setActiveTab(newHistory[newHistory.length - 1]);
        return true;
      }
      if (activeTab !== 'search') {
        setActiveTab('search');
        return true;
      }
      if (!showExitToast) {
        setShowExitToast(true);
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = setTimeout(() => setShowExitToast(false), 2000);
        return true;
      }
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [tabHistory, activeTab, showExitToast]);

  useEffect(() => {
    setupPlayer().then(async () => {
      const settings = await loadAudioSettings();
      setBitPerfectMode(settings.bitPerfect);
      await applyAudioSettings(settings);
    });
    const checkActiveTrackAndRoute = async () => {
      try {
        const activeTrack = await PlayerControls.getCurrentTrack();
        if (!activeTrack) return;
        const stateObj = await PlayerControls.getPlaybackState();
        const playbackState = stateObj && stateObj.state !== undefined ? stateObj.state : stateObj;
        if (
          playbackState === State.Playing ||
          playbackState === State.Buffering ||
          playbackState === State.Loading
        ) {
          setActiveTab('player');
        }
      } catch (e) {
        // ignore
      }
    };
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') checkActiveTrackAndRoute();
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    setTimeout(() => checkActiveTrackAndRoute(), 1000);
    return () => subscription.remove();
  }, []);

  if (!appReady) return null;

  const renderActiveTabContent = () => {
    let content;
    switch (activeTab) {
      case 'search':
        content = <SearchScreen />;
        break;
      case 'library':
        content = <PlaylistScreen isActive={activeTab === 'library'} />;
        break;
      case 'player':
        content = <PlayerScreen />;
        break;
      case 'mypage':
        content = <MyPageScreen />;
        break;
      default:
        content = <SearchScreen />;
    }
    return (
      <Reanimated.View
        key={activeTab}
        entering={reduceMotion ? undefined : screenEntering}
        exiting={reduceMotion ? undefined : screenExiting}
        style={{ flex: 1 }}
      >
        {content}
      </Reanimated.View>
    );
  };

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="light-content" backgroundColor={palette.bg} />

      <View style={styles.tabContentContainer}>{renderActiveTabContent()}</View>

      {activeTab !== 'player' && <MiniPlayer onPress={() => setActiveTab('player')} />}

      <GlobalDownloadIndicator />

      {/* Bottom tabs: Search / Library / My Page */}
      <View style={[styles.tabBar, { height: 60 + bottomInset, paddingBottom: bottomInset }]}>
        <PressableScale
          style={styles.tabItem}
          onPress={() => setActiveTab('search')}
          accessibilityRole="tab"
          accessibilityLabel="검색"
          accessibilityState={{ selected: activeTab === 'search' }}
        >
          <Ionicons
            name={activeTab === 'search' ? 'search' : 'search-outline'}
            size={22}
            color={activeTab === 'search' ? palette.accent : palette.textDim}
          />
          <Text style={[styles.tabLabel, activeTab === 'search' && styles.tabLabelActive]}>검색</Text>
        </PressableScale>

        <PressableScale
          style={styles.tabItem}
          onPress={() => setActiveTab('library')}
          accessibilityRole="tab"
          accessibilityLabel="보관함"
          accessibilityState={{ selected: activeTab === 'library' }}
        >
          <Ionicons
            name={activeTab === 'library' ? 'musical-notes' : 'musical-notes-outline'}
            size={22}
            color={activeTab === 'library' ? palette.accent : palette.textDim}
          />
          <Text style={[styles.tabLabel, activeTab === 'library' && styles.tabLabelActive]}>보관함</Text>
        </PressableScale>

        <PressableScale
          style={styles.tabItem}
          onPress={() => setActiveTab('mypage')}
          accessibilityRole="tab"
          accessibilityLabel="마이 페이지"
          accessibilityState={{ selected: activeTab === 'mypage' }}
        >
          <Ionicons
            name={activeTab === 'mypage' ? 'person' : 'person-outline'}
            size={22}
            color={activeTab === 'mypage' ? palette.accent : palette.textDim}
          />
          <Text style={[styles.tabLabel, activeTab === 'mypage' && styles.tabLabelActive]}>마이</Text>
        </PressableScale>
      </View>

      {showExitToast && (
        <Reanimated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={[styles.exitToast, { bottom: 130 + bottomInset }]}
        >
          <Text style={styles.exitToastText}>정말 끄시겠습니까? 한번 더 누르면 종료됩니다.</Text>
        </Reanimated.View>
      )}

      {splashVisible && (
        <Animated.View style={[styles.customSplash, { opacity: splashFadeAnim }]} pointerEvents="none">
          <Image source={require('../../assets/images/splash-icon.png')} style={styles.splashLogo} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: { flex: 1, backgroundColor: palette.bg },
  tabContentContainer: { flex: 1 },
  tabBar: {
    height: 60,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: palette.border,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, flex: 1 },
  tabLabel: { fontSize: 12, color: palette.textDim, marginTop: 4, fontWeight: '600' },
  tabLabelActive: { color: palette.accent },
  exitToast: {
    position: 'absolute',
    bottom: 130,
    left: '15%',
    right: '15%',
    backgroundColor: 'rgba(30, 34, 44, 0.95)',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  exitToastText: { color: palette.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  customSplash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  splashLogo: { width: 150, height: 150, resizeMode: 'contain' },
});
