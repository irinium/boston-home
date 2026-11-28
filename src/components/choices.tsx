import { Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { toggleIn } from '@/lib/options';

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{children}</View>
    </View>
  );
}

/** One value or none: pressing the selected chip clears it. */
export function SingleChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  labelFor,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <Group label={label}>
      {options.map((o) => (
        <Chip key={o} label={labelFor(o)} selected={value === o} onPress={() => onChange(value === o ? null : o)} />
      ))}
    </Group>
  );
}

export function MultiChoice<T extends string>({
  label,
  options,
  values,
  onChange,
  labelFor,
}: {
  label: string;
  options: readonly T[];
  values: readonly T[];
  onChange: (values: T[]) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <Group label={label}>
      {options.map((o) => (
        <Chip key={o} label={labelFor(o)} selected={values.includes(o)} onPress={() => onChange(toggleIn(values, o))} />
      ))}
    </Group>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two }}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}
