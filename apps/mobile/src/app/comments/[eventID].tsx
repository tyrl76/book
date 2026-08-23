import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/product/screen';
import { Radius, Spacing } from '@/constants/theme';
import { useCreateFeedComment, useCreateReport, useFeedComments } from '@/features/social/hooks';
import { useTheme } from '@/hooks/use-theme';
import type { FeedComment } from '@/types/domain';

const policies: { value: FeedComment['revealPolicy']; label: string; description: string }[] = [
  { value: 'after_position', label: '같은 지점부터', description: '상대가 이 지점에 도달하면 열려요' },
  { value: 'always', label: '바로 공개', description: '진척과 관계없이 보여요' },
  { value: 'finished', label: '완독 후', description: '책을 다 읽은 뒤 열려요' },
];

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.round(hours / 24)}일 전`;
}

export default function CommentsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ eventID: string; title?: string }>();
  const eventID = Array.isArray(params.eventID) ? params.eventID[0] : params.eventID;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;
  const comments = useFeedComments(eventID ?? '');
  const create = useCreateFeedComment(eventID ?? '');
  const report = useCreateReport();
  const [body, setBody] = useState('');
  const [policy, setPolicy] = useState<FeedComment['revealPolicy']>('after_position');

  const submit = async () => {
    const message = body.trim();
    if (!message) return;
    try {
      await create.mutateAsync({ body: message, revealPolicy: policy });
      setBody('');
    } catch (error) {
      Alert.alert('한마디를 남기지 못했어요', error instanceof Error ? error.message : '다시 시도해 주세요');
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: title ? `${title} 대화` : '독서 대화' }} />
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: theme.primary }]}>SPOILER-SAFE TALK</Text>
        <Text style={[styles.title, { color: theme.text }]}>읽은 곳까지만 열리는 대화</Text>
        <Text style={[styles.copy, { color: theme.textSecondary }]}>아직 도달하지 않은 지점의 내용은 자동으로 잠겨요.</Text>
      </View>

      <View style={styles.commentList}>
        {comments.data?.map((comment) => (
          <View key={comment.id} style={[styles.comment, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.commentTop}>
              <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                <Text style={[styles.avatarText, { color: theme.primary }]}>{comment.authorNickname.slice(0, 1)}</Text>
              </View>
              <View style={styles.identity}>
                <Text style={[styles.name, { color: theme.text }]}>{comment.authorNickname}</Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]}>{relativeTime(comment.createdAt)} · {Math.round(comment.normalizedAnchor / 100)}% 지점</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${comment.authorNickname}님의 댓글 신고`}
                onPress={() => Alert.alert('이 댓글을 신고할까요?', undefined, [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '스포일러 신고',
                    style: 'destructive',
                    onPress: () => report.mutate({ targetType: 'comment', targetId: comment.id, reason: 'spoiler' }),
                  },
                ])}
                style={styles.reportButton}>
                <Text style={[styles.reportText, { color: theme.textSecondary }]}>신고</Text>
              </Pressable>
            </View>
            {comment.locked ? (
              <View style={[styles.locked, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.lockedTitle, { color: theme.text }]}>🔒 아직 잠긴 대화예요</Text>
                <Text style={[styles.lockedCopy, { color: theme.textSecondary }]}>
                  {comment.revealPolicy === 'finished' ? '완독하면 내용이 열려요.' : `${Math.round(comment.normalizedAnchor / 100)}%에 도달하면 내용이 열려요.`}
                </Text>
              </View>
            ) : (
              <Text style={[styles.body, { color: theme.text }]}>{comment.body}</Text>
            )}
          </View>
        ))}
        {!comments.isFetching && !comments.data?.length ? (
          <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>첫 한마디를 남겨보세요</Text>
            <Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>친구가 읽은 위치에 맞춰 안전하게 열립니다.</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.composerHeading}>
          <Text style={[styles.composerTitle, { color: theme.text }]}>한마디 남기기</Text>
          <Text style={[styles.counter, { color: theme.textSecondary }]}>{body.length}/1000</Text>
        </View>
        <TextInput
          accessibilityLabel="독서 대화 내용"
          value={body}
          onChangeText={setBody}
          maxLength={1000}
          multiline
          placeholder="책의 이 지점에서 나누고 싶은 이야기를 적어보세요"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        <View style={styles.policyList}>
          {policies.map((item) => {
            const selected = policy === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => setPolicy(item.value)}
                style={[styles.policy, { backgroundColor: selected ? theme.primarySoft : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border }]}>
                <Text style={[styles.policyLabel, { color: selected ? theme.primary : theme.text }]}>{item.label}</Text>
                <Text numberOfLines={1} style={[styles.policyCopy, { color: theme.textSecondary }]}>{item.description}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !body.trim() || create.isPending }}
          disabled={!body.trim() || create.isPending}
          onPress={submit}
          style={[styles.submit, { backgroundColor: body.trim() ? theme.primary : theme.backgroundElement }]}>
          <Text style={[styles.submitText, { color: body.trim() ? theme.inverse : theme.textSecondary }]}>{create.isPending ? '남기는 중…' : '한마디 남기기'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8 },
  copy: { fontSize: 14, lineHeight: 21 },
  commentList: { gap: 10 },
  comment: { borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.three, gap: 12 },
  commentTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '900' },
  identity: { flex: 1 },
  name: { fontSize: 14, fontWeight: '900' },
  meta: { marginTop: 2, fontSize: 11 },
  reportButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reportText: { fontSize: 11, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 22 },
  locked: { borderRadius: Radius.small, padding: 13, gap: 4 },
  lockedTitle: { fontSize: 13, fontWeight: '900' },
  lockedCopy: { fontSize: 12, lineHeight: 18 },
  empty: { borderRadius: Radius.medium, padding: Spacing.four, alignItems: 'center', gap: 5 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyCopy: { fontSize: 12, textAlign: 'center' },
  composer: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.three, gap: 12 },
  composerHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  composerTitle: { fontSize: 17, fontWeight: '900' },
  counter: { fontSize: 11, fontWeight: '700' },
  input: { minHeight: 104, borderWidth: 1, borderRadius: Radius.medium, padding: 13, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  policyList: { gap: 7 },
  policy: { minHeight: 52, borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: 13, justifyContent: 'center' },
  policyLabel: { fontSize: 13, fontWeight: '900' },
  policyCopy: { marginTop: 2, fontSize: 11 },
  submit: { minHeight: 52, borderRadius: Radius.medium, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 14, fontWeight: '900' },
});
