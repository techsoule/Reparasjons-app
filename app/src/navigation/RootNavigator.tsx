import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { farger, skrift } from '../theme';
import { useAuth } from '../context/AuthContext';
import { LasterVisning } from '../components/UI';

import { LoginScreen } from '../screens/LoginScreen';
import { MineJobberScreen } from '../screens/MineJobberScreen';
import { JobbDetaljScreen } from '../screens/JobbDetaljScreen';
import { AlleJobberScreen } from '../screens/AlleJobberScreen';
import { FordelingScreen } from '../screens/FordelingScreen';
import { InntjeningScreen } from '../screens/InntjeningScreen';
import { TilgjengelighetScreen } from '../screens/TilgjengelighetScreen';
import { VarslerScreen } from '../screens/VarslerScreen';

import type {
  JobberStackParamList,
  AlleStackParamList,
  TabParamList,
} from './types';

const felles = {
  headerStyle: { backgroundColor: farger.bakgrunn },
  headerTitleStyle: { fontFamily: skrift.semibold, color: farger.tekst },
  headerShadowVisible: false,
  headerTintColor: farger.primar,
} as const;

const JobberStack = createNativeStackNavigator<JobberStackParamList>();
function JobberNavigator() {
  return (
    <JobberStack.Navigator screenOptions={felles}>
      <JobberStack.Screen
        name="MineJobber"
        component={MineJobberScreen}
        options={({ navigation }) => ({
          title: 'Mine jobber',
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('Tilgjengelighet')}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <JobberStack.Screen
        name="JobbDetalj"
        component={JobbDetaljScreen}
        options={{ title: 'Jobbdetalj' }}
      />
      <JobberStack.Screen
        name="Tilgjengelighet"
        component={TilgjengelighetScreen}
        options={{ title: 'Tilgjengelighet' }}
      />
    </JobberStack.Navigator>
  );
}

const AlleStack = createNativeStackNavigator<AlleStackParamList>();
function AlleNavigator() {
  return (
    <AlleStack.Navigator screenOptions={felles}>
      <AlleStack.Screen
        name="AlleJobber"
        component={AlleJobberScreen}
        options={{ title: 'Alle jobber' }}
      />
      <AlleStack.Screen
        name="JobbDetalj"
        component={JobbDetaljScreen}
        options={{ title: 'Jobbdetalj' }}
      />
    </AlleStack.Navigator>
  );
}

const Tabs = createBottomTabNavigator<TabParamList>();

function tabIkon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bunn = Math.max(insets.bottom, 8); // klaring for iPhone hjem-strek
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: farger.primar,
        tabBarInactiveTintColor: farger.tekstSvak,
        tabBarLabelStyle: { fontFamily: skrift.medium, fontSize: 11 },
        tabBarStyle: {
          borderTopColor: farger.kant,
          height: 56 + bunn,
          paddingBottom: bunn,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="Jobber"
        component={JobberNavigator}
        options={{ title: 'Mine', tabBarIcon: tabIkon('🔧') }}
      />
      <Tabs.Screen
        name="Alle"
        component={AlleNavigator}
        options={{ title: 'Alle', tabBarIcon: tabIkon('📋') }}
      />
      <Tabs.Screen
        name="Fordeling"
        component={FordelingScreen}
        options={{ tabBarIcon: tabIkon('📊') }}
      />
      <Tabs.Screen
        name="Inntjening"
        component={InntjeningScreen}
        options={{ title: 'Inntjening', tabBarIcon: tabIkon('💰') }}
      />
      <Tabs.Screen
        name="Varsler"
        component={VarslerScreen}
        options={{ tabBarIcon: tabIkon('🔔') }}
      />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { session, tekniker, laster } = useAuth();

  return (
    <NavigationContainer>
      {laster ? (
        <LasterVisning />
      ) : session && tekniker ? (
        <MainTabs />
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
