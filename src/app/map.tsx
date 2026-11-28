import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { mapAccess } from '@/features/map/domain/access';
import { ListingsMap } from '@/features/map/ui/listings-map';
import { MapGate } from '@/features/map/ui/map-gate';
import { useFilters } from '@/lib/filter-store';
import { useAuth } from '@/providers/auth';

export default function MapScreen() {
  const { t } = useTranslation();
  const { session, account } = useAuth();
  const filters = useFilters();
  const access = mapAccess(session !== null, account);

  return (
    <>
      <Stack.Screen options={{ title: t('map.title') }} />
      {access === 'allowed' ? (
        // A new location filter re-centres the map.
        <ListingsMap key={`${filters.lat},${filters.lng},${filters.radiusKm}`} filters={filters} />
      ) : (
        <MapGate access={access} />
      )}
    </>
  );
}
