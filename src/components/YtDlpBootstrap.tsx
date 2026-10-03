import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { runYtDlpBootstrap } from '../services/ytdlp';
import { PressableScale } from './ui/PressableScale';

const MIN_VISIBLE_MS = 900;

/**
 * Startup gate shown over the app while the bundled downloader is prepared:
 * initialize -> integrity check -> latest version check -> update if needed.
 */
export const YtDlpBootstrap: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0.02);
  const [message, setMessage] = useState('다운로더 준비 중...');
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState('');
  const [showSkip, setShowSkip] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const startedAt = useRef(Date.now());

  const hide = () => {
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() =>
        setVisible(false)
      );
    }, wait);
  };

  const run = async () => {
    setFailed(false);
    setDetail('');
    setProgress(0.02);
    setMessage('다운로더 준비 중...');
    try {
      const result = await runYtDlpBootstrap(
        ({ progress: p, message: m }: { progress?: number; message?: string }) => {
          if (typeof p === 'number') setProgress(Math.max(0.02, Math.min(1, p)));
          if (m) setMessage(m);
        }
      );
      if (result?.ok) {
        hide();
      } else {
        setFailed(true);
        setMessage(
          result?.reason === 'unavailable'
            ? '이 기기에서는 다운로더를 사용할 수 없습니다.'
            : '다운로더를 준비하지 못했습니다.'
        );
        setDetail(String(result?.error || ''));
      }
    } catch (e: any) {
      setFailed(true);
      setMessage('다운로더를 준비하지 못했습니다.');
      setDetail(String(e?.message || e));
    }
  };

  useEffect(() => {
    run();
    const timer = setTimeout(() => setShowSkip(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const percent = Math.round(progress * 100);

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]}>
      <Ionicons name="cloud-download-outline" size={56} color={palette.accent} />
      <Text style={styles.title}>다운로더 준비</Text>
      <Text style={styles.subtitle}>{message}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.percent}>{percent}%</Text>

      {failed && detail ? (
        <Text style={styles.detail} numberOfLines={8} selectable>
          {detail}
        </Text>
      ) : null}

      {failed ? (
        <View style={styles.actions}>
          <PressableScale style={styles.retryBtn} onPress={run} activeScale={0.96}>
            <Text style={styles.retryText}>다시 시도</Text>
          </PressableScale>
          <PressableScale style={styles.skipBtn} onPress={hide} activeScale={0.96}>
            <Text style={styles.skipText}>나중에</Text>
          </PressableScale>
        </View>
      ) : showSkip ? (
        <View style={styles.actions}>
          <PressableScale style={styles.skipBtn} onPress={hide} activeScale={0.96}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </PressableScale>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    zIndex: 100000,
  },
  title: { color: palette.text, fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  subtitle: { color: palette.textDim, fontSize: 13, marginBottom: 22, textAlign: 'center' },
  track: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: palette.accent },
  percent: { color: palette.accent, fontSize: 12, fontWeight: '700', marginTop: 10 },
  detail: {
    color: palette.dangerSoft,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  actions: { flexDirection: 'row', marginTop: 26 },
  retryBtn: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 22,
    marginRight: 10,
  },
  retryText: { color: palette.accentInk, fontSize: 14, fontWeight: '700' },
  skipBtn: {
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  skipText: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },
});
