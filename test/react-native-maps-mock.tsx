// Stand-in for react-native-maps: plain views that keep their props, so tests can fire map events.
import { type ReactNode, type Ref, useImperativeHandle } from 'react';
import { Pressable, View } from 'react-native';

export const animateToRegion = jest.fn();

type MapProps = { children?: ReactNode; testID?: string; ref?: Ref<unknown>; [key: string]: unknown };

export default function MapView({ children, ref, ...props }: MapProps) {
  useImperativeHandle(ref, () => ({ animateToRegion }));
  return <View {...props}>{children}</View>;
}

type MarkerProps = { children?: ReactNode; onPress?: () => void; [key: string]: unknown };

export function Marker({ children, onPress, ...props }: MarkerProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} {...props}>
      {children}
    </Pressable>
  );
}
