import { palette, HIT_SLOP } from '../theme';
import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDownload } from '../context/DownloadContext';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';

export const GlobalDownloadIndicator: React.FC = () => {
  const { downloadTasks, clearDownloads, activeCount, isDownloadingAny, retryDownload, dismissTask } = useDownload();
  const { showAlert } = useAlert();
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const bottomOffset = 130 + (Platform.OS === 'android' ? insets.bottom : 0);

  React.useEffect(() => {
    if (downloadTasks.length > 0 && !isDownloadingAny) {
      const timer = setTimeout(() => {
        clearDownloads();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [downloadTasks, isDownloadingAny]);

  if (downloadTasks.length === 0) return null;

  return (
    <View style={[styles.container, { bottom: bottomOffset }]}>
      {/* Expanded Task Queue Panel */}
      {expanded && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>다운로드</Text>
            <View style={styles.headerActions}>
              <PressableScale onPress={clearDownloads} style={styles.clearBtn} activeScale={0.9} hitSlop={HIT_SLOP}>
                <Text style={styles.clearBtnText}>모두 지우기</Text>
              </PressableScale>
              <PressableScale onPress={() => setExpanded(false)} style={styles.closeBtn} activeScale={0.8} hitSlop={HIT_SLOP}>
                <Ionicons name="close" size={16} color={palette.textDim} />
              </PressableScale>
            </View>
          </View>
          
          <ScrollView style={styles.taskList} nestedScrollEnabled={true}>
            {downloadTasks.map((item) => (
              <View key={item.id} style={styles.taskRow}>
                <PressableScale
                  style={styles.taskMeta}
                  activeScale={1}
                  onPress={
                    item.status === 'failed'
                      ? () =>
                          showAlert(
                            '다운로드 오류',
                            `${item.errorMsg || '알 수 없는 오류'}${
                              item.errorDetail ? `\n\n[상세]\n${item.errorDetail}` : ''
                            }`
                          )
                      : undefined
                  }
                >
                  <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.taskArtist} numberOfLines={1}>{item.artist}</Text>
                  {item.status === 'failed' && (
                    <Text style={styles.taskError} numberOfLines={6} selectable>
                      {item.errorMsg}
                    </Text>
                  )}
                </PressableScale>
                <View style={styles.taskStatus}>
                  {item.status === 'downloading' && (
                    <View style={styles.statusBadgeDownloading}>
                      <ActivityIndicator color={palette.accent} size="small" style={{ marginRight: 4 }} />
                      <Text style={styles.statusTextDownloading}>저장 중</Text>
                    </View>
                  )}
                  {item.status === 'completed' && (
                    <View style={styles.statusBadgeCompleted}>
                      <Ionicons name="checkmark-circle" size={14} color={palette.accent} style={{ marginRight: 2 }} />
                      <Text style={styles.statusTextCompleted}>저장됨</Text>
                    </View>
                  )}
                  {item.status === 'failed' && (
                    <View style={styles.failedActions}>
                      <PressableScale
                        style={styles.retryBtn}
                        hitSlop={HIT_SLOP}
                        onPress={() => retryDownload(item.id)}
                        activeScale={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Retry download of ${item.title}`}
                      >
                        <Ionicons name="refresh" size={14} color={palette.accent} />
                        <Text style={styles.retryText}>재시도</Text>
                      </PressableScale>
                      <PressableScale
                        style={styles.dismissBtn}
                        hitSlop={HIT_SLOP}
                        onPress={() => dismissTask(item.id)}
                        activeScale={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Dismiss failed download ${item.title}`}
                      >
                        <Ionicons name="close" size={14} color={palette.danger} />
                      </PressableScale>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Floating Badge (Pill) */}
      <PressableScale 
        style={[
          styles.badge, 
          isDownloadingAny && styles.badgeActive
        ]} 
        activeScale={0.96}
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={isDownloadingAny ? `Downloading ${activeCount} items` : '다운로드'}
      >
        <Ionicons 
          name={isDownloadingAny ? "cloud-download" : "cloud-done"} 
          size={18} 
          color={isDownloadingAny ? "#00e676" : "#7c8598"} 
        />
        <Text style={[styles.badgeText, isDownloadingAny && styles.badgeTextActive]}>
          {isDownloadingAny ? `Downloading (${activeCount})` : '다운로드'}
        </Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 130, // Floats safely above the MiniPlayer (which sits at bottom: 60, height: 56)
    right: 16,
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceAlt,
    borderColor: palette.border,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  badgeActive: {
    borderColor: palette.accent,
    shadowColor: palette.accent,
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  badgeText: {
    color: palette.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  badgeTextActive: {
    color: palette.accent,
  },
  panel: {
    width: 280,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: palette.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  panelTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: palette.border,
    borderRadius: 8,
  },
  clearBtnText: {
    color: palette.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 2,
  },
  taskList: {
    maxHeight: 180,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  taskMeta: {
    flex: 1,
    marginRight: 10,
  },
  taskTitle: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  taskArtist: {
    color: palette.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  taskError: {
    color: palette.dangerSoft,
    fontSize: 12,
    marginTop: 2,
  },
  taskStatus: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  failedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  retryText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 3,
  },
  dismissBtn: {
    padding: 4,
  },
  statusBadgeDownloading: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTextDownloading: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTextCompleted: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
