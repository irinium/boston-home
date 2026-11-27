import { Pressable, StyleSheet, TextInput, type TextInputProps, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={[styles.screen, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.accent : variant === 'danger' ? 'transparent' : theme.backgroundElement;
  const color = variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      <ThemedText style={{ color, fontWeight: 600 }}>{label}</ThemedText>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.sage : theme.backgroundElement,
          borderColor: selected ? theme.sage : theme.border,
        },
      ]}>
      <ThemedText type="small" style={{ color: selected ? '#FFFFFF' : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const theme = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          rest.multiline && { minHeight: 110, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  button: { borderRadius: Radius.large, paddingVertical: 14, paddingHorizontal: Spacing.four, alignItems: 'center' },
  chip: { borderRadius: Radius.large, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12 },
  input: { borderRadius: Radius.small, borderWidth: 1, padding: 12, fontSize: 16 },
  card: { borderRadius: Radius.medium, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
});
