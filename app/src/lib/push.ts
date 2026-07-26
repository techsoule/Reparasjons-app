import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Push håndteres kun på native (iOS/Android). På web (PWA) hoppes det over.
const ER_WEB = Platform.OS === 'web';

// Vis varsler også når appen er i forgrunnen (kun native)
if (!ER_WEB) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Be om tillatelse, hent Expo push-token og lagre det på reparatøren
 * via RPC set_push_token. Kalles etter innlogging.
 */
export async function registrerPush(): Promise<void> {
  if (ER_WEB) {
    // Web-push på iPhone krever eget oppsett (service worker + VAPID) —
    // holdes utenfor v1. Appen fungerer ellers fullt ut i nettleser.
    return;
  }
  if (!Device.isDevice) {
    console.log('Push krever fysisk enhet — hopper over i simulator.');
    return;
  }

  const { status: eksisterende } = await Notifications.getPermissionsAsync();
  let status = eksisterende;
  if (status !== 'granted') {
    const be = await Notifications.requestPermissionsAsync();
    status = be.status;
  }
  if (status !== 'granted') {
    console.log('Push-tillatelse ikke gitt.');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Standard',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2b7de9',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      )
    ).data;
    await supabase.rpc('set_push_token', { token });
  } catch (e) {
    console.warn('Kunne ikke hente/lagre push-token', e);
  }
}

/** Fjern token ved utlogging. */
export async function fjernPush(): Promise<void> {
  try {
    await supabase.rpc('set_push_token', { token: null });
  } catch {
    /* ignorer */
  }
}
