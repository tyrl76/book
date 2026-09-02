import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/error-message';

type FeedbackTone = 'success' | 'info' | 'error';

type FeedbackAction = {
  label: string;
  onPress: () => void;
};

type FeedbackInput = {
  tone: FeedbackTone;
  title: string;
  message?: string;
  action?: FeedbackAction;
  durationMs?: number;
};

type FeedbackValue = {
  dismiss: () => void;
  show: (input: FeedbackInput) => void;
  showError: (title: string, error: unknown, action?: FeedbackAction) => void;
  showSuccess: (title: string, message?: string, action?: FeedbackAction) => void;
};

type FeedbackItem = FeedbackInput & { id: number };

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren) {
  const theme = useTheme();
  const [item, setItem] = useState<FeedbackItem | null>(null);

  const dismiss = useCallback(() => setItem(null), []);
  const show = useCallback((input: FeedbackInput) => {
    setItem({ ...input, id: Date.now() });
  }, []);
  const showError = useCallback((title: string, error: unknown, action?: FeedbackAction) => {
    show({ tone: 'error', title, message: errorMessage(error), action });
  }, [show]);
  const showSuccess = useCallback((title: string, message?: string, action?: FeedbackAction) => {
    show({ tone: 'success', title, message, action });
  }, [show]);

  useEffect(() => {
    if (!item || item.tone === 'error' || item.action) return;
    const timer = setTimeout(dismiss, item.durationMs ?? 4500);
    return () => clearTimeout(timer);
  }, [dismiss, item]);

  const value = useMemo(() => ({ dismiss, show, showError, showSuccess }), [dismiss, show, showError, showSuccess]);
  const borderColor = item?.tone === 'error' ? theme.accent : item?.tone === 'success' ? theme.primary : theme.border;

  return (
    <FeedbackContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {item ? (
          <View pointerEvents="box-none" style={styles.viewport}>
            <View
              accessibilityLiveRegion={item.tone === 'error' ? 'assertive' : 'polite'}
              accessibilityRole="alert"
              style={[styles.toast, { backgroundColor: theme.card, borderColor, shadowColor: theme.text }]}>
              <View style={styles.copy}>
                <Text style={[styles.title, { color: item.tone === 'error' ? theme.accent : theme.text }]}>{item.title}</Text>
                {item.message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{item.message}</Text> : null}
              </View>
              {item.action ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}: ${item.action.label}`}
                  onPress={() => {
                    dismiss();
                    item.action?.onPress();
                  }}
                  style={({ pressed }) => [styles.action, { backgroundColor: theme.primarySoft, opacity: pressed ? 0.62 : 1 }]}>
                  <Text style={[styles.actionText, { color: theme.primary }]}>{item.action.label}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title} 메시지 닫기`}
                onPress={dismiss}
                style={({ pressed }) => [styles.close, { opacity: pressed ? 0.54 : 1 }]}>
                <Text style={[styles.closeText, { color: theme.textSecondary }]}>×</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider');
  return value;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewport: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: BottomTabInset + 18,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 560,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingVertical: 13,
    paddingLeft: Spacing.three,
    paddingRight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 14,
  },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  message: { fontSize: 12, lineHeight: 18 },
  action: { minWidth: 44, minHeight: 44, borderRadius: Radius.small, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '900' },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, lineHeight: 28 },
});
