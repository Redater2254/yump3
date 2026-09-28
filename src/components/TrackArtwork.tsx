import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  youtubeId?: string | null;
  uri?: string | null;
  style?: any;
  placeholderIconSize?: number;
}

/**
 * Album art that starts from YouTube's highest resolution and steps down when a
 * size is missing (maxresdefault is not available for every video).
 */
export const TrackArtwork: React.FC<Props> = ({
  youtubeId,
  uri,
  style,
  placeholderIconSize = 48,
}) => {
  const candidates = useMemo(() => {
    const list: string[] = [];
    const push = (u?: string | null) => {
      if (u && !list.includes(u)) list.push(u);
    };
    if (uri && /(maxresdefault|sddefault)/.test(uri)) push(uri);
    if (youtubeId) {
      push(`https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`);
      push(`https://i.ytimg.com/vi/${youtubeId}/sddefault.jpg`);
      push(`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`);
    }
    push(uri);
    return list;
  }, [youtubeId, uri]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [youtubeId, uri]);

  const src = candidates[index];
  if (!src) {
    return (
      <View style={[style, styles.placeholder]}>
        <Ionicons name="musical-notes" size={placeholderIconSize} color="#2d3342" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: src }}
      style={style}
      onError={() => setIndex((i) => (i + 1 < candidates.length ? i + 1 : i))}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#161920' },
});
