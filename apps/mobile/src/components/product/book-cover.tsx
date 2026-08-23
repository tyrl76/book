import { StyleSheet, Text, View } from 'react-native';

type Props = { title: string; color: string; small?: boolean };

export function BookCover({ title, color, small = false }: Props) {
  return (
    <View style={[styles.cover, small ? styles.small : styles.large, { backgroundColor: color }]}>
      <View style={styles.rule} />
      <Text numberOfLines={3} style={[styles.title, small && styles.smallTitle]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.14)',
    elevation: 3,
  },
  large: { width: 82, height: 118 },
  small: { width: 58, height: 82, padding: 7 },
  rule: { width: 18, height: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  title: { color: '#FFF9EF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  smallTitle: { fontSize: 10, lineHeight: 13 },
});
