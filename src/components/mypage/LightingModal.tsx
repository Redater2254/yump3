import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { Slider } from '../ui/Slider';
import { sheetStyles as styles } from './sheetStyles';
import { LightingPreview } from './LightingPreview';
import {
  STAGE_LIGHT_PRESETS,
  type CoverPalette,
  type StageLightSettings,
} from '../../services/lighting';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: StageLightSettings;
  onChange: (patch: Partial<StageLightSettings>) => void;
  cover?: string | null;
  colors?: CoverPalette | null;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Lighting settings sheet with a live preview of the effect. */
export const LightingModal: React.FC<Props> = ({
  visible,
  onClose,
  settings,
  onChange,
  cover,
  colors,
}) => {
  const [draft, setDraft] = useState<StageLightSettings>(settings);

  useEffect(() => {
    if (visible) setDraft(settings);
  }, [visible, settings]);

  const patchDraft = (patch: Partial<StageLightSettings>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const commit = (patch: Partial<StageLightSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(patch);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="color-wand" size={22} color={palette.accent} style={{ marginRight: 8 }} />
              <Text style={styles.title}>조명 효과</Text>
            </View>
            <PressableScale onPress={onClose} activeScale={0.8} accessibilityLabel="닫기">
              <Ionicons name="close" size={24} color={palette.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={{ alignItems: 'center', paddingVertical: 6 }}>
              <LightingPreview
                settings={draft}
                cover={cover}
                colors={colors}
                size={126}
              />
              <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 6 }}>
                미리보기 (실제 재생 화면과 동일하게 적용됩니다)
              </Text>
            </View>

            <View style={styles.chipRow}>
              {STAGE_LIGHT_PRESETS.map((preset) => {
                const active =
                  near(draft.intensity, preset.settings.intensity ?? 0) &&
                  near(draft.size, preset.settings.size ?? 0) &&
                  near(draft.pulse, preset.settings.pulse ?? 0);
                return (
                  <PressableScale
                    key={preset.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => commit(preset.settings)}
                    activeScale={0.95}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {preset.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>

            <View style={[styles.settingRow, { marginTop: 14 }]}>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>조명 켜기</Text>
                <Text style={styles.settingDesc}>커버 색으로 화면을 은은하게 비춥니다.</Text>
              </View>
              <PressableScale
                style={[styles.toggle, draft.enabled ? styles.toggleOn : styles.toggleOff]}
                onPress={() => commit({ enabled: !draft.enabled })}
                activeScale={0.95}
                accessibilityRole="switch"
                accessibilityState={{ checked: draft.enabled }}
                accessibilityLabel="조명 효과"
              >
                <View style={[styles.toggleDot, draft.enabled ? styles.dotOn : styles.dotOff]} />
              </PressableScale>
            </View>

            <View style={styles.divider} />

            <Slider
              label="밝기"
              valueLabel={`${Math.round(draft.intensity * 100)}%`}
              min={0.5}
              max={1.6}
              step={0.05}
              value={draft.intensity}
              onChange={(value) => patchDraft({ intensity: value })}
              onComplete={(value) => commit({ intensity: value })}
            />
            <Slider
              label="퍼짐"
              valueLabel={`${Math.round(draft.size * 100)}%`}
              min={0.8}
              max={1.4}
              step={0.05}
              value={draft.size}
              onChange={(value) => patchDraft({ size: value })}
              onComplete={(value) => commit({ size: value })}
            />
            <Slider
              label="음악 반응"
              valueLabel={`${Math.round(draft.pulse * 100)}%`}
              min={0}
              max={1.5}
              step={0.05}
              value={draft.pulse}
              onChange={(value) => patchDraft({ pulse: value })}
              onComplete={(value) => commit({ pulse: value })}
            />

            <PressableScale
              style={styles.closeBtn}
              onPress={onClose}
              activeScale={0.97}
            >
              <Text style={styles.closeBtnText}>완료</Text>
            </PressableScale>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
