import { palette, HIT_SLOP } from '../theme';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import { Skeleton } from './ui/Skeleton';
import { SwipeToDelete } from './ui/SwipeToDelete';
import { LibraryListArea } from './library/LibraryListArea';
import {
  AddToPlaylistModal,
  BatchActionBar,
  CreatePlaylistModal,
  RenamePlaylistModal,
} from './library/LibraryModals';
import { playPlaylist } from '../services/player';
import { deleteLocalFile, trackThumbUrl } from '../services/ytdlp';
import {
  getTracks,
  removeTrack,
  getPlaylists,
  getPlaylistTracks,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  addTracksToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
  getLikedTracks,
} from '../services/library';

interface Track {
  id: string;
  youtube_id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail_url: string;
  thumbnail_path?: string;
  file_path: string;
}

interface Playlist {
  id: string;
  name: string;
  track_count: number;
}

let persistedLibraryTab: 'downloads' | 'playlists' | 'likes' = 'downloads';
let persistedSelectedPlaylist: Playlist | null = null;
let persistedPlaylistTracks: Track[] = [];
let persistedIsEditMode: boolean = false;

interface PlaylistScreenProps {
  isActive?: boolean;
}

export const PlaylistScreen: React.FC<PlaylistScreenProps> = ({ isActive }) => {
  const insets = useSafeAreaInsets();
  const { showAlert, showToast } = useAlert();
  const [activeTab, setActiveTab] = useState<'downloads' | 'playlists' | 'likes'>(persistedLibraryTab);

  useEffect(() => {
    persistedLibraryTab = activeTab;
  }, [activeTab]);
  
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);
  const [loadingDownloads, setLoadingDownloads] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [loadingLikes, setLoadingLikes] = useState(false);

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(persistedSelectedPlaylist);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>(persistedPlaylistTracks);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [isEditMode, setIsEditMode] = useState(persistedIsEditMode);

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamePlaylistName, setRenamePlaylistName] = useState('');
  const [renamingPlaylist, setRenamingPlaylist] = useState(false);

  useEffect(() => {
    persistedSelectedPlaylist = selectedPlaylist;
  }, [selectedPlaylist]);

  useEffect(() => {
    persistedPlaylistTracks = playlistTracks;
  }, [playlistTracks]);

  useEffect(() => {
    persistedIsEditMode = isEditMode;
  }, [isEditMode]);

  useEffect(() => {
    fetchDownloadedTracks();
    fetchPlaylists();
    fetchLikes();
    if (persistedSelectedPlaylist) {
      fetchPlaylistDetail(persistedSelectedPlaylist.id);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const onBackPress = () => {
      if (selectedPlaylist) {
        setSelectedPlaylist(null);
        fetchPlaylists(); // refresh counts
        return true; // handled
      }
      return false; // delegate to parent
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => {
      subscription.remove();
    };
  }, [isActive, selectedPlaylist]);

  const fetchDownloadedTracks = async () => {
    setLoadingDownloads(true);
    try {
      setDownloadedTracks(await getTracks());
    } catch (err) {
      console.error('Failed to load tracks:', err);
    } finally {
      setLoadingDownloads(false);
    }
  };

  const fetchPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      setPlaylists(await getPlaylists());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const fetchLikes = async () => {
    setLoadingLikes(true);
    try {
      setLikedTracks(await getLikedTracks());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLikes(false);
    }
  };

  const fetchPlaylistDetail = async (playlistId: string) => {
    setLoadingTracks(true);
    try {
      setPlaylistTracks(await getPlaylistTracks(playlistId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    setCreatingPlaylist(true);
    try {
      const created = await createPlaylist(newPlaylistName.trim());
      // If the user came from "add to playlist", add the pending tracks now.
      if (trackToAddToPlaylist) {
        await addTracksToPlaylist(created.id, [trackToAddToPlaylist.id]);
        setTrackToAddToPlaylist(null);
      } else if (selectedTrackIds.length > 0) {
        await addTracksToPlaylist(created.id, selectedTrackIds);
        setSelectedTrackIds([]);
        setIsSelectMode(false);
      }
      setNewPlaylistName('');
      setShowCreateModal(false);
      fetchPlaylists();
    } catch (err) {
      showAlert('오류', '플레이리스트를 만들지 못했습니다.');
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    showAlert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm }
      ]
    );
  };

  const handleDeletePlaylist = async (playlistId: string, name: string) => {
    confirmAction(
      '플레이리스트 삭제',
      `Are you sure you want to delete "${name}"?`,
      async () => {
        try {
          await deletePlaylist(playlistId);
          setSelectedPlaylist(null);
          fetchPlaylists();
        } catch (err) {
          showAlert('오류', '플레이리스트를 삭제하지 못했습니다.');
        }
      }
    );
  };

  const handleRemoveTrack = async (trackId: string, title: string) => {
    if (!selectedPlaylist) return;
    confirmAction(
      '곡 제거',
      `Remove "${title}" from this playlist?`,
      async () => {
        try {
          await removeTrackFromPlaylist(selectedPlaylist.id, trackId);
          fetchPlaylistDetail(selectedPlaylist.id);
          fetchPlaylists();
        } catch (err) {
          showAlert('오류', '곡을 제거하지 못했습니다.');
        }
      }
    );
  };

  const handleRenamePlaylist = async () => {
    if (!selectedPlaylist || !renamePlaylistName.trim()) return;
    setRenamingPlaylist(true);
    try {
      const newName = renamePlaylistName.trim();
      await renamePlaylist(selectedPlaylist.id, newName);
      setSelectedPlaylist({ ...selectedPlaylist, name: newName });
      setRenamePlaylistName('');
      setShowRenameModal(false);
      fetchPlaylists();
    } catch (err) {
      showAlert('오류', '이름을 변경하지 못했습니다.');
    } finally {
      setRenamingPlaylist(false);
    }
  };

  const handleDeleteDownloadedTrack = async (trackId: string, title: string) => {
    confirmAction(
      '곡 삭제',
      `Are you sure you want to permanently delete "${title}" and its audio file?`,
      async () => {
        try {
          const trackToDelete = downloadedTracks.find((t) => t.id === trackId);
          if (trackToDelete?.file_path) {
            await deleteLocalFile(trackToDelete.file_path);
          }
          if (trackToDelete?.thumbnail_path) {
            await deleteLocalFile(trackToDelete.thumbnail_path);
          }
          await removeTrack(trackId);
          fetchDownloadedTracks();
          fetchPlaylists();
          fetchLikes();
        } catch (err) {
          showAlert('오류', '곡을 삭제하지 못했습니다.');
        }
      }
    );
  };

  const handleMoveTrack = async (index: number, direction: 'up' | 'down') => {
    if (!selectedPlaylist) return;
    const newTracks = [...playlistTracks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newTracks.length) return;

    const temp = newTracks[index];
    newTracks[index] = newTracks[targetIndex];
    newTracks[targetIndex] = temp;

    setPlaylistTracks(newTracks);

    try {
      await reorderPlaylist(selectedPlaylist.id, newTracks.map((t) => t.id));
    } catch (err) {
      console.error('Failed to save playlist order:', err);
    }
  };

  const handlePlaySong = (tracksList: Track[], startIndex: number) => {
    if (tracksList.length === 0) return;
    playPlaylist(tracksList, startIndex);
  };

  const formatDuration = (sec: number) => {
    const min = Math.floor(sec / 60);
    const remainingSec = Math.floor(sec % 60);
    return `${min}:${remainingSec < 10 ? '0' : ''}${remainingSec}`;
  };

  const renderSkeletonList = (rows = 6) => (
    <View style={{ paddingTop: 4 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.trackCard}>
          <Skeleton style={{ width: 48, height: 48, borderRadius: 4 }} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton style={{ height: 13, width: '65%', marginBottom: 8 }} />
            <Skeleton style={{ height: 10, width: '40%' }} />
          </View>
        </View>
      ))}
    </View>
  );

  const handleToggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds(prev => {
      if (prev.includes(trackId)) {
        return prev.filter(id => id !== trackId);
      } else {
        return [...prev, trackId];
      }
    });
  };

  const handleSelectPlaylistTarget = async (playlistId: string) => {
    setShowAddToPlaylistModal(false);
    try {
      if (trackToAddToPlaylist) {
        await addTracksToPlaylist(playlistId, [trackToAddToPlaylist.id]);
        showToast(`"${trackToAddToPlaylist.title}" added to playlist.`);
      } else if (selectedTrackIds.length > 0) {
        await addTracksToPlaylist(playlistId, selectedTrackIds);
        showToast(`${selectedTrackIds.length} tracks added to playlist.`);
        setSelectedTrackIds([]);
        setIsSelectMode(false);
      }
      fetchPlaylists();
    } catch (err: any) {
      showAlert('오류', '곡을 추가하지 못했습니다.');
    } finally {
      setTrackToAddToPlaylist(null);
    }
  };

  const startSingleAddFlow = (track: Track) => {
    setTrackToAddToPlaylist(track);
    setShowAddToPlaylistModal(true);
  };

  const renderPlaylistCard = ({ item }: { item: Playlist }) => (
    <PressableScale 
      style={styles.playlistCard}
      onPress={() => {
        setSelectedPlaylist(item);
        setIsEditMode(false);
        fetchPlaylistDetail(item.id);
      }}
      activeScale={0.98}
    >
      <View style={styles.playlistIconBg}>
        <Ionicons name="musical-notes" size={32} color={palette.accent} />
      </View>
      <View style={styles.playlistCardInfo}>
        <Text style={styles.playlistCardName}>{item.name}</Text>
        <Text style={styles.playlistCardCount}>{item.track_count} tracks</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#3d4352" />
    </PressableScale>
  );

  const renderDownloadedTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isSelected = selectedTrackIds.includes(item.id);
    return (
      <SwipeToDelete onDelete={() => handleDeleteDownloadedTrack(item.id, item.title)} label="삭제">
      <View style={[styles.trackCard, isSelected && styles.selectedTrackCard]}>
        {isSelectMode ? (
          <PressableScale 
            style={styles.checkboxArea}
            onPress={() => handleToggleSelectTrack(item.id)}
          >
            <Ionicons 
              name={isSelected ? "checkbox" : "square-outline"} 
              size={22} 
              color={isSelected ? "#00e676" : "#707888"} 
            />
          </PressableScale>
        ) : null}

        <PressableScale 
          style={styles.trackPressArea}
          onPress={() => {
            if (isSelectMode) {
              handleToggleSelectTrack(item.id);
            } else {
              handlePlaySong(downloadedTracks, index);
            }
          }}
        >
          <Image source={{ uri: trackThumbUrl(item) }} style={styles.trackThumbnail} />
          <View style={styles.trackMeta}>
            <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
          </View>
        </PressableScale>

        {!isSelectMode ? (
          <View style={styles.rightActions}>
            <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
            
            <PressableScale 
              style={[styles.playlistAddIconBtn, { marginRight: 8 }]}
              hitSlop={HIT_SLOP}
              onPress={() => startSingleAddFlow(item)}
            >
              <Ionicons name="add" size={20} color={palette.accent} />
            </PressableScale>
            <PressableScale 
              style={styles.downloadDeleteIconBtn}
              hitSlop={HIT_SLOP}
              onPress={() => handleDeleteDownloadedTrack(item.id, item.title)}
            >
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
            </PressableScale>
          </View>
        ) : null}
      </View>
      </SwipeToDelete>
    );
  };

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => (
    <View style={styles.trackCard}>
      <PressableScale 
        style={styles.trackPressArea}
        onPress={() => handlePlaySong(playlistTracks, index)}
      >
        <Image source={{ uri: trackThumbUrl(item) }} style={styles.trackThumbnail} />
        <View style={styles.trackMeta}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
        </View>
      </PressableScale>

      {isEditMode ? (
        <View style={styles.editControls}>
          <PressableScale 
            style={styles.orderBtn}
            hitSlop={HIT_SLOP}
            onPress={() => handleMoveTrack(index, 'up')}
            disabled={index === 0}
          >
            <Ionicons name="arrow-up" size={18} color={index === 0 ? palette.disabled : palette.accent} />
          </PressableScale>
          <PressableScale 
            style={styles.orderBtn}
            hitSlop={HIT_SLOP}
            onPress={() => handleMoveTrack(index, 'down')}
            disabled={index === playlistTracks.length - 1}
          >
            <Ionicons name="arrow-down" size={18} color={index === playlistTracks.length - 1 ? palette.disabled : palette.accent} />
          </PressableScale>
          <PressableScale 
            style={styles.removeBtn}
            hitSlop={HIT_SLOP}
            onPress={() => handleRemoveTrack(item.id, item.title)}
          >
            <Ionicons name="trash-outline" size={20} color={palette.danger} />
          </PressableScale>
        </View>
      ) : (
        <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
      )}
    </View>
  );

  const renderLikedTrackItem = ({ item, index }: { item: Track; index: number }) => (
    <PressableScale 
      style={styles.trackCard}
      onPress={() => handlePlaySong(likedTracks, index)}
    >
      <Image source={{ uri: trackThumbUrl(item) }} style={styles.trackThumbnail} />
      <View style={styles.trackMeta}>
        <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
      </View>
      <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
    </PressableScale>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {selectedPlaylist ? (
        <View style={styles.detailHeader}>
          <PressableScale 
            style={styles.backButton}
            onPress={() => {
              setSelectedPlaylist(null);
              fetchPlaylists(); // refresh counts
            }}
            activeScale={0.95}
          >
            <Ionicons name="arrow-back" size={24} color={palette.text} />
            <Text style={styles.backText}>Library</Text>
          </PressableScale>
          
          <Text style={styles.playlistTitle} numberOfLines={1}>{selectedPlaylist.name}</Text>
          
          <View style={styles.detailActionRow}>
            <PressableScale 
              style={[styles.actionBadge, styles.playAllBadge]}
              onPress={() => handlePlaySong(playlistTracks, 0)}
              disabled={playlistTracks.length === 0}
              activeScale={0.93}
            >
              <Ionicons name="play" size={16} color={palette.accentInk} style={{ marginRight: 4 }} />
              <Text style={styles.playAllText}>전체 재생</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, isEditMode ? styles.editActiveBadge : styles.editBadge]}
              onPress={() => setIsEditMode(!isEditMode)}
              activeScale={0.93}
            >
              <Ionicons name={isEditMode ? "checkmark" : "create-outline"} size={16} color={palette.text} style={{ marginRight: 4 }} />
              <Text style={styles.actionBadgeText}>{isEditMode ? '완료' : '편집'}</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, styles.renameBadge]}
              onPress={() => {
                setRenamePlaylistName(selectedPlaylist.name);
                setShowRenameModal(true);
              }}
              activeScale={0.93}
            >
              <Ionicons name="pencil" size={16} color={palette.text} style={{ marginRight: 4 }} />
              <Text style={styles.actionBadgeText}>이름 변경</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, styles.deleteBadge]}
              onPress={() => handleDeletePlaylist(selectedPlaylist.id, selectedPlaylist.name)}
              activeScale={0.93}
            >
              <Ionicons name="trash" size={16} color={palette.text} />
            </PressableScale>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.mainTitle}>내 보관함</Text>
          
          {activeTab === 'playlists' && (
            <PressableScale style={styles.createBtn} onPress={() => setShowCreateModal(true)} activeScale={0.95}>
              <Ionicons name="add" size={20} color={palette.accentInk} />
              <Text style={styles.createBtnText}>새로 만들기</Text>
            </PressableScale>
          )}

          {activeTab === 'downloads' && downloadedTracks.length > 0 && (
            <PressableScale 
              style={[styles.selectModeBtn, isSelectMode && styles.selectModeBtnActive]} 
              onPress={() => {
                setIsSelectMode(!isSelectMode);
                setSelectedTrackIds([]);
              }}
              activeScale={0.95}
            >
              <Text style={styles.selectModeBtnText}>
                {isSelectMode ? '취소' : '선택'}
              </Text>
            </PressableScale>
          )}
        </View>
      )}

      {!selectedPlaylist && (
        <View style={styles.tabsContainer}>
          <PressableScale 
            style={[styles.tab, activeTab === 'downloads' && styles.activeTab]}
            onPress={() => {
              setActiveTab('downloads');
              setIsSelectMode(false);
              setSelectedTrackIds([]);
              fetchDownloadedTracks();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'downloads' && styles.activeTabText]}>다운로드</Text>
          </PressableScale>
          
          <PressableScale 
            style={[styles.tab, activeTab === 'playlists' && styles.activeTab]}
            onPress={() => {
              setActiveTab('playlists');
              fetchPlaylists();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}>플레이리스트</Text>
          </PressableScale>
          
          <PressableScale 
            style={[styles.tab, activeTab === 'likes' && styles.activeTab]}
            onPress={() => {
              setActiveTab('likes');
              fetchLikes();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'likes' && styles.activeTabText]}>즐겨찾기</Text>
          </PressableScale>
        </View>
      )}

      <LibraryListArea
        activeTab={activeTab}
        renderSkeleton={() => renderSkeletonList()}
        selectedPlaylist={selectedPlaylist}
        loadingTracks={loadingTracks}
        playlistTracks={playlistTracks}
        renderTrackItem={renderTrackItem}
        loadingDownloads={loadingDownloads}
        downloadedTracks={downloadedTracks}
        renderDownloadedItem={renderDownloadedTrackItem}
        loadingPlaylists={loadingPlaylists}
        playlists={playlists}
        renderPlaylistCard={renderPlaylistCard}
        loadingLikes={loadingLikes}
        likedTracks={likedTracks}
        renderLikedItem={renderLikedTrackItem}
      />

      {isSelectMode && selectedTrackIds.length > 0 && (
        <BatchActionBar
          count={selectedTrackIds.length}
          onCancel={() => {
            setSelectedTrackIds([]);
            setIsSelectMode(false);
          }}
          onAdd={() => {
            setTrackToAddToPlaylist(null);
            setShowAddToPlaylistModal(true);
          }}
        />
      )}

      <CreatePlaylistModal
        visible={showCreateModal}
        name={newPlaylistName}
        onChangeName={setNewPlaylistName}
        onCancel={() => {
          setNewPlaylistName('');
          setShowCreateModal(false);
        }}
        onSubmit={handleCreatePlaylist}
        creating={creatingPlaylist}
      />

      <RenamePlaylistModal
        visible={showRenameModal}
        name={renamePlaylistName}
        onChangeName={setRenamePlaylistName}
        onCancel={() => {
          setRenamePlaylistName('');
          setShowRenameModal(false);
        }}
        onSubmit={handleRenamePlaylist}
        renaming={renamingPlaylist}
      />

      <AddToPlaylistModal
        visible={showAddToPlaylistModal}
        subtitle={
          trackToAddToPlaylist
            ? `"${trackToAddToPlaylist.title}" 추가 위치`
            : `${selectedTrackIds.length}곡 추가 위치`
        }
        playlists={playlists}
        onSelect={handleSelectPlaylistTarget}
        onCancel={() => {
          setShowAddToPlaylistModal(false);
          setTrackToAddToPlaylist(null);
        }}
        onCreateNew={() => {
          setShowAddToPlaylistModal(false);
          setShowCreateModal(true);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  detailHeader: {
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backText: {
    color: palette.accent,
    fontSize: 15,
    marginLeft: 4,
    fontWeight: '600',
  },
  playlistTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 12,
  },
  detailActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  playAllBadge: {
    backgroundColor: palette.accent,
  },
  playAllText: {
    color: palette.accentInk,
    fontWeight: '700',
    fontSize: 13,
  },
  editBadge: {
    backgroundColor: palette.border,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  editActiveBadge: {
    backgroundColor: palette.accent,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  actionBadgeText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 13,
  },
  deleteBadge: {
    backgroundColor: palette.danger,
    paddingHorizontal: 10,
  },
  renameBadge: {
    backgroundColor: palette.border,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: palette.text,
  },
  createBtn: {
    backgroundColor: palette.accent,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  createBtnText: {
    color: palette.accentInk,
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 2,
  },
  selectModeBtn: {
    backgroundColor: palette.border,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  selectModeBtnActive: {
    borderColor: palette.accent,
  },
  selectModeBtnText: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 13,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: palette.border,
  },
  tabText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: palette.accent,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  playlistIconBg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistCardInfo: {
    flex: 1,
    marginLeft: 14,
  },
  playlistCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  playlistCardCount: {
    fontSize: 12,
    color: palette.textMuted,
    marginTop: 4,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  trackCard: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  selectedTrackCard: {
    borderColor: palette.accent,
    backgroundColor: palette.accentWash,
  },
  checkboxArea: {
    padding: 8,
    marginRight: 4,
  },
  trackPressArea: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  trackThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: palette.border,
  },
  trackMeta: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  trackTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackArtist: {
    color: palette.textMuted,
    fontSize: 12,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackDuration: {
    color: palette.textDim,
    fontSize: 12,
    paddingRight: 12,
  },
  playlistAddIconBtn: {
    padding: 8,
    backgroundColor: palette.border,
    borderRadius: 8,
  },
  editControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderBtn: {
    padding: 8,
  },
  removeBtn: {
    padding: 8,
    marginLeft: 4,
  },
  downloadDeleteIconBtn: {
    padding: 8,
    backgroundColor: palette.border,
    borderRadius: 8,
  },
});
