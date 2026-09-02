import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { title: string; color: string; coverUrl?: string; small?: boolean };

export function BookCover({ title, color, coverUrl, small = false }: Props) {
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const showImage = Boolean(coverUrl && failedCoverUrl !== coverUrl);

  return (
    <View style={[styles.cover, small ? styles.small : styles.large]}>
      {showImage ? (
        <Image
          accessibilityLabel={`${title} 표지`}
          contentFit="cover"
          onError={() => setFailedCoverUrl(coverUrl ?? null)}
          source={coverUrl}
          transition={150}
          style={styles.image}
        />
      ) : (
        <View style={[styles.generated, { backgroundColor: color }]}>
          <View style={styles.rule} />
          <Text numberOfLines={3} style={[styles.title, small && styles.smallTitle]}>
            {title}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: 8,
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.14)',
    elevation: 3,
  },
  large: { width: 82, height: 118 },
  small: { width: 58, height: 82 },
  image: { width: '100%', height: '100%', borderRadius: 8 },
  generated: { flex: 1, borderRadius: 8, padding: 10, justifyContent: 'space-between', overflow: 'hidden' },
  rule: { width: 18, height: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  title: { color: '#FFF9EF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  smallTitle: { fontSize: 10, lineHeight: 13 },
});
