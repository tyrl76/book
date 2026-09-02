import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  pending = false,
  pendingLabel = '처리 중…',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!pending) onCancel();
      }}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="확인 창 닫기"
          accessibilityRole="button"
          disabled={pending}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundElement, opacity: pressed || pending ? 0.58 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: theme.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent, opacity: pressed || pending ? 0.58 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: theme.inverse }]}>
                {pending ? pendingLabel : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(15, 16, 14, 0.52)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.four,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  copy: { gap: 9 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '900' },
  message: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 9 },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonText: { fontSize: 14, fontWeight: '900' },
});
