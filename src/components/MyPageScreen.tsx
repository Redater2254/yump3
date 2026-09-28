import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const BETA_TRANSITION_KEY = 'yump3_beta_smart_transition';
const BETA_TIMER_KEY = 'yump3_beta_sleep_timer';

export const MyPageScreen: React.FC = () => {
  const { showAlert, showToast } = useAlert();

  const [librarySize, setLibrarySize] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [clearing, setClearing] = useState(false);

  const [betaSmartTransition, setBetaSmartTransition] = useState(false);
  const [betaSleepTimer, setBetaSleepTimer] = useState(false);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [audioQuality, setAudioQualityState] = useState('best');
  const [showBetaModal, setShowBetaModal] = useState(false);

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

  const handleSetQuality = async (value: string) => {
    setAudioQualityState(value);
    await setAudioQuality(value);
    showToast('다운로드 음질을 저장했습니다.');
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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.mainTitle}>yump3</Text>

        {/* Storage */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>저장 공간</Text>
          {loadingStats ? (
            <ActivityIndicator color="#00e676" style={{ marginVertical: 16 }} />
          ) : (
            <>
              <View style={styles.storageRow}>
                <Text style={styles.storageLabel}>저장된 음악</Text>
                <Text style={styles.storageValue}>{formatBytes(librarySize)}</Text>
              </View>
              <View style={styles.divider} />
              <PressableScale
                style={[styles.actionBtn, { borderColor: '#ff1744' }]}
                onPress={confirmClear}
                disabled={clearing}
                activeScale={0.96}
              >
                {clearing ? (
                  <ActivityIndicator color="#ff1744" size="small" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: '#ff1744' }]}>모든 음악 삭제</Text>
                )}
              </PressableScale>
            </>
          )}
        </View>

        {/* Import */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>음악 가져오기</Text>
          <Text style={styles.cardSub}>
            PC나 파일 관리자로 옮겨 둔 MP3를 라이브러리에 추가합니다.
            {'\n'}경로: Android/media/com.yump3/yump3/
          </Text>
          <PressableScale
            style={[styles.actionBtn, { borderColor: '#00e676', marginTop: 12 }]}
            onPress={handleImport}
            disabled={importing}
            activeScale={0.96}
          >
            {importing ? (
              <ActivityIndicator color="#00e676" size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: '#00e676' }]}>폴더 스캔해서 가져오기</Text>
            )}
          </PressableScale>
        </View>

        {/* Downloader */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>다운로더</Text>
          <Text style={styles.cardSub}>
            YouTube 추출기(yt-dlp)를 최신 버전으로 유지하면 다운로드가 계속 동작합니다.
          </Text>
          <PressableScale
            style={[styles.actionBtn, { borderColor: '#00e676', marginTop: 12 }]}
            onPress={handleUpdateYtDlp}
            disabled={updating}
            activeScale={0.96}
          >
            {updating ? (
              <ActivityIndicator color="#00e676" size="small" />
            ) : (
              <Text style={[styles.actionBtnText, { color: '#00e676' }]}>yt-dlp 업데이트</Text>
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
                style={[styles.actionBtn, { borderColor: '#2d3342', marginTop: 10 }]}
                onPress={handleCancelUpdate}
                activeScale={0.96}
              >
                <Text style={[styles.actionBtnText, { color: '#9098a8' }]}>다운로드 취소</Text>
              </PressableScale>
            </View>
          )}

          {!!updateState?.error && (
            <Text style={[styles.cardSub, { color: '#ff8a80', marginTop: 10 }]}>
              다운로드에 실패했습니다. 다시 시도해주세요.
            </Text>
          )}

          {updateState?.ready ? (
            <PressableScale
              style={[styles.actionBtn, { borderColor: '#00e676', marginTop: 12 }]}
              onPress={handleInstallUpdate}
              disabled={installingUpdate}
              activeScale={0.96}
            >
              {installingUpdate ? (
                <ActivityIndicator color="#00e676" size="small" />
              ) : (
                <Text style={[styles.actionBtnText, { color: '#00e676' }]}>설치하기</Text>
              )}
            </PressableScale>
          ) : !updateActive ? (
            <PressableScale
              style={[styles.actionBtn, { borderColor: '#00e676', marginTop: 12 }]}
              onPress={handleCheckUpdate}
              disabled={checkingUpdate}
              activeScale={0.96}
            >
              {checkingUpdate ? (
                <ActivityIndicator color="#00e676" size="small" />
              ) : (
                <Text style={[styles.actionBtnText, { color: '#00e676' }]}>업데이트 확인</Text>
              )}
            </PressableScale>
          ) : null}
        </View>

        {/* Beta lab */}
        <PressableScale
          style={styles.betaRow}
          onPress={() => setShowBetaModal(true)}
          activeScale={0.98}
        >
          <View style={styles.betaRowLeft}>
            <View style={styles.betaFlask}>
              <Ionicons name="flask-outline" size={20} color="#00e676" />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.betaRowTitle}>Beta 연구소</Text>
              <Text style={styles.betaRowSub}>실험적인 기능들을 사용해보세요.</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#7c8598" />
        </PressableScale>

        <Text style={styles.footerVersion}>yump3 v1.0.0 · GPL-3.0</Text>
      </ScrollView>

      {/* Beta modal */}
      <Modal
        visible={showBetaModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBetaModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.betaModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="flask" size={22} color="#00e676" style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>yump3 Beta 연구소</Text>
              </View>
              <PressableScale onPress={() => setShowBetaModal(false)} activeScale={0.8}>
                <Ionicons name="close" size={24} color="#ffffff" />
              </PressableScale>
            </View>

            <ScrollView contentContainerStyle={styles.betaModalContent}>
              <Text style={styles.betaWelcome}>
                개발 중인 기능입니다. 일부는 불안정할 수 있습니다.
              </Text>

              <View style={styles.betaSettingRow}>
                <View style={{ flex: 1, paddingRight: 15 }}>
                  <Text style={styles.betaSettingTitle}>스마트 트랜지션 (BPM & Key)</Text>
                  <Text style={styles.betaSettingDesc}>
                    곡 전환 시 템포와 음계를 매칭하고 대기열을 자동 정렬합니다.
                  </Text>
                </View>
                <PressableScale
                  style={[styles.toggleBtn, betaSmartTransition ? styles.toggleOn : styles.toggleOff]}
                  onPress={() => toggleSetting('transition')}
                >
                  <View style={[styles.toggleDot, betaSmartTransition ? styles.dotOn : styles.dotOff]} />
                </PressableScale>
              </View>

              <View style={styles.betaDivider} />

              <View style={styles.betaSettingRow}>
                <View style={{ flex: 1, paddingRight: 15 }}>
                  <Text style={styles.betaSettingTitle}>취침 예약 타이머</Text>
                  <Text style={styles.betaSettingDesc}>
                    설정한 시간이 되면 페이드 아웃과 함께 재생을 멈춥니다.
                  </Text>
                </View>
                <PressableScale
                  style={[styles.toggleBtn, betaSleepTimer ? styles.toggleOn : styles.toggleOff]}
                  onPress={() => toggleSetting('timer')}
                >
                  <View style={[styles.toggleDot, betaSleepTimer ? styles.dotOn : styles.dotOff]} />
                </PressableScale>
              </View>

              {betaSleepTimer && (
                <View style={styles.timerSection}>
                  <Text style={styles.timerLabel}>
                    {sleepRemaining > 0
                      ? `남은 시간: ${Math.floor(sleepRemaining / 60)}분 ${sleepRemaining % 60}초`
                      : '종료 시간 예약'}
                  </Text>
                  <View style={styles.timerChipRow}>
                    {[10, 20, 30, 60].map((min) => {
                      const isActive = selectedMinutes === min && sleepRemaining > 0;
                      return (
                        <PressableScale
                          key={min}
                          style={[styles.timerChip, isActive && styles.timerChipActive]}
                          onPress={() => handleStartTimer(min)}
                        >
                          <Text style={[styles.timerChipText, isActive && styles.timerChipTextActive]}>
                            {min}분
                          </Text>
                        </PressableScale>
                      );
                    })}
                    {sleepRemaining > 0 && (
                      <PressableScale
                        style={[styles.timerChip, styles.timerChipCancel]}
                        onPress={handleStopTimer}
                      >
                        <Text style={styles.timerChipTextCancel}>취소</Text>
                      </PressableScale>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.betaDivider} />

              <View style={styles.betaSettingRow}>
                <View style={{ flex: 1, paddingRight: 15 }}>
                  <Text style={styles.betaSettingTitle}>진동 피드백 (Haptics)</Text>
                  <Text style={styles.betaSettingDesc}>
                    버튼을 누를 때 가벼운 진동으로 촉각 피드백을 제공합니다.
                  </Text>
                </View>
                <PressableScale
                  style={[styles.toggleBtn, hapticsEnabled ? styles.toggleOn : styles.toggleOff]}
                  onPress={() => toggleSetting('haptics')}
                >
                  <View style={[styles.toggleDot, hapticsEnabled ? styles.dotOn : styles.dotOff]} />
                </PressableScale>
              </View>
            </ScrollView>

            <PressableScale style={styles.betaCloseBtn} onPress={() => setShowBetaModal(false)} activeScale={0.97}>
              <Text style={styles.betaCloseBtnText}>완료</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0e12' },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 50, paddingBottom: 100 },
  mainTitle: { fontSize: 26, fontWeight: '900', color: '#ffffff', marginBottom: 20 },
  card: {
    backgroundColor: '#161920',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#20242e',
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
  cardSub: { color: '#7c8598', fontSize: 12, lineHeight: 17 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storageLabel: { color: '#9098a8', fontSize: 13 },
  storageValue: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#20242e', marginVertical: 16 },
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
    backgroundColor: '#20242e',
    overflow: 'hidden',
  },
  updateFill: { height: '100%', borderRadius: 3, backgroundColor: '#00e676' },
  updatePercent: { color: '#00e676', fontSize: 11, fontWeight: '700', marginTop: 6 },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  qualityChip: {
    backgroundColor: '#20242e',
    borderWidth: 1,
    borderColor: '#2d3342',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  qualityChipActive: { backgroundColor: 'rgba(0, 230, 118, 0.12)', borderColor: '#00e676' },
  qualityChipText: { color: '#9098a8', fontSize: 12, fontWeight: '600' },
  qualityChipTextActive: { color: '#00e676' },
  betaRow: {
    backgroundColor: '#161920',
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
    borderRadius: 10,
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  betaRowTitle: { color: '#00e676', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  betaRowSub: { color: '#7c8598', fontSize: 11 },
  footerVersion: { textAlign: 'center', color: '#7c8598', fontSize: 11, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  betaModalCard: {
    backgroundColor: '#161920',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: '#20242e',
    borderBottomWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#20242e',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  betaModalContent: { paddingBottom: 20 },
  betaWelcome: {
    color: '#9098a8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 24,
    backgroundColor: '#1b1f28',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#242a38',
  },
  betaSettingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betaSettingTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  betaSettingDesc: { color: '#7c8598', fontSize: 11, lineHeight: 15 },
  betaDivider: { height: 1, backgroundColor: '#20242e', marginVertical: 18 },
  toggleBtn: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#00e676' },
  toggleOff: { backgroundColor: '#3a3f50' },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff' },
  dotOn: { alignSelf: 'flex-end' },
  dotOff: { alignSelf: 'flex-start' },
  timerSection: {
    backgroundColor: '#1b1f28',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#242a38',
  },
  timerLabel: { color: '#00e676', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  timerChipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  timerChip: {
    backgroundColor: '#20242e',
    borderWidth: 1,
    borderColor: '#2d3342',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 6,
  },
  timerChipActive: { backgroundColor: 'rgba(0, 230, 118, 0.1)', borderColor: '#00e676' },
  timerChipCancel: { backgroundColor: '#3d121a', borderColor: '#6b1b29' },
  timerChipText: { color: '#9098a8', fontSize: 12, fontWeight: '600' },
  timerChipTextActive: { color: '#00e676' },
  timerChipTextCancel: { color: '#ff1744', fontSize: 12, fontWeight: '600' },
  betaCloseBtn: {
    backgroundColor: '#00e676',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  betaCloseBtnText: { color: '#0a0a0a', fontSize: 15, fontWeight: '700' },
});
