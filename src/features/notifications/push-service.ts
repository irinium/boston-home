// The service wired to the real adapters (Expo on the device, Supabase on the server).
import { supabasePushBackend } from './api';
import { expoPushDevice } from './device';
import { createPushService } from './service';

export const pushService = createPushService({ device: expoPushDevice, backend: supabasePushBackend });
