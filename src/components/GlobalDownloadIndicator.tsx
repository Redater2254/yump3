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
            <Text style={styles.panelTitle}>Download Status</Text>
            <View style={styles.headerActions}>
              <PressableScale onPress={clearDownloads} style={styles.clearBtn} activeScale={0.9}>
                <Text style={styles.clearBtnText}>Clear All</Text>
              </PressableScale>
              <PressableScale onPress={() => setExpanded(false)} style={styles.closeBtn} activeScale={0.8}>
                <Ionicons name="close" size={16} color="#7c8598" />
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
                      <ActivityIndicator color="#00e676" size="small" style={{ marginRight: 4 }} />
                      <Text style={styles.statusTextDownloading}>Saving</Text>
                    </View>
                  )}
                  {item.status === 'completed' && (
                    <View style={styles.statusBadgeCompleted}>
                      <Ionicons name="checkmark-circle" size={14} color="#00e676" style={{ marginRight: 2 }} />
                      <Text style={styles.statusTextCompleted}>Saved</Text>
                    </View>
                  )}
                  {item.status === 'failed' && (
                    <View style={styles.failedActions}>
                      <PressableScale
                        style={styles.retryBtn}
                        onPress={() => retryDownload(item.id)}
                        activeScale={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Retry download of ${item.title}`}
                      >
                        <Ionicons name="refresh" size={14} color="#00e676" />
                        <Text style={styles.retryText}>Retry</Text>
                      </PressableScale>
                      <PressableScale
                        style={styles.dismissBtn}
                        onPress={() => dismissTask(item.id)}
                        activeScale={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Dismiss failed download ${item.title}`}
                      >
                        <Ionicons name="close" size={14} color="#ff5252" />
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
        accessibilityLabel={isDownloadingAny ? `Downloading ${activeCount} items` : 'Downloads'}
      >
        <Ionicons 
          name={isDownloadingAny ? "cloud-download" : "cloud-done"} 
          size={18} 
          color={isDownloadingAny ? "#00e676" : "#7c8598"} 
        />
        <Text style={[styles.badgeText, isDownloadingAny && styles.badgeTextActive]}>
          {isDownloadingAny ? `Downloading (${activeCount})` : 'Downloads'}
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
    backgroundColor: '#1b1e26',
    borderColor: '#262c3a',
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
    borderColor: '#00e676',
    shadowColor: '#00e676',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  badgeText: {
    color: '#7c8598',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  badgeTextActive: {
    color: '#00e676',
  },
  panel: {
    width: 280,
    backgroundColor: '#161920',
    borderColor: '#252a36',
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
    borderColor: '#252a36',
    paddingBottom: 8,
    marginBottom: 8,
  },
  panelTitle: {
    color: '#ffffff',
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
    backgroundColor: '#20242e',
    borderRadius: 4,
  },
  clearBtnText: {
    color: '#7c8598',
    fontSize: 10,
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
    borderColor: '#20242e',
  },
  taskMeta: {
    flex: 1,
    marginRight: 10,
  },
  taskTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  taskArtist: {
    color: '#7c8598',
    fontSize: 10,
    marginTop: 2,
  },
  taskError: {
    color: '#ff8a80',
    fontSize: 9,
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
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  retryText: {
    color: '#00e676',
    fontSize: 10,
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
    borderRadius: 4,
  },
  statusTextDownloading: {
    color: '#00e676',
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusTextCompleted: {
    color: '#00e676',
    fontSize: 10,
    fontWeight: '700',
  },
});
