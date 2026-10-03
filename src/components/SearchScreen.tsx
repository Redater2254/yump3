import { palette, HIT_SLOP } from '../theme';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDownload } from '../context/DownloadContext';
import { useAlert } from '../context/AlertContext';
import { PressableScale } from './ui/PressableScale';
import { searchArtTracks, searchTracks, trackThumbUrl } from '../services/ytdlp';
import { getTracks } from '../services/library';

interface SearchResult {
  youtube_id: string;
  title: string;
  artist: string;
  album?: string | null;
  duration: number;
  thumbnail_url: string;
  is_topic?: boolean;
  channel_verified?: boolean;
}

/** Titles that are clearly not album-art tracks (MVs, lyric/performance videos). */
const NON_ART_TITLE =
  /(lyric|lyrics|가사|color\s*coded|뮤직비디오|music\s*video|official\s*video|official\s*mv|\bmv\b|performance|퍼포먼스|choreography|안무|dance\s*practice|reaction|리액션|teaser|티저|interview|인터뷰)/i;

export const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { downloadTasks, triggerDownload, handleDirectAdd } = useDownload();
  const { showAlert: showCustomAlert, showToast } = useAlert();
  const [directUrl, setDirectUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDirectAdd, setLoadingDirectAdd] = useState(false);
  
  const [isOfficialOnly, setIsOfficialOnly] = useState(true);
  const [artChecking, setArtChecking] = useState(false);
  const [artFound, setArtFound] = useState<number | null>(null);

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

  const searchSeqRef = useRef(0);
  const artRunningRef = useRef(false);
  const artPendingRef = useRef<{ query: string; seq: number } | null>(null);

  /**
   * Deep art-track search: extracts each candidate and keeps only entries with
   * artist/album/track metadata (see the art-track guide). "Topic" is appended
   * because YouTube otherwise ranks MVs and lyric videos above art tracks.
   */
  const runArtSearch = async (query: string, seq: number) => {
    artRunningRef.current = true;
    setArtChecking(true);
    try {
      const artQuery = /topic|주제/i.test(query) ? query : `${query} Topic`;
      const arts = await searchArtTracks(artQuery, 8);
      if (seq === searchSeqRef.current) {
        const clean = arts.filter((r: any) => !NON_ART_TITLE.test(r.title || ''));
        setArtFound(clean.length);
        if (clean.length > 0) setSearchResults(clean);
      }
    } catch (e) {
      if (seq === searchSeqRef.current) setArtFound(0);
    } finally {
      artRunningRef.current = false;
      setArtChecking(false);
      const pending = artPendingRef.current;
      artPendingRef.current = null;
      if (pending && pending.seq === searchSeqRef.current) {
        runArtSearch(pending.query, pending.seq);
      }
    }
  };

  const scheduleArtSearch = (query: string, seq: number) => {
    if (artRunningRef.current) {
      // yt-dlp extraction is heavy on device: keep only the latest query.
      artPendingRef.current = { query, seq };
      return;
    }
    runArtSearch(query, seq);
  };

  const handleSearch = async (
    overrideQuery?: string,
    options?: { dismissKeyboard?: boolean; official?: boolean }
  ) => {
    const query = (overrideQuery ?? searchQuery).trim();
    if (!query) return;
    const official = options?.official ?? isOfficialOnly;
    const seq = ++searchSeqRef.current;
    if (options?.dismissKeyboard !== false) Keyboard.dismiss();
    setLoadingSearch(true);
    setArtFound(null);
    try {
      const results = await searchTracks(query, official ? 12 : 10);
      if (seq !== searchSeqRef.current) return;

      // Fast heuristic while the deep check runs: verified channels without
      // MV/lyric markers. The deep result replaces this when it arrives.
      let filtered = results;
      if (official) {
        const clean = results.filter((r: any) => !NON_ART_TITLE.test(r.title || ''));
        const flatOfficial = clean.filter(
          (r: any) => r.is_topic === true || r.channel_verified === true
        );
        if (flatOfficial.length > 0) filtered = flatOfficial;
      }
      setSearchResults(filtered);
      saveRecentSearch(query);
      if (official) scheduleArtSearch(query, seq);
    } catch (err: any) {
      showAlert('Search Error', err?.message || 'Search failed');
    } finally {
      setLoadingSearch(false);
    }
  };

  const toggleOfficialOnly = () => {
    const next = !isOfficialOnly;
    setIsOfficialOnly(next);
    searchSeqRef.current += 1; // discard in-flight deep results
    setArtFound(null);
    if (searchQuery.trim()) {
      handleSearch(undefined, { official: next, dismissKeyboard: false });
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
        <Image source={{ uri: trackThumbUrl(item) }} style={styles.thumbnail} />
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
          <View style={styles.trackMetaRow}>
            <Text style={styles.trackDuration}>{formatDuration(item.duration)}</Text>
            {inLibrary && (
              <View style={styles.inLibraryBadge}>
                <Ionicons name="checkmark-circle" size={11} color={palette.accent} />
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
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={inLibrary ? `${item.title} already in library` : `Download ${item.title}`}
        >
          {isDownloading ? (
            <ActivityIndicator color={palette.accent} size="small" />
          ) : (
            <Ionicons
              name={inLibrary ? "checkmark-circle-outline" : "cloud-download-outline"}
              size={24}
              color={palette.accent}
            />
          )}
        </PressableScale>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logoText}>yum<Text style={styles.accentText}>p3</Text></Text>
          <Text style={styles.serverInfo} numberOfLines={1}>Search &amp; Download</Text>
        </View>
      </View>

      <View style={styles.content}>
          <View style={styles.directAddContainer}>
            <Text style={styles.sectionTitle}>빠른 다운로드</Text>
            <Text style={styles.sectionHint}>
              영상 1개 또는 재생목록(최대 100곡) URL을 붙여넣으세요
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.directInput}
                placeholder="YouTube 영상/재생목록 URL 또는 ID"
                placeholderTextColor={palette.textDim}
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
                  <ActivityIndicator color={palette.accentInk} size="small" />
                ) : (
                  <Ionicons name="add" size={24} color={palette.accentInk} />
                )}
              </PressableScale>
            </View>
          </View>

          <View style={styles.searchContainer}>
            <Text style={styles.sectionTitle}>공식 음원 검색</Text>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs, artists..."
                placeholderTextColor={palette.textDim}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => handleSearch()}
                returnKeyType="search"
              />
              <PressableScale style={styles.searchButton} onPress={() => handleSearch()} activeScale={0.82} hitSlop={HIT_SLOP}>
                <Ionicons name="search" size={22} color={palette.accent} />
              </PressableScale>
            </View>
            <View style={styles.filterOptionsRow}>
              <Text style={styles.filterHint}>
                제목-가수 및 아티스트 이름으로 검색해주세요
              </Text>
              <PressableScale 
                style={[styles.officialToggleBtn, isOfficialOnly && styles.officialToggleBtnActive]} 
                onPress={toggleOfficialOnly}
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

            {isOfficialOnly && (artChecking || artFound !== null) && (
              <View style={styles.artStatusRow}>
                {artChecking ? (
                  <>
                    <ActivityIndicator size="small" color={palette.accent} />
                    <Text style={styles.artStatusText}>아트트랙(공식 음원) 확인 중...</Text>
                  </>
                ) : (
                  <Text style={styles.artStatusText}>
                    {artFound && artFound > 0
                      ? `아트트랙 ${artFound}곡을 찾았습니다`
                      : '아트트랙을 찾지 못해 일반 결과를 표시합니다'}
                  </Text>
                )}
              </View>
            )}

            {loadingSearch ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator color={palette.accent} size="large" />
                <Text style={styles.loaderText}>YouTube 검색 중...</Text>
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
                    <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
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
                            <Ionicons name="time-outline" size={13} color={palette.textDim} />
                            <Text style={styles.recentChipText} numberOfLines={1}>{q}</Text>
                          </PressableScale>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.welcomeInfo}>
                      <Ionicons name="musical-notes-outline" size={48} color={palette.borderStrong} />
                      <Text style={styles.welcomeTitle}>음악 검색</Text>
                      <Text style={styles.welcomeText}>기기에 바로 저장하고 재생하세요.</Text>
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
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
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
    color: palette.text,
  },
  accentText: {
    color: palette.accent,
  },
  serverInfo: {
    fontSize: 12,
    color: palette.textDim,
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
    color: palette.text,
    marginBottom: 12,
  },
  sectionHint: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
  },
  directInput: {
    flex: 1,
    backgroundColor: palette.surface,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  directAddButton: {
    backgroundColor: palette.accent,
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
    backgroundColor: palette.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
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
    color: palette.textMuted,
    fontSize: 12,
    flex: 1,
    marginRight: 10,
  },
  officialToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  officialToggleBtnActive: {
    borderColor: palette.accent,
  },
  officialToggleText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  officialToggleTextActive: {
    color: palette.accent,
  },
  artStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 2 },
  artStatusText: { color: palette.textDim, fontSize: 12, marginLeft: 6 },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    color: palette.textMuted,
    marginTop: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    // mini player (60..116) + download pill (130) stack above the tab bar
    paddingBottom: 150,
  },
  trackCard: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: palette.border,
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  trackTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  trackArtist: {
    color: palette.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  trackDuration: {
    color: palette.textMuted,
    fontSize: 12,
  },
  addButton: {
    padding: 8,
  },
  emptyText: {
    color: palette.textMuted,
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
    color: palette.textMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeText: {
    color: palette.textDim,
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
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 3,
  },
  inLibraryText: {
    color: palette.accent,
    fontSize: 12,
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
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  recentClear: {
    color: palette.textDim,
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
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recentChipText: {
    color: palette.textMuted,
    fontSize: 12,
    marginLeft: 6,
    maxWidth: 180,
  },
});
