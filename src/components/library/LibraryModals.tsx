import React from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import { PressableScale } from '../ui/PressableScale';

/* ---------------- Create playlist ---------------- */

interface CreateProps {
  visible: boolean;
  name: string;
  onChangeName: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  creating: boolean;
}

export const CreatePlaylistModal: React.FC<CreateProps> = ({
  visible,
  name,
  onChangeName,
  onCancel,
  onSubmit,
  creating,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>플레이리스트 만들기</Text>
        <TextInput
          style={styles.input}
          placeholder="플레이리스트 이름"
          placeholderTextColor={palette.textDim}
          value={name}
          onChangeText={onChangeName}
          autoFocus
        />
        <View style={styles.buttonRow}>
          <PressableScale style={[styles.button, styles.cancelBtn]} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>취소</Text>
          </PressableScale>
          <PressableScale
            style={[styles.button, styles.confirmBtn]}
            onPress={onSubmit}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color={palette.accentInk} size="small" />
            ) : (
              <Text style={styles.confirmBtnText}>만들기</Text>
            )}
          </PressableScale>
        </View>
      </View>
    </View>
  </Modal>
);

/* ---------------- Rename playlist ---------------- */

interface RenameProps {
  visible: boolean;
  name: string;
  onChangeName: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  renaming: boolean;
}

export const RenamePlaylistModal: React.FC<RenameProps> = ({
  visible,
  name,
  onChangeName,
  onCancel,
  onSubmit,
  renaming,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>이름 변경</Text>
        <TextInput
          style={styles.input}
          placeholder="플레이리스트 이름"
          placeholderTextColor={palette.textDim}
          value={name}
          onChangeText={onChangeName}
          autoFocus
        />
        <View style={styles.buttonRow}>
          <PressableScale style={[styles.button, styles.cancelBtn]} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>취소</Text>
          </PressableScale>
          <PressableScale
            style={[styles.button, styles.confirmBtn]}
            onPress={onSubmit}
            disabled={renaming}
          >
            {renaming ? (
              <ActivityIndicator color={palette.accentInk} size="small" />
            ) : (
              <Text style={styles.confirmBtnText}>저장</Text>
            )}
          </PressableScale>
        </View>
      </View>
    </View>
  </Modal>
);

/* ---------------- Add to playlist ---------------- */

interface AddProps {
  visible: boolean;
  subtitle: string;
  playlists: { id: string; name: string }[];
  onSelect: (playlistId: string) => void;
  onCancel: () => void;
  onCreateNew: () => void;
}

export const AddToPlaylistModal: React.FC<AddProps> = ({
  visible,
  subtitle,
  playlists,
  onSelect,
  onCancel,
  onCreateNew,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>플레이리스트에 추가</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <PressableScale style={styles.playlistItem} onPress={() => onSelect(item.id)}>
              <Ionicons
                name="musical-notes-outline"
                size={20}
                color={palette.accent}
                style={styles.playlistIcon}
              />
              <Text style={styles.playlistItemText}>{item.name}</Text>
            </PressableScale>
          )}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>플레이리스트가 없습니다.</Text>}
        />

        <PressableScale style={styles.createInlineBtn} onPress={onCreateNew} activeScale={0.97}>
          <Ionicons name="add" size={18} color={palette.accent} />
          <Text style={styles.createInlineText}>새 플레이리스트 만들기</Text>
        </PressableScale>

        <PressableScale style={styles.closeButton} onPress={onCancel}>
          <Text style={styles.closeButtonText}>취소</Text>
        </PressableScale>
      </View>
    </View>
  </Modal>
);

/* ---------------- Batch action bar ---------------- */

interface BatchProps {
  count: number;
  onCancel: () => void;
  onAdd: () => void;
}

export const BatchActionBar: React.FC<BatchProps> = ({ count, onCancel, onAdd }) => (
  <View style={styles.batchBar}>
    <Text style={styles.batchText}>{count}곡 선택됨</Text>
    <View style={styles.batchButtons}>
      <PressableScale style={styles.batchCancelBtn} onPress={onCancel} activeScale={0.95}>
        <Text style={styles.batchCancelText}>취소</Text>
      </PressableScale>
      <PressableScale style={styles.batchAddBtn} onPress={onAdd} activeScale={0.95}>
        <Text style={styles.batchAddText}>플레이리스트에 추가</Text>
      </PressableScale>
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: palette.text, marginBottom: 16 },
  subtitle: { color: palette.textDim, fontSize: 13, marginBottom: 20 },
  input: {
    backgroundColor: palette.border,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
  },
  buttonRow: { flexDirection: 'row' },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { backgroundColor: palette.border, marginRight: 10 },
  cancelBtnText: { color: palette.text, fontWeight: '600' },
  confirmBtn: { backgroundColor: palette.accent },
  confirmBtnText: { color: palette.accentInk, fontWeight: '700' },
  list: { marginBottom: 15, maxHeight: 250 },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  playlistIcon: { marginRight: 12 },
  playlistItemText: { color: palette.text, fontSize: 15, fontWeight: '600' },
  emptyText: { color: palette.textDim, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  createInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 10,
  },
  createInlineText: { color: palette.accent, fontSize: 14, fontWeight: '700', marginLeft: 6 },
  closeButton: {
    backgroundColor: palette.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: { color: palette.text, fontWeight: '600' },
  batchBar: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    right: 20,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.borderStrong,
    elevation: 6,
  },
  batchText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  batchButtons: { flexDirection: 'row' },
  batchCancelBtn: {
    backgroundColor: palette.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  batchCancelText: { color: palette.textMuted, fontSize: 12, fontWeight: '700' },
  batchAddBtn: {
    backgroundColor: palette.accent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  batchAddText: { color: palette.accentInk, fontSize: 12, fontWeight: '700' },
});
