import React from 'react';
import { FlatList, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import { PressableScale } from '../ui/PressableScale';

interface Props {
  visible: boolean;
  queue: any[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

/** Play queue sheet. */
export const QueueModal: React.FC<Props> = ({
  visible,
  queue,
  activeIndex,
  onSelect,
  onClose,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>재생 대기열 ({queue.length})</Text>
          <PressableScale
            onPress={onClose}
            style={styles.closeBtn}
            activeScale={0.8}
            accessibilityRole="button"
            accessibilityLabel="대기열 닫기"
          >
            <Ionicons name="close" size={22} color={palette.text} />
          </PressableScale>
        </View>
        <FlatList
          data={queue}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          renderItem={({ item, index }) => {
            const isActive = index === activeIndex;
            return (
              <PressableScale
                style={[styles.row, isActive && styles.rowActive]}
                onPress={() => onSelect(index)}
                activeScale={0.98}
              >
                <Ionicons
                  name={isActive ? 'volume-high' : 'musical-note-outline'}
                  size={16}
                  color={isActive ? palette.accent : palette.textDim}
                />
                <View style={styles.meta}>
                  <Text
                    style={[styles.rowTitle, isActive && styles.rowTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </View>
                {isActive && <Text style={styles.nowBadge}>재생 중</Text>}
              </PressableScale>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>대기열이 비어 있습니다.</Text>}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: palette.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: palette.border,
    paddingBottom: 12,
    marginBottom: 8,
  },
  title: { color: palette.text, fontSize: 16, fontWeight: '800' },
  closeBtn: { padding: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: palette.surfaceAlt,
  },
  rowActive: { backgroundColor: palette.accentWash, borderWidth: 1, borderColor: palette.accent },
  meta: { flex: 1, marginLeft: 10 },
  rowTitle: { color: palette.text, fontSize: 13, fontWeight: '700' },
  rowTitleActive: { color: palette.accent },
  rowArtist: { color: palette.textDim, fontSize: 12, marginTop: 2 },
  nowBadge: { color: palette.accent, fontSize: 12, fontWeight: '800', marginLeft: 8 },
  empty: { color: palette.textDim, textAlign: 'center', marginVertical: 30, fontSize: 13 },
});
