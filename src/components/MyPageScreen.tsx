import { palette } from '../theme';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import { clearLibrary } from '../services/library';
import { LIBRARY_DIR, updateYtDlp, isYtDlpAvailable, friendlyYtDlpError } from '../services/ytdlp';
import { importLibraryFromFolder } from '../services/importer';
import {
  getInstalledVersion,
  loadInstalledVersion,
  checkForUpdate,
  startUpdateDownload,
  getUpdateDownloadState,
  cancelUpdateDownload,
  installDownloadedUpdate,
  UpdateDownloadState,
} from '../services/updater';
import {
  startSleepTimer,
  stopSleepTimer,
  getSleepTimerRemaining,
} from '../services/player';
import { isHapticsEnabled, setHapticsEnabled, hapticLight } from '../services/haptics';
import { AUDIO_QUALITY_OPTIONS, getAudioQuality, setAudioQuality } from '../services/settings';
import {
  DEFAULT_AUDIO_SETTINGS,
  loadAudioSettings,
  saveAudioSettings,
  applyAudioSettings,
  getAudioEffectsInfo,
  AudioEffectsInfo,
  AudioEffectsSettings,
} from '../services/audioEffects';
import { setBitPerfectMode } from '../services/player';
import { PlaybackModal } from './mypage/PlaybackModal';
import { AudioModal } from './mypage/AudioModal';

const BETA_TRANSITION_KEY = 'yump3_beta_smart_transition';
const BETA_TIMER_KEY = 'yump3_beta_sleep_timer';

export const MyPageScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useAlert();

  const [librarySize, setLibrarySize] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [clearing, setClearing] = useState(false);

  const [betaSmartTransition, setBetaSmartTransition] = useState(false);
  const [betaSleepTimer, setBetaSleepTimer] = useState(false);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [audioQuality, setAudioQualityState] = useState('best');
  const [showBetaModal, setShowBetaModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioEffectsSettings>(DEFAULT_AUDIO_SETTINGS);
  const [audioInfo, setAudioInfo] = useState<AudioEffectsInfo>({ available: false, sessionId: 0 });

  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);

  const [updating, setUpdating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateDownloadState | null>(null);
  const [appVersion, setAppVersion] = useState(getInstalledVersion());

  const updateActive = !!updateState?.running;

  const refreshUpdateState = async () => {
    const state = await getUpdateDownloadState();
    setUpdateState(state);
    return state;
  };

  const startUpdate = async (info: any) => {
    try {
      await startUpdateDownload(info);
      showToast('백그라운드에서 다운로드합니다. 알림에서 진행률을 확인하세요.', 'info');
      await refreshUpdateState();
    } catch (e: any) {
      showAlert('업데이트 실패', String(e?.message || e));
    }
  };

  const handleInstallUpdate = async () => {
    setInstallingUpdate(true);
    try {
      const launched = await installDownloadedUpdate();
      if (!launched) {
        showAlert(
          '설치 권한 필요',
          '설정에서 "이 출처의 앱 설치 허용"을 켠 뒤 다시 시도해주세요.'
        );
      }
    } catch (e: any) {
      showAlert('설치 실패', String(e?.message || e));
    } finally {
      setInstallingUpdate(false);
    }
  };

  const handleCancelUpdate = () => {
    showAlert('다운로드 취소', '진행 중인 업데이트 다운로드를 취소할까요?', [
      { text: '계속', style: 'cancel' },
      {
        text: '취소',
        style: 'destructive',
        onPress: async () => {
          await cancelUpdateDownload();
          await refreshUpdateState();
        },
      },
    ]);
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkForUpdate();
      if (info.error) {
        showAlert('업데이트 확인 실패', '네트워크를 확인해주세요.\n\n' + info.error);
        return;
      }
      if (!info.hasUpdate) {
        showToast(`최신 버전입니다 (v${info.installed})`);
        return;
      }
      const sizeMb = info.size ? ` (${(info.size / 1048576).toFixed(0)}MB)` : '';
      showAlert(
        `새 버전 v${info.latest}`,
        `현재 v${info.installed} → v${info.latest}${sizeMb}\n\n백그라운드로 다운로드할까요?`,
        [
          { text: '나중에', style: 'cancel' },
          { text: '업데이트', onPress: () => startUpdate(info) },
        ]
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importLibraryFromFolder();
      await loadStats();
      if (result.added > 0) {
        const extra = result.playlists > 0 ? ` · 플레이리스트 ${result.playlists}개` : '';
        showToast(`${result.added}곡을 라이브러리에 추가했습니다.${extra}`);
      } else if (result.total > 0) {
        showToast('이미 모두 라이브러리에 있습니다.');
      } else {
        showToast('폴더에서 MP3 파일을 찾지 못했습니다.', 'info');
      }
    } catch (e: any) {
      showAlert('가져오기 실패', String(e?.message || e));
    } finally {
      setImporting(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const info = await FileSystem.getInfoAsync(LIBRARY_DIR);
      let total = 0;
      if (info.exists) {
        const files = await FileSystem.readDirectoryAsync(LIBRARY_DIR);
        for (const f of files) {
          const fi = await FileSystem.getInfoAsync(`${LIBRARY_DIR}${f}`);
          total += (fi as any).size || 0;
        }
      }
      setLibrarySize(total);
    } catch (e) {
      setLibrarySize(0);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadSettings = async () => {
    try {
      setBetaSmartTransition((await AsyncStorage.getItem(BETA_TRANSITION_KEY)) === 'true');
      setBetaSleepTimer((await AsyncStorage.getItem(BETA_TIMER_KEY)) === 'true');
      setHapticsEnabledState(isHapticsEnabled());
      setAudioQualityState(await getAudioQuality());
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadStats();
    loadSettings();
    loadInstalledVersion().then(setAppVersion);
    refreshUpdateState();
    const interval = setInterval(() => {
      const remaining = getSleepTimerRemaining();
      setSleepRemaining(remaining);
      if (remaining === 0) setSelectedMinutes(null);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!updateActive) return;
    const timer = setInterval(refreshUpdateState, 1500);
    return () => clearInterval(timer);
  }, [updateActive]);

  // Toast only when a download we actually watched finishes (not for stale files).
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (updateState?.running) {
      wasRunningRef.current = true;
      return;
    }
    if (updateState?.ready && wasRunningRef.current) {
      wasRunningRef.current = false;
      showToast('업데이트 다운로드 완료! "설치"를 눌러주세요.');
    }
  }, [updateState?.running, updateState?.ready]);

  const toggleSetting = async (key: 'transition' | 'timer' | 'haptics') => {
    if (key === 'haptics') {
      const next = !hapticsEnabled;
      setHapticsEnabledState(next);
      await setHapticsEnabled(next);
      if (next) hapticLight();
      return;
    }
    if (key === 'transition') {
      const next = !betaSmartTransition;
      setBetaSmartTransition(next);
      await AsyncStorage.setItem(BETA_TRANSITION_KEY, next ? 'true' : 'false');
      return;
    }
    const next = !betaSleepTimer;
    setBetaSleepTimer(next);
    await AsyncStorage.setItem(BETA_TIMER_KEY, next ? 'true' : 'false');
    if (!next) handleStopTimer();
  };

  const handleStartTimer = (minutes: number) => {
    setSelectedMinutes(minutes);
    startSleepTimer(minutes, (remaining: number) => {
      setSleepRemaining(remaining);
      if (remaining === 0) setSelectedMinutes(null);
    });
  };

  const handleStopTimer = () => {
    setSelectedMinutes(null);
    setSleepRemaining(0);
    stopSleepTimer();
  };

  const confirmClear = () => {
    showAlert(
      '모든 음악 삭제',
      '기기에 저장된 모든 곡과 플레이리스트를 삭제할까요? 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              const info = await FileSystem.getInfoAsync(LIBRARY_DIR);
              if (info.exists) {
                await FileSystem.deleteAsync(LIBRARY_DIR, { idempotent: true });
              }
              await clearLibrary();
              await loadStats();
              showToast('모든 음악을 삭제했습니다.');
            } catch (e) {
              showAlert('오류', '삭제에 실패했습니다.');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleSetQuality = async (value: string) => {    setAudioQualityState(value);
    await setAudioQuality(value);
    showToast('다운로드 음질을 저장했습니다.');
  };

  const openAudioModal = async () => {
    try {
      const [settings, info] = await Promise.all([loadAudioSettings(), getAudioEffectsInfo()]);
      const merged: AudioEffectsSettings = { ...settings };
      if (
        (!merged.bandLevels || merged.bandLevels.length === 0) &&
        info.bands &&
        info.bands.length > 0
      ) {
        merged.bandLevels = info.bands.map((band) => band.level);
      }
      setAudioSettings(merged);
      setAudioInfo(info);
      setShowAudioModal(true);
    } catch (e) {
      showAlert('오류', '오디오 설정을 불러오지 못했습니다.');
    }
  };

  const updateAudioLocal = (patch: Partial<AudioEffectsSettings>) => {
    setAudioSettings((prev) => ({ ...prev, ...patch }));
  };

  const commitAudio = async (patch: Partial<AudioEffectsSettings>) => {
    const next: AudioEffectsSettings = { ...audioSettings, ...patch };
    setAudioSettings(next);
    if (next.bitPerfect !== audioSettings.bitPerfect) {
      setBitPerfectMode(next.bitPerfect);
    }
    await saveAudioSettings(next);
    const applied = await applyAudioSettings(next);
    if (!applied && next.enabled && !audioInfo.available) {
      showToast('이 기기에서는 오디오 효과를 사용할 수 없습니다.', 'error');
    }
  };

  const handleUpdateYtDlp = async () => {
    if (!isYtDlpAvailable) {
      showAlert('오류', '이 기기에서는 다운로더를 사용할 수 없습니다.');
      return;
    }
    setUpdating(true);
    try {
      const status = await updateYtDlp();
      if (status === 'ALREADY_UP_TO_DATE') {
        showToast('이미 최신 버전입니다.');
      } else {
        showToast('yt-dlp를 최신 버전으로 업데이트했습니다.');
      }
    } catch (e: any) {
      showAlert('업데이트 실패', friendlyYtDlpError(e?.message || e));
    } finally {
      setUpdating(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.mainTitle}>yump3</Text>

        {/* Storage */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>저장 공간</Text>
          {loadingStats ? (
            <ActivityIndicator color={palette.accent} style={{ marginVertical: 16 }} />
          ) : (
            <View style={styles.storageRow}>
              <Text style={styles.storageLabel}>저장된 음악</Text>
              <Text style={styles.storageValue}>{formatBytes(librarySize)}</Text>
            </View>
          )}
          <PressableScale
            style={[styles.actionBtn, { borderColor: palette.accent, marginTop: 16 }]}
            onPress={handleImport}
            disabled={importing}
            activeScale={0.96}
          >
            {importing ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: palette.accent }]}>음악 가져오기</Text>
            )}
          </PressableScale>
          <Text style={[styles.cardSub, { marginTop: 8 }]}>
            파일 관리자로 Android/media/com.yump3/yump3/ 에 옮긴 MP3를 라이브러리에 추가합니다.
          </Text>
        </View>

        {/* Downloader */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>다운로더</Text>
          <Text style={styles.cardSub}>
            YouTube 추출기(yt-dlp)를 최신 버전으로 유지하면 다운로드가 계속 동작합니다.
          </Text>
          <PressableScale
            style={[styles.actionBtn, { borderColor: palette.accent, marginTop: 12 }]}
            onPress={handleUpdateYtDlp}
            disabled={updating}
            activeScale={0.96}
          >
            {updating ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: palette.accent }]}>yt-dlp 업데이트</Text>
            )}
          </PressableScale>

          <Text style={[styles.cardSub, { marginTop: 16 }]}>다운로드 음질</Text>
          <View style={styles.qualityRow}>
            {AUDIO_QUALITY_OPTIONS.map((opt) => {
              const active = audioQuality === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  style={[styles.qualityChip, active && styles.qualityChipActive]}
                  onPress={() => handleSetQuality(opt.value)}
                  activeScale={0.95}
                >
                  <Text style={[styles.qualityChipText, active && styles.qualityChipTextActive]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* App update */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>앱 업데이트</Text>
          <Text style={styles.cardSub}>현재 버전 v{appVersion}</Text>

          {updateActive && updateState && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.updateTrack}>
                <View
                  style={[styles.updateFill, { width: `${Math.round(updateState.progress * 100)}%` }]}
                />
              </View>
              <Text style={styles.updatePercent}>
                {Math.round(updateState.progress * 100)}% · 백그라운드 다운로드 중 (알림에서 확인)
              </Text>
              <PressableScale
                style={[styles.actionBtn, { borderColor: palette.borderStrong, marginTop: 10 }]}
                onPress={handleCancelUpdate}
                activeScale={0.96}
              >
                <Text style={[styles.actionBtnText, { color: palette.textMuted }]}>다운로드 취소</Text>
              </PressableScale>
            </View>
          )}

          {!!updateState?.error && (
            <Text style={[styles.cardSub, { color: palette.dangerSoft, marginTop: 10 }]}>
              다운로드에 실패했습니다. 다시 시도해주세요.
            </Text>
          )}

          {updateState?.ready ? (
            <PressableScale
              style={[styles.actionBtn, { borderColor: palette.accent, marginTop: 12 }]}
              onPress={handleInstallUpdate}
              disabled={installingUpdate}
              activeScale={0.96}
            >
              {installingUpdate ? (
                <ActivityIndicator color={palette.accent} size="small" />
              ) : (
                <Text style={[styles.actionBtnText, { color: palette.accent }]}>설치하기</Text>
              )}
            </PressableScale>
          ) : !updateActive ? (
            <PressableScale
              style={[styles.actionBtn, { borderColor: palette.accent, marginTop: 12 }]}
              onPress={handleCheckUpdate}
              disabled={checkingUpdate}
              activeScale={0.96}
            >
              {checkingUpdate ? (
                <ActivityIndicator color={palette.accent} size="small" />
              ) : (
                <Text style={[styles.actionBtnText, { color: palette.accent }]}>업데이트 확인</Text>
              )}
            </PressableScale>
          ) : null}
        </View>

        {/* Audio */}
        <PressableScale
          style={styles.betaRow}
          onPress={openAudioModal}
          activeScale={0.98}
        >
          <View style={styles.betaRowLeft}>
            <View style={styles.betaFlask}>
              <Ionicons name="options-outline" size={20} color={palette.accent} />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.betaRowTitle}>오디오</Text>
              <Text style={styles.betaRowSub}>이퀄라이저 · 3D 음향 · 원음 모드</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textDim} />
        </PressableScale>

        {/* Beta lab */}
        <PressableScale
          style={styles.betaRow}
          onPress={() => setShowBetaModal(true)}
          activeScale={0.98}
        >
          <View style={styles.betaRowLeft}>
            <View style={styles.betaFlask}>
              <Ionicons name="flask-outline" size={20} color={palette.accent} />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.betaRowTitle}>재생</Text>
              <Text style={styles.betaRowSub}>스마트 트랜지션 · 취침 타이머 · 진동 · 원음 모드</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textDim} />
        </PressableScale>

        {/* Danger zone */}
        <View style={[styles.card, { borderColor: 'rgba(255, 59, 48, 0.35)' }]}>
          <Text style={[styles.cardTitle, { color: palette.danger }]}>데이터 관리</Text>
          <Text style={styles.cardSub}>
            기기에 저장된 모든 곡과 플레이리스트를 삭제합니다. 되돌릴 수 없습니다.
          </Text>
          <PressableScale
            style={[
              styles.actionBtn,
              {
                borderColor: palette.danger,
                backgroundColor: 'rgba(255, 59, 48, 0.08)',
                marginTop: 12,
              },
            ]}
            onPress={confirmClear}
            disabled={clearing}
            activeScale={0.96}
          >
            {clearing ? (
              <ActivityIndicator color={palette.danger} size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: palette.danger }]}>모든 음악 삭제</Text>
            )}
          </PressableScale>
        </View>

        <Text style={styles.footerVersion}>yump3 v{appVersion} · GPL-3.0</Text>
      </ScrollView>

      <PlaybackModal
        visible={showBetaModal}
        onClose={() => setShowBetaModal(false)}
        bitPerfect={audioSettings.bitPerfect}
        onToggleBitPerfect={() => commitAudio({ bitPerfect: !audioSettings.bitPerfect })}
        smartTransition={betaSmartTransition}
        onToggleSmartTransition={() => toggleSetting('transition')}
        sleepTimerEnabled={betaSleepTimer}
        onToggleSleepTimer={() => toggleSetting('timer')}
        hapticsEnabled={hapticsEnabled}
        onToggleHaptics={() => toggleSetting('haptics')}
        sleepRemaining={sleepRemaining}
        selectedMinutes={selectedMinutes}
        onStartTimer={handleStartTimer}
        onStopTimer={handleStopTimer}
      />

      <AudioModal
        visible={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        settings={audioSettings}
        info={audioInfo}
        onLocal={updateAudioLocal}
        onCommit={commitAudio}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  scrollContent: { flexGrow: 1, padding: 20, paddingBottom: 100 },
  mainTitle: { fontSize: 26, fontWeight: '900', color: palette.text, marginBottom: 20 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: palette.text, marginBottom: 10 },
  cardSub: { color: palette.textDim, fontSize: 12, lineHeight: 17 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storageLabel: { color: palette.textMuted, fontSize: 13 },
  storageValue: { color: palette.text, fontSize: 14, fontWeight: '700' },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  updateTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  updateFill: { height: '100%', borderRadius: 3, backgroundColor: palette.accent },
  updatePercent: { color: palette.accent, fontSize: 12, fontWeight: '700', marginTop: 6 },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  qualityChip: {
    backgroundColor: palette.border,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  qualityChipActive: { backgroundColor: 'rgba(0, 230, 118, 0.12)', borderColor: palette.accent },
  qualityChipText: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  qualityChipTextActive: { color: palette.accent },
  betaRow: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.25)',
    marginBottom: 24,
  },
  betaRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  betaFlask: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  betaRowTitle: { color: palette.accent, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  betaRowSub: { color: palette.textDim, fontSize: 12 },
  footerVersion: { textAlign: 'center', color: palette.textDim, fontSize: 12, marginTop: 10 },
});
