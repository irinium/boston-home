// Minimal expo-router stand-in: tests drive navigation through `mockRouter` and `setParams`.
import { useEffect, type ReactNode } from 'react';

export const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
};

let params: Record<string, string | undefined> = {};
export const setParams = (next: Record<string, string | undefined>) => {
  params = next;
};

export const useRouter = () => mockRouter;
export const useLocalSearchParams = () => params;
export const useFocusEffect = (effect: () => void) => {
  useEffect(effect, [effect]);
};
export const Link = ({ children }: { children: ReactNode }) => children;

type ScreenOptions = { headerRight?: () => ReactNode };
function Screen({ options }: { name?: string; options?: ScreenOptions }) {
  return options?.headerRight ? options.headerRight() : null;
}
function Protected({ children, guard }: { children: ReactNode; guard: boolean }) {
  return guard ? children : null;
}
export const Stack = Object.assign(({ children }: { children: ReactNode }) => children, { Screen, Protected });
export const ThemeProvider = ({ children }: { children: ReactNode }) => children;
export const DarkTheme = { colors: {} };
export const DefaultTheme = { colors: {} };
