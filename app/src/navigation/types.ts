import type { NavigatorScreenParams } from '@react-navigation/native';

export type JobberStackParamList = {
  MineJobber: undefined;
  JobbDetalj: { jobId: string };
  Tilgjengelighet: undefined;
  NyJobb: undefined;
};

export type AlleStackParamList = {
  AlleJobber: undefined;
  JobbDetalj: { jobId: string };
};

export type TabParamList = {
  Jobber: NavigatorScreenParams<JobberStackParamList>;
  Alle: NavigatorScreenParams<AlleStackParamList>;
  Fordeling: undefined;
  Inntjening: undefined;
  Varsler: undefined;
};
