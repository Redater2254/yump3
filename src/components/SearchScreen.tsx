import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  FlatList, 
  Image, 
  ActivityIndicator, 
  Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useDownload } from '../context/DownloadContext';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import { searchTracks } from '../services/ytdlp';
import { getTracks } from '../services/library';

interface SearchResult {
  youtube_id: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail_url: string;
}

export const SearchScreen: React.FC = () => {
  const { downloadTasks, triggerDownload, handleDirectAdd } = useDownload();
  const { showAlert: showCustomAlert, showToast } = useAlert();
  const [directUrl, setDirectUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDirectAdd, setLoadingDirectAdd] = useState(false);
  
  const [isOfficialOnly, setIsOfficialOnly] = useState(true);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [libraryIds, setLibraryIds] = useState<Set<string>>(new Set());
  const didMountRef = useRef(false);

  const RECENT_KEY = 'yump3_recent_searches';

  const showAlert = (title: string, message: string) => {
    showCustomAlert(title, message);
  };

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch (e) {
      // ignore
    }
  };

  const saveRecentSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const next = [trimmed, ...prev.filter(q => q !== trimmed)].slice(0, 8);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  };

  const loadLibraryIds = async () => {
    try {
      const tracks = await getTracks();
      setLibraryIds(new Set(tracks.map((t: any) => String(t.youtube_id))));
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    loadRecentSearches();
    loadLibraryIds();
  }, []);

  const handleSearch = async (overrideQuery?: string, options?: { dismissKeyboard?: boolean }) => {
    const query = (overrideQuery ?? searchQuery).trim();
    if (!query) return;
    if (options?.dismissKeyboard !== false) Keyboard.dismiss();
    setLoadingSearch(true);
    try {
      const results = await searchTracks(query, isOfficialOnly ? 12 : 10);

      // "Official audio" heuristic: prefer Topic channels / auto-generated uploads.
      let filtered = results;
      if (isOfficialOnly) {
        const official = results.filter((r: any) =>
          / - Topic$/i.test(r.artist || '') || r.official === true
        );
        if (official.length > 0) filtered = official;
      }
      setSearchResults(filtered);
      saveRecentSearch(query);
    } catch (err: any) {
      showAlert('Search Error', err?.message || 'Search failed');
    } finally {
      setLoadingSearch(false);
    }
  };

  // Debounced auto-search as the user types
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      // Auto-search while typing must NOT dismiss the keyboard, otherwise it
      // feels like the Enter key was pressed on its own.
      handleSearch(q, { dismissKeyboard: false });
    }, 550);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDirectAddPress = async () => {
    if (!directUrl.trim()) return;
    Keyboard.dismiss();

    setLoadingDirectAdd(true);
    try {
      const result = await handleDirectAdd(directUrl.trim());
      setDirectUrl('');
      if (result?.type === 'playlist') {
        showToast(
          `재생목록 다운로드 시작 · ${result.total}곡${result.title ? ` (${result.title})` : ''}`
        );
      } else {
        showToast('다운로드를 시작했습니다.');
      }
    } catch (err: any) {
      showAlert('Error', err?.message || 'Direct add failed');
    } finally {
      setLoadingDirectAdd(false);
    }
  };

  const formatDuration = (sec: number) => {
    const min = Math.floor(sec / 60);
    const remainingSec = Math.floor(sec % 60);
    return `${min}:${remainingSec < 10 ? '0' : ''}${remainingSec}`;
  };

  const renderSearchItem = ({ item }: { item: SearchResult }) => {
    const task = downloadTasks.find(t => t.id === item.youtube_id);
    const isDownloading = task?.status === 'downloading';
    const inLibrary = libraryIds.has(String(item.youtube_id));
    return (
      <View style={styles.trackCard}>
        <Image source={{ uri: item.thumbnail_url }} style={styles.thumbnail} />
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
          <View style={styles.trackMetaRow}>
            <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
            {inLibrary && (
              <View style={styles.inLibraryBadge}>
                <Ionicons name="checkmark-circle" size={11} color="#00e676" />
                <Text style={styles.inLibraryText}>보관됨</Text>
              </View>
            )}
          </View>
        </View>
        <PressableScale 
          style={styles.addButton}
          onPress={() => triggerDownload({ youtube_id: item.youtube_id, title: item.title, artist: item.artist })}
          disabled={isDownloading}
          activeScale={0.82}
          accessibilityRole="button"
          accessibilityLabel={inLibrary ? `${item.title} already in library` : `Download ${item.title}`}
        >
          {isDownloading ? (
            <ActivityIndicator color="#00e676" size="small" />
          ) : (
            <Ionicons
              name={inLibrary ? "checkmark-circle-outline" : "cloud-download-outline"}
              size={24}
              color="#00e676"
            />
          )}
        </PressableScale>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logoText}>yum<Text style={styles.accentText}>p3</Text></Text>
          <Text style={styles.serverInfo} numberOfLines={1}>Search &amp; Download</Text>
        </View>
      </View>

      <View style={styles.content}>
          <View style={styles.directAddContainer}>
            <Text style={styles.sectionTitle}>Quick Download Link</Text>
            <Text style={styles.sectionHint}>
              영상 1개 또는 재생목록(최대 100곡) URL을 붙여넣으세요
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.directInput}
                placeholder="YouTube 영상/재생목록 URL 또는 ID"
                placeholderTextColor="#666"
                value={directUrl}
                onChangeText={setDirectUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PressableScale 
                style={styles.directAddButton} 
                onPress={handleDirectAddPress}
                disabled={loadingDirectAdd}
                activeScale={0.9}
              >
                {loadingDirectAdd ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <Ionicons name="add" size={24} color="#0a0a0a" />
                )}
              </PressableScale>
            </View>
          </View>

          <View style={styles.searchContainer}>
            <Text style={styles.sectionTitle}>Search Official Audio</Text>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs, artists..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => handleSearch()}
                returnKeyType="search"
              />
              <PressableScale style={styles.searchButton} onPress={() => handleSearch()} activeScale={0.82}>
                <Ionicons name="search" size={22} color="#00e676" />
              </PressableScale>
            </View>
            <View style={styles.filterOptionsRow}>
              <Text style={styles.filterHint}>
                제목-가수 및 아티스트 이름으로 검색해주세요
              </Text>
              <PressableScale 
                style={[styles.officialToggleBtn, isOfficialOnly && styles.officialToggleBtnActive]} 
                onPress={() => setIsOfficialOnly(!isOfficialOnly)}
                activeScale={0.92}
              >
                <Ionicons 
                  name={isOfficialOnly ? "checkbox" : "square-outline"} 
                  size={16} 
                  color={isOfficialOnly ? "#00e676" : "#707888"} 
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.officialToggleText, isOfficialOnly && styles.officialToggleTextActive]}>
                  앨범 표지만 (공식음원)
                </Text>
              </PressableScale>
            </View>

            {loadingSearch ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator color="#00e676" size="large" />
                <Text style={styles.loaderText}>Searching YouTube...</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.youtube_id}
                renderItem={renderSearchItem}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  searchQuery && !loadingSearch ? (
                    <Text style={styles.emptyText}>No verified Official Audio tracks found.</Text>
                  ) : recentSearches.length > 0 ? (
                    <View style={styles.recentContainer}>
                      <View style={styles.recentHeader}>
                        <Text style={styles.recentTitle}>최근 검색</Text>
                        <PressableScale onPress={clearRecentSearches} activeScale={0.9} accessibilityRole="button" accessibilityLabel="Clear recent searches">
                          <Text style={styles.recentClear}>지우기</Text>
                        </PressableScale>
                      </View>
                      <View style={styles.recentChips}>
                        {recentSearches.map((q) => (
                          <PressableScale
                            key={q}
                            style={styles.recentChip}
                            onPress={() => { setSearchQuery(q); handleSearch(q); }}
                            activeScale={0.95}
                          >
                            <Ionicons name="time-outline" size={13} color="#7c8598" />
                            <Text style={styles.recentChipText} numberOfLines={1}>{q}</Text>
                          </PressableScale>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.welcomeInfo}>
                      <Ionicons name="musical-notes-outline" size={48} color="#2d3342" />
                      <Text style={styles.welcomeTitle}>Find Private Music</Text>
                      <Text style={styles.welcomeText}>Search and download audio files directly onto your device.</Text>
                    </View>
                  )
                }
              />
            )}
          </View>
      </View>
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
    borderBottomWidth: 1,
    borderColor: '#1f2430',
    paddingBottom: 15,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
  },
  accentText: {
    color: '#00e676',
  },
  serverInfo: {
    fontSize: 10,
    color: '#7c8598',
    marginTop: 2,
    maxWidth: 200,
  },
  content: {
    flex: 1,
  },
  directAddContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  sectionHint: {
    color: '#707888',
    fontSize: 11,
    marginTop: -6,
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
  },
  directInput: {
    flex: 1,
    backgroundColor: '#161920',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#252a36',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  directAddButton: {
    backgroundColor: '#00e676',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchContainer: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: '#161920',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#252a36',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    paddingVertical: 12,
    fontSize: 15,
  },
  searchButton: {
    padding: 4,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  filterHint: {
    color: '#707888',
    fontSize: 11,
    flex: 1,
    marginRight: 10,
  },
  officialToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161920',
    borderWidth: 1,
    borderColor: '#252a36',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  officialToggleBtnActive: {
    borderColor: '#00e676',
  },
  officialToggleText: {
    color: '#707888',
    fontSize: 10,
    fontWeight: '600',
  },
  officialToggleTextActive: {
    color: '#00e676',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: '#707888',
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 80,
  },
  trackCard: {
    flexDirection: 'row',
    backgroundColor: '#161920',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1d212b',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#252a36',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  trackTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  trackArtist: {
    color: '#707888',
    fontSize: 12,
    marginBottom: 4,
  },
  trackDuration: {
    color: '#6b7488',
    fontSize: 10,
  },
  addButton: {
    padding: 8,
  },
  emptyText: {
    color: '#707888',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  welcomeInfo: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 30,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b0b8c8',
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeText: {
    color: '#7c8598',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  trackMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inLibraryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 3,
  },
  inLibraryText: {
    color: '#00e676',
    fontSize: 9,
    fontWeight: '700',
  },
  recentContainer: {
    marginTop: 20,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentTitle: {
    color: '#b0b8c8',
    fontSize: 13,
    fontWeight: '700',
  },
  recentClear: {
    color: '#7c8598',
    fontSize: 12,
    fontWeight: '600',
  },
  recentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161920',
    borderWidth: 1,
    borderColor: '#252a36',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recentChipText: {
    color: '#b0b8c8',
    fontSize: 12,
    marginLeft: 6,
    maxWidth: 180,
  },
});
