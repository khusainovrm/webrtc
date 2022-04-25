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

export type BitrateMetricParams = {
  deviceInfo: DeviceInfo;
} & MetricParams;
