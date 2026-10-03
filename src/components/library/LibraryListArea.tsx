import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';

export type LibraryTab = 'downloads' | 'playlists' | 'likes';

interface Props {
  activeTab: LibraryTab;
  renderSkeleton: () => React.ReactNode;

  selectedPlaylist: { id: string; name: string } | null;
  loadingTracks: boolean;
  playlistTracks: any[];
  renderTrackItem: (info: { item: any; index: number }) => React.ReactElement | null;

  loadingDownloads: boolean;
  downloadedTracks: any[];
  renderDownloadedItem: (info: { item: any; index: number }) => React.ReactElement | null;

  loadingPlaylists: boolean;
  playlists: any[];
  renderPlaylistCard: (info: { item: any; index: number }) => React.ReactElement | null;

  loadingLikes: boolean;
  likedTracks: any[];
  renderLikedItem: (info: { item: any; index: number }) => React.ReactElement | null;
}

const keyOf = (item: any) => String(item.id);

const EmptyState: React.FC<{ icon: any; title: string; hint?: string }> = ({
  icon,
  title,
  hint,
}) => (
  <View style={styles.empty}>
    <Ionicons name={icon} size={48} color={palette.borderStrong} />
    <Text style={styles.emptyTitle}>{title}</Text>
    {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
  </View>
);

/** List area for the library tabs and the opened playlist. */
export const LibraryListArea: React.FC<Props> = (props) => {
  const {
    activeTab,
    renderSkeleton,
    selectedPlaylist,
    loadingTracks,
    playlistTracks,
    renderTrackItem,
    loadingDownloads,
    downloadedTracks,
    renderDownloadedItem,
    loadingPlaylists,
    playlists,
    renderPlaylistCard,
    loadingLikes,
    likedTracks,
    renderLikedItem,
  } = props;

  if (selectedPlaylist) {
    if (loadingTracks) return <>{renderSkeleton()}</>;
    return (
      <FlatList
        data={playlistTracks}
        keyExtractor={keyOf}
        renderItem={renderTrackItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="musical-notes-outline"
            title="플레이리스트가 비어 있습니다."
            hint="검색 탭에서 곡을 찾아 다운로드하세요."
          />
        }
      />
    );
  }

  if (activeTab === 'downloads') {
    if (loadingDownloads) return <>{renderSkeleton()}</>;
    return (
      <FlatList
        data={downloadedTracks}
        keyExtractor={keyOf}
        renderItem={renderDownloadedItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="cloud-download-outline"
            title="다운로드한 곡이 없습니다."
            hint="검색 탭에서 곡을 찾아 다운로드하세요."
          />
        }
      />
    );
  }

  if (activeTab === 'playlists') {
    if (loadingPlaylists) return <>{renderSkeleton()}</>;
    return (
      <FlatList
        data={playlists}
        keyExtractor={keyOf}
        renderItem={renderPlaylistCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState icon="list-outline" title="플레이리스트가 없습니다." />}
      />
    );
  }

  if (loadingLikes) return <>{renderSkeleton()}</>;
  return (
    <FlatList
      data={likedTracks}
      keyExtractor={keyOf}
      renderItem={renderLikedItem}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <EmptyState
          icon="heart-outline"
          title="즐겨찾기한 곡이 없습니다."
          hint="플레이어에서 하트를 눌러 추가하세요."
        />
      }
    />
  );
};

const styles = StyleSheet.create({
  list: { paddingBottom: 140 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyTitle: {
    color: palette.textDim,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  emptyHint: {
    color: palette.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
