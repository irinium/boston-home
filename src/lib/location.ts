import * as Location from 'expo-location';

export type RoughPoint = { lat: number; lng: number };

/** Two decimals is roughly 1 km: enough for "nearby", too coarse to find a home. */
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Asks for "while using the app" permission and returns a rough current position,
 * or null when the user says no. The database snaps listing points to a ~5 km grid as well.
 */
export async function roughLocation(): Promise<RoughPoint | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
  return { lat: round(position.coords.latitude), lng: round(position.coords.longitude) };
}
