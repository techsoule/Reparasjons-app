// Push-varsel via Expo. Ikke-fatal.

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

export async function sendPush(
  token: string | null,
  tittel: string,
  melding: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!token) return;
  try {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: tittel,
        body: melding,
        data,
      }),
    });
    if (!res.ok) console.error('Expo push-feil', res.status, await res.text());
  } catch (e) {
    console.error('Push feilet', e);
  }
}
