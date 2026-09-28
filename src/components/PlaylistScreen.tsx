import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  Image, 
  ActivityIndicator, 
  TextInput,
  Modal,
  BackHandler
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import { Skeleton } from './ui/Skeleton';
import { SwipeToDelete } from './ui/SwipeToDelete';
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
      await createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowCreateModal(false);
      fetchPlaylists();
    } catch (err) {
      showAlert('Error', 'Failed to create playlist');
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
      'Delete Playlist',
      `Are you sure you want to delete "${name}"?`,
      async () => {
        try {
          await deletePlaylist(playlistId);
          setSelectedPlaylist(null);
          fetchPlaylists();
        } catch (err) {
          showAlert('Error', 'Failed to delete playlist');
        }
      }
    );
  };

  const handleRemoveTrack = async (trackId: string, title: string) => {
    if (!selectedPlaylist) return;
    confirmAction(
      'Remove Track',
      `Remove "${title}" from this playlist?`,
      async () => {
        try {
          await removeTrackFromPlaylist(selectedPlaylist.id, trackId);
          fetchPlaylistDetail(selectedPlaylist.id);
          fetchPlaylists();
        } catch (err) {
          showAlert('Error', 'Failed to remove track');
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
      showAlert('Error', 'Failed to rename playlist');
    } finally {
      setRenamingPlaylist(false);
    }
  };

  const handleDeleteDownloadedTrack = async (trackId: string, title: string) => {
    confirmAction(
      'Delete Track',
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
          showAlert('Error', 'Failed to delete track');
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
      showAlert('Error', 'Failed to add tracks');
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
        <Ionicons name="musical-notes" size={32} color="#00e676" />
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
              onPress={() => startSingleAddFlow(item)}
            >
              <Ionicons name="add" size={20} color="#00e676" />
            </PressableScale>
            <PressableScale 
              style={styles.downloadDeleteIconBtn}
              onPress={() => handleDeleteDownloadedTrack(item.id, item.title)}
            >
              <Ionicons name="trash-outline" size={18} color="#ff1744" />
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
            onPress={() => handleMoveTrack(index, 'up')}
            disabled={index === 0}
          >
            <Ionicons name="arrow-up" size={18} color={index === 0 ? '#303440' : '#00e676'} />
          </PressableScale>
          <PressableScale 
            style={styles.orderBtn}
            onPress={() => handleMoveTrack(index, 'down')}
            disabled={index === playlistTracks.length - 1}
          >
            <Ionicons name="arrow-down" size={18} color={index === playlistTracks.length - 1 ? '#303440' : '#00e676'} />
          </PressableScale>
          <PressableScale 
            style={styles.removeBtn}
            onPress={() => handleRemoveTrack(item.id, item.title)}
          >
            <Ionicons name="trash-outline" size={20} color="#ff1744" />
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
    <View style={styles.container}>
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
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
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
              <Ionicons name="play" size={16} color="#0a0a0a" style={{ marginRight: 4 }} />
              <Text style={styles.playAllText}>Play All</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, isEditMode ? styles.editActiveBadge : styles.editBadge]}
              onPress={() => setIsEditMode(!isEditMode)}
              activeScale={0.93}
            >
              <Ionicons name={isEditMode ? "checkmark" : "create-outline"} size={16} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.actionBadgeText}>{isEditMode ? 'Done' : 'Edit'}</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, styles.renameBadge]}
              onPress={() => {
                setRenamePlaylistName(selectedPlaylist.name);
                setShowRenameModal(true);
              }}
              activeScale={0.93}
            >
              <Ionicons name="pencil" size={16} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.actionBadgeText}>Rename</Text>
            </PressableScale>

            <PressableScale 
              style={[styles.actionBadge, styles.deleteBadge]}
              onPress={() => handleDeletePlaylist(selectedPlaylist.id, selectedPlaylist.name)}
              activeScale={0.93}
            >
              <Ionicons name="trash" size={16} color="#ffffff" />
            </PressableScale>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.mainTitle}>My Library</Text>
          
          {activeTab === 'playlists' && (
            <PressableScale style={styles.createBtn} onPress={() => setShowCreateModal(true)} activeScale={0.95}>
              <Ionicons name="add" size={20} color="#0a0a0a" />
              <Text style={styles.createBtnText}>New</Text>
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
                {isSelectMode ? 'Cancel' : 'Select'}
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
            <Text style={[styles.tabText, activeTab === 'downloads' && styles.activeTabText]}>Downloads</Text>
          </PressableScale>
          
          <PressableScale 
            style={[styles.tab, activeTab === 'playlists' && styles.activeTab]}
            onPress={() => {
              setActiveTab('playlists');
              fetchPlaylists();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}>Playlists</Text>
          </PressableScale>
          
          <PressableScale 
            style={[styles.tab, activeTab === 'likes' && styles.activeTab]}
            onPress={() => {
              setActiveTab('likes');
              fetchLikes();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'likes' && styles.activeTabText]}>Favorites</Text>
          </PressableScale>
        </View>
      )}

      {selectedPlaylist ? (
        loadingTracks ? (
          renderSkeletonList()
        ) : (
          <FlatList
            data={playlistTracks}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderTrackItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyView}>
                <Ionicons name="musical-notes-outline" size={48} color="#2d3342" />
                <Text style={styles.emptyText}>Playlist is empty.</Text>
                <Text style={styles.emptySubText}>Go to the Home tab and search for songs to download!</Text>
              </View>
            }
          />
        )
      ) : (
        activeTab === 'downloads' ? (
          loadingDownloads ? (
            renderSkeletonList()
          ) : (
            <FlatList
              data={downloadedTracks}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderDownloadedTrackItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyView}>
                  <Ionicons name="cloud-download-outline" size={48} color="#2d3342" />
                  <Text style={styles.emptyText}>No downloaded songs.</Text>
                  <Text style={styles.emptySubText}>Go to the Home tab to search and download music!</Text>
                </View>
              }
            />
          )
        ) : activeTab === 'playlists' ? (
          loadingPlaylists ? (
            renderSkeletonList()
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderPlaylistCard}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyView}>
                  <Text style={styles.emptyText}>No playlists found.</Text>
                </View>
              }
            />
          )
        ) : (
          loadingLikes ? (
            renderSkeletonList()
          ) : (
            <FlatList
              data={likedTracks}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderLikedTrackItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyView}>
                  <Ionicons name="heart-outline" size={48} color="#2d3342" />
                  <Text style={styles.emptyText}>No favorited songs yet.</Text>
                  <Text style={styles.emptySubText}>Tap the heart icon in the player on your favorite songs.</Text>
                </View>
              }
            />
          )
        )
      )}

      {isSelectMode && selectedTrackIds.length > 0 && (
        <View style={styles.batchActionBar}>
          <Text style={styles.batchActionText}>
            {selectedTrackIds.length} tracks selected
          </Text>
          <View style={styles.batchButtons}>
            <PressableScale 
              style={styles.batchCancelBtn}
              onPress={() => {
                setSelectedTrackIds([]);
                setIsSelectMode(false);
              }}
              activeScale={0.95}
            >
              <Text style={styles.batchCancelBtnText}>Cancel</Text>
            </PressableScale>
            <PressableScale 
              style={styles.batchAddBtn}
              onPress={() => {
                setTrackToAddToPlaylist(null); // Ensure batch mode flag is correct
                setShowAddToPlaylistModal(true);
              }}
              activeScale={0.95}
            >
              <Text style={styles.batchAddBtnText}>Add to Playlist</Text>
            </PressableScale>
          </View>
        </View>
      )}

      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor="#666"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <PressableScale 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => {
                  setNewPlaylistName('');
                  setShowCreateModal(false);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </PressableScale>
              <PressableScale 
                style={[styles.modalBtn, styles.confirmBtn]} 
                onPress={handleCreatePlaylist}
                disabled={creatingPlaylist}
              >
                {creatingPlaylist ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Create</Text>
                )}
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRenameModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor="#666"
              value={renamePlaylistName}
              onChangeText={setRenamePlaylistName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <PressableScale 
                style={[styles.modalBtn, styles.cancelBtn]} 
                onPress={() => {
                  setRenamePlaylistName('');
                  setShowRenameModal(false);
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </PressableScale>
              <PressableScale 
                style={[styles.modalBtn, styles.confirmBtn]} 
                onPress={handleRenamePlaylist}
                disabled={renamingPlaylist}
              >
                {renamingPlaylist ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save</Text>
                )}
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddToPlaylistModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowAddToPlaylistModal(false);
          setTrackToAddToPlaylist(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add to Playlist</Text>
            <Text style={styles.modalSubtitle}>
              {trackToAddToPlaylist 
                ? `Add "${trackToAddToPlaylist.title}" to:` 
                : `Add ${selectedTrackIds.length} tracks to:`}
            </Text>
            
            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <PressableScale 
                  style={styles.playlistItem} 
                  onPress={() => handleSelectPlaylistTarget(item.id)}
                >
                  <Ionicons name="musical-notes-outline" size={20} color="#00e676" style={styles.playlistIcon} />
                  <Text style={styles.playlistItemText}>{item.name}</Text>
                </PressableScale>
              )}
              style={styles.modalList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No playlists available. Please create a playlist first.</Text>
              }
            />

            <PressableScale 
              style={styles.modalCloseButton} 
              onPress={() => {
                setShowAddToPlaylistModal(false);
                setTrackToAddToPlaylist(null);
              }}
            >
              <Text style={styles.modalCloseButtonText}>Cancel</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0e12',
    paddingHorizontal: 20,
    paddingTop: 50,
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
    color: '#00e676',
    fontSize: 15,
    marginLeft: 4,
    fontWeight: '600',
  },
  playlistTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
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
    borderRadius: 6,
    marginRight: 10,
  },
  playAllBadge: {
    backgroundColor: '#00e676',
  },
  playAllText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
  },
  editBadge: {
    backgroundColor: '#20242e',
    borderWidth: 1,
    borderColor: '#2d3342',
  },
  editActiveBadge: {
    backgroundColor: '#00e676',
    borderWidth: 1,
    borderColor: '#00e676',
  },
  actionBadgeText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteBadge: {
    backgroundColor: '#ff1744',
    paddingHorizontal: 10,
  },
  renameBadge: {
    backgroundColor: '#20242e',
    borderWidth: 1,
    borderColor: '#2d3342',
  },
  mainTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
  },
  createBtn: {
    backgroundColor: '#00e676',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: {
    color: '#0a0a0a',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 2,
  },
  selectModeBtn: {
    backgroundColor: '#20242e',
    borderWidth: 1,
    borderColor: '#2d3342',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  selectModeBtnActive: {
    borderColor: '#00e676',
  },
  selectModeBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#161920',
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: '#20242e',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#20242e',
  },
  tabText: {
    color: '#707888',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#00e676',
  },
  listContent: {
    paddingBottom: 120,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161920',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#20242e',
  },
  playlistIconBg: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#20242e',
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
    color: '#ffffff',
  },
  playlistCardCount: {
    fontSize: 12,
    color: '#707888',
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
    backgroundColor: '#161920',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1d212b',
  },
  selectedTrackCard: {
    borderColor: '#00e676',
    backgroundColor: '#182220',
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
    borderRadius: 4,
    backgroundColor: '#252a36',
  },
  trackMeta: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackArtist: {
    color: '#707888',
    fontSize: 11,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackDuration: {
    color: '#7c8598',
    fontSize: 11,
    paddingRight: 12,
  },
  playlistAddIconBtn: {
    padding: 8,
    backgroundColor: '#20242e',
    borderRadius: 4,
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
  batchActionBar: {
    position: 'absolute',
    bottom: 70, // Sits above tab bar
    left: 20,
    right: 20,
    backgroundColor: '#1c212c',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  batchActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  batchButtons: {
    flexDirection: 'row',
  },
  batchCancelBtn: {
    backgroundColor: '#252a36',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  batchCancelBtnText: {
    color: '#707888',
    fontSize: 12,
    fontWeight: '700',
  },
  batchAddBtn: {
    backgroundColor: '#00e676',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  batchAddBtnText: {
    color: '#0a0a0a',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyView: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#707888',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#6b7488',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#161920',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#252a36',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  modalSubtitle: {
    color: '#707888',
    fontSize: 13,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#20242e',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#2d3342',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#252a36',
    marginRight: 10,
  },
  cancelBtnText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#00e676',
  },
  confirmBtnText: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  modalList: {
    marginBottom: 15,
    maxHeight: 250,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#252a36',
  },
  playlistIcon: {
    marginRight: 12,
  },
  playlistItemText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalCloseButton: {
    backgroundColor: '#252a36',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  downloadDeleteIconBtn: {
    padding: 8,
    backgroundColor: '#20242e',
    borderRadius: 4,
  },
});
