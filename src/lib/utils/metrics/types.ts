import { DeviceInfo, RTCConnection, RTCParams } from '../../modules/core.types';

export type MetricParams = {
  params: RTCParams;
  connection: RTCConnection;
  timeout: number;
};

export type StatsTypes =
  | 'media-source'
  | 'certificate'
  | 'codec'
  | 'candidate-pair'
  | 'remote-candidate'
  | 'local-candidate'
  | 'inbound-rtp'
  | 'track'
  | 'stream'
  | 'outbound-rtp'
  | 'peer-connection'
  | 'remote-inbound-rtp'
  | 'remote-outbound-rtp'
  | 'transport';

export type Stats = {
  [index in StatsTypes]: Array<any>;
};

export enum MetricTypesEnum {
  BASE = 'base',
  BITRATE = 'bitrate',
}

export type MediaType = 'audio' | 'video';
export type BitrateMetricType = {
  outbound: {
    video: {
      bytes: number;
      mediaType: MediaType;
      timestamp: number;
      qualityLimitation?: {
        qualityLimitationDurations: {
          other: number;
          cpu: number;
          bandwidth: number;
          none: number;
        };
        qualityLimitationReason: string;
        qualityLimitationResolutionChanges: number;
      };
    };
    audio: {
      bytes: number;
      mediaType: MediaType;
      timestamp: number;
    };
  };
  inbound: {
    video: {
      bytes: number;
      mediaType: MediaType;
      timestamp: number;
    };
    audio: {
      bytes: number;
      mediaType: MediaType;
      timestamp: number;
    };
  };
};

export type BitrateMetricParams = {
  deviceInfo: DeviceInfo;
} & MetricParams;
