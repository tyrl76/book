import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookAddCard } from '@/components/product/book-add-card';
import { FeedbackBanner } from '@/components/ui/feedback-banner';
import { useBookByISBN, useCreateReadingRun } from '@/features/catalog/hooks';
import { useFeedback } from '@/features/feedback/feedback-provider';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import type { ReadingRun } from '@/types/domain';

export default function ScanScreen() {
  const theme = useTheme();
  const feedback = useFeedback();
  const [permission, requestPermission] = useCameraPermissions();
  const [isbn, setISBN] = useState<string | null>(null);
  const book = useBookByISBN(isbn);
  const create = useCreateReadingRun();

  const askForCamera = async () => {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch (error) {
      feedback.showError('카메라 설정을 열지 못했어요', error, { label: '다시 시도', onPress: () => void askForCamera() });
    }
  };

  const add = async (
    totalValue: number,
    progressBasis: ReadingRun['progressBasis'],
    status: Extract<ReadingRun['status'], 'reading' | 'want_to_read'>,
  ) => {
    if (!isbn) return;
    try {
      await create.mutateAsync({ isbn, totalValue, progressBasis, status });
      feedback.showSuccess(status === 'reading' ? '읽는 책에 추가했어요' : '읽고 싶은 책에 담았어요', undefined, {
        label: status === 'reading' ? '기록하기' : '책장 보기',
        onPress: () => router.dismissTo(status === 'reading' ? '/record' : '/library'),
      });
    } catch (error) {
      const message = error instanceof ApiError && error.status === 409 ? '이미 읽는 중인 책입니다.' : error instanceof Error ? error.message : '책을 추가하지 못했습니다.';
      feedback.showError('책을 추가하지 못했어요', new Error(message), {
        label: '다시 시도',
        onPress: () => void add(totalValue, progressBasis, status),
      });
    }
  };

  if (!permission) return <View style={[styles.loadingPermission, { backgroundColor: theme.background }]} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.permission, { backgroundColor: theme.background }]}>
        <View style={[styles.cameraMark, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.cameraMarkText, { color: theme.primary }]}>▣</Text>
        </View>
        <Text style={[styles.permissionTitle, { color: theme.text }]}>카메라 권한이 필요해요</Text>
        <Text style={[styles.permissionCopy, { color: theme.textSecondary }]}>책 뒷면의 ISBN을 읽어 빠르게 책을 찾습니다.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카메라 권한 허용"
          onPress={() => void askForCamera()}
          style={({ pressed }) => [styles.permissionButton, { backgroundColor: theme.primary, opacity: pressed ? 0.74 : 1 }]}>
          <Text style={[styles.buttonText, { color: theme.inverse }]}>{permission.canAskAgain === false ? '설정에서 카메라 허용' : '카메라 허용'}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8'] }}
        onBarcodeScanned={isbn ? undefined : ({ data }) => {
          if (/^(?:978|979)\d{10}$/.test(data)) setISBN(data);
        }}
      />
      <SafeAreaView style={styles.overlay}>
        <Text style={styles.guide}>책 뒷면 바코드를 사각형 안에 맞춰주세요</Text>
        <View style={styles.frame} />
        {isbn ? (
          <View style={[styles.result, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={[styles.resultLabel, { color: theme.primary }]}>ISBN 인식 완료</Text>
                <Text style={[styles.resultValue, { color: theme.text }]}>{isbn}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setISBN(null)}
                style={[styles.retryButton, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.secondaryText, { color: theme.primary }]}>다시 스캔</Text>
              </Pressable>
            </View>
            {book.isLoading ? (
              <ActivityIndicator color={theme.primary} style={styles.loading} />
            ) : book.isError ? (
              <FeedbackBanner title="책 정보를 불러오지 못했어요" error={book.error} onAction={() => void book.refetch()} compact />
            ) : book.data ? (
              <BookAddCard book={book.data} compact pending={create.isPending} onAdd={add} />
            ) : (
              <View style={styles.notFound}>
                <Text style={[styles.notFoundTitle, { color: theme.text }]}>등록된 책을 찾지 못했어요</Text>
                <Text style={[styles.resultHint, { color: theme.textSecondary }]}>다시 스캔하거나 제목으로 검색해 주세요.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/book-search')}
                  style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.buttonText, { color: theme.inverse }]}>제목으로 검색</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  loadingPermission: { flex: 1 },
  overlay: { flex: 1, padding: 24, justifyContent: 'space-between', alignItems: 'center' },
  guide: { color: '#fff', fontSize: 15, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.55)', padding: 12, borderRadius: 12 },
  frame: { position: 'absolute', top: '29%', width: '84%', aspectRatio: 1.8, borderWidth: 3, borderColor: '#F7E3A1', borderRadius: 18 },
  result: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 13, fontWeight: '900' },
  resultValue: { fontSize: 23, fontWeight: '900', letterSpacing: 1 },
  resultHint: { fontSize: 12 },
  loading: { marginVertical: 36 },
  notFound: { gap: 9 },
  notFoundTitle: { fontSize: 17, fontWeight: '900' },
  primaryButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  retryButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, justifyContent: 'center' },
  buttonText: { fontWeight: '900' },
  secondaryText: { fontWeight: '900' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  cameraMark: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  cameraMarkText: { fontSize: 25, fontWeight: '900' },
  permissionTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  permissionCopy: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  permissionButton: { minHeight: 50, marginTop: 12, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
