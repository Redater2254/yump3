import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { Slider } from '../ui/Slider';
import { sheetStyles as styles } from './sheetStyles';
import type { AudioEffectsInfo, AudioEffectsSettings } from '../../services/audioEffects';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: AudioEffectsSettings;
  info: AudioEffectsInfo;
  /** Updates local UI state while dragging. */
  onLocal: (patch: Partial<AudioEffectsSettings>) => void;
  /** Persists and applies the change. */
  onCommit: (patch: Partial<AudioEffectsSettings>) => void;
}

function formatFreq(hz: number) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(0)}k` : `${hz}`;
}

/** Equalizer / bass boost / 3D / loudness sheet. */
export const AudioModal: React.FC<Props> = ({
  visible,
  onClose,
  settings,
  info,
  onLocal,
  onCommit,
}) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Ionicons name="options" size={22} color={palette.accent} style={{ marginRight: 8 }} />
            <Text style={styles.title}>오디오</Text>
          </View>
          <PressableScale onPress={onClose} activeScale={0.8} accessibilityLabel="닫기">
            <Ionicons name="close" size={24} color={palette.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {settings.bitPerfect && (
            <Text style={styles.welcome}>
              원음 모드가 켜져 있어 오디오 효과가 적용되지 않습니다. 효과를 쓰려면 재생
              설정에서 원음 모드를 꺼주세요.
            </Text>
          )}

          {!info.available && (
            <Text style={styles.welcome}>
              이 기기에서는 이퀄라이저/3D 효과를 지원하지 않습니다.
            </Text>
          )}

          <View style={styles.settingRow}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>이퀄라이저</Text>
              <Text style={styles.settingDesc}>기기 EQ 밴드(프리셋/커스텀)를 조절합니다.</Text>
            </View>
            <PressableScale
              style={[styles.toggle, settings.enabled ? styles.toggleOn : styles.toggleOff]}
              onPress={() => onCommit({ enabled: !settings.enabled })}
              activeScale={0.95}
              accessibilityRole="switch"
              accessibilityState={{ checked: settings.enabled }}
              accessibilityLabel="이퀄라이저"
            >
              <View style={[styles.toggleDot, settings.enabled ? styles.dotOn : styles.dotOff]} />
            </PressableScale>
          </View>

          {settings.enabled && info.available && (
            <View style={{ marginTop: 6 }}>
              {info.presets && info.presets.length > 0 && (
                <View style={styles.chipRow}>
                  {info.presets.map((preset) => {
                    const active = settings.preset === preset.index;
                    return (
                      <PressableScale
                        key={preset.index}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => onCommit({ preset: preset.index })}
                        activeScale={0.95}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {preset.name}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              )}

              {(info.bands || []).map((band, index) => {
                const level = settings.bandLevels[index] ?? band.level;
                const dB = level / 100;
                const updateBand = (value: number) => {
                  const next = [...settings.bandLevels];
                  next[index] = value;
                  return next;
                };
                return (
                  <Slider
                    key={band.index}
                    label={`${formatFreq(band.centerFreq)} Hz`}
                    valueLabel={`${dB > 0 ? '+' : ''}${dB.toFixed(1)} dB`}
                    min={info.levelMin ?? -1500}
                    max={info.levelMax ?? 1500}
                    step={100}
                    value={level}
                    onChange={(value) => onLocal({ preset: null, bandLevels: updateBand(value) })}
                    onComplete={(value) => onCommit({ preset: null, bandLevels: updateBand(value) })}
                  />
                );
              })}

              <Slider
                label="베이스 부스트"
                valueLabel={`${Math.round((settings.bass / 1000) * 100)}%`}
                min={0}
                max={1000}
                step={50}
                value={settings.bass}
                onChange={(value) => onLocal({ bass: value })}
                onComplete={(value) => onCommit({ bass: value })}
              />
              <Slider
                label="3D 음향 (가상화)"
                valueLabel={`${Math.round((settings.virtualizer / 1000) * 100)}%`}
                min={0}
                max={1000}
                step={50}
                value={settings.virtualizer}
                onChange={(value) => onLocal({ virtualizer: value })}
                onComplete={(value) => onCommit({ virtualizer: value })}
              />
              <Slider
                label="라우드니스"
                valueLabel={`+${(settings.loudness / 100).toFixed(0)} dB`}
                min={0}
                max={2000}
                step={100}
                value={settings.loudness}
                onChange={(value) => onLocal({ loudness: value })}
                onComplete={(value) => onCommit({ loudness: value })}
              />
            </View>
          )}
        </ScrollView>

        <PressableScale style={styles.closeBtn} onPress={onClose} activeScale={0.97}>
          <Text style={styles.closeBtnText}>완료</Text>
        </PressableScale>
      </View>
    </View>
  </Modal>
);
