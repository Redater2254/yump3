import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { sheetStyles as styles } from './sheetStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  bitPerfect: boolean;
  onToggleBitPerfect: () => void;
  smartTransition: boolean;
  onToggleSmartTransition: () => void;
  sleepTimerEnabled: boolean;
  onToggleSleepTimer: () => void;
  hapticsEnabled: boolean;
  onToggleHaptics: () => void;
  sleepRemaining: number;
  selectedMinutes: number | null;
  onStartTimer: (minutes: number) => void;
  onStopTimer: () => void;
}

const TIMER_PRESETS = [10, 20, 30, 60];

/** Playback behaviour sheet: bit-perfect, smart transition, sleep timer, haptics. */
export const PlaybackModal: React.FC<Props> = ({
  visible,
  onClose,
  bitPerfect,
  onToggleBitPerfect,
  smartTransition,
  onToggleSmartTransition,
  sleepTimerEnabled,
  onToggleSleepTimer,
  hapticsEnabled,
  onToggleHaptics,
  sleepRemaining,
  selectedMinutes,
  onStartTimer,
  onStopTimer,
}) => {
  const renderToggle = (value: boolean, onPress: () => void, label: string) => (
    <PressableScale
      style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
      onPress={onPress}
      activeScale={0.95}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={[styles.toggleDot, value ? styles.dotOn : styles.dotOff]} />
    </PressableScale>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="play-circle" size={22} color={palette.accent} style={{ marginRight: 8 }} />
              <Text style={styles.title}>재생</Text>
            </View>
            <PressableScale onPress={onClose} activeScale={0.8} accessibilityLabel="닫기">
              <Ionicons name="close" size={24} color={palette.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.welcome}>재생 동작과 실험적인 기능을 설정합니다.</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>원음 모드 (비트퍼펙트 지향)</Text>
                <Text style={styles.settingDesc}>페이드·속도 램프·DSP를 끄고 원음 그대로 재생합니다.</Text>
              </View>
              {renderToggle(bitPerfect, onToggleBitPerfect, '원음 모드')}
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>스마트 트랜지션 (BPM & Key)</Text>
                <Text style={styles.settingDesc}>
                  곡 전환 시 템포와 음계를 매칭하고 대기열을 자동 정렬합니다.
                </Text>
              </View>
              {renderToggle(smartTransition, onToggleSmartTransition, '스마트 트랜지션')}
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>취침 예약 타이머</Text>
                <Text style={styles.settingDesc}>설정한 시간이 되면 재생을 멈춥니다.</Text>
              </View>
              {renderToggle(sleepTimerEnabled, onToggleSleepTimer, '취침 타이머')}
            </View>

            {sleepTimerEnabled && (
              <View style={styles.timerSection}>
                <Text style={styles.timerLabel}>
                  {sleepRemaining > 0
                    ? `남은 시간: ${Math.floor(sleepRemaining / 60)}분 ${sleepRemaining % 60}초`
                    : '종료 시간 예약'}
                </Text>
                <View style={styles.timerChipRow}>
                  {TIMER_PRESETS.map((minutes) => {
                    const active = selectedMinutes === minutes && sleepRemaining > 0;
                    return (
                      <PressableScale
                        key={minutes}
                        style={[styles.timerChip, active && styles.timerChipActive]}
                        onPress={() => onStartTimer(minutes)}
                        activeScale={0.95}
                      >
                        <Text style={[styles.timerChipText, active && styles.timerChipTextActive]}>
                          {minutes}분
                        </Text>
                      </PressableScale>
                    );
                  })}
                  {sleepRemaining > 0 && (
                    <PressableScale
                      style={[styles.timerChip, styles.timerChipCancel]}
                      onPress={onStopTimer}
                      activeScale={0.95}
                    >
                      <Text style={styles.timerChipTextCancel}>취소</Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>진동 피드백 (Haptics)</Text>
                <Text style={styles.settingDesc}>
                  버튼을 누를 때 가벼운 진동으로 촉각 피드백을 제공합니다.
                </Text>
              </View>
              {renderToggle(hapticsEnabled, onToggleHaptics, '진동 피드백')}
            </View>
          </ScrollView>

          <PressableScale style={styles.closeBtn} onPress={onClose} activeScale={0.97}>
            <Text style={styles.closeBtnText}>완료</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
};
