import React, { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LasterVisning } from './src/components/UI';
import { registrerPush } from './src/lib/push';
import { farger } from './src/theme';

// Registrer push når reparatøren er innlogget
function PushRegistrering() {
  const { session, tekniker } = useAuth();
  useEffect(() => {
    if (session && tekniker) registrerPush();
  }, [session, tekniker]);
  return null;
}

export default function App() {
  const [fonterKlare] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fonterKlare) {
    return (
      <View style={{ flex: 1, backgroundColor: farger.bakgrunn }}>
        <LasterVisning />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <PushRegistrering />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
