import { DeviceInfo } from '../../modules/core.types';

import {
  BitrateMetricParams,
  BitrateMetricType,
  MediaType,
  MetricTypesEnum,
  Stats,
} from './types';

import { BaseMetric } from '.';

export class BitrateMetric extends BaseMetric {
  prevStats: BitrateMetricType | null;
  deviceInfo: DeviceInfo;

  constructor(params: BitrateMetricParams) {
    super(params);
    this.type = MetricTypesEnum.BITRATE;
    this.prevStats = null;
    this.deviceInfo = params.deviceInfo;
  }

  private _calcBitrate(prev: any, curr: any) {
    const seconds = (curr.timestamp - prev.timestamp) / 1000;
    const bytes = curr.bytes - prev.bytes;
    return Math.round((bytes * 8) / seconds);
  }

  private _getBoundRtpData(stats: Stats, type: 'out' | 'in') {
    const isOut = type === 'out';
    const boundRtpList = stats[isOut ? 'outbound-rtp' : 'inbound-rtp'];

    const findByMedia = (list: Array<any>, mediaType: MediaType) =>
      list.find((l) => l.mediaType === mediaType);

    const getData = (dataRaw: any) => ({
      bytes: isOut ? dataRaw?.bytesSent : dataRaw?.bytesReceived,
      mediaType: dataRaw?.mediaType,
      timestamp: dataRaw?.timestamp,
    });

    const getQualityLimitationData = (dataRaw: any) => ({
      qualityLimitationDurations: dataRaw?.qualityLimitationDurations,
      qualityLimitationReason: dataRaw?.qualityLimitationReason,
      qualityLimitationResolutionChanges:
        dataRaw?.qualityLimitationResolutionChanges,
    });

    const boundRtpVideo = findByMedia(boundRtpList, 'video');
    const boundRtpAudio = findByMedia(boundRtpList, 'audio');

    const video = getData(boundRtpVideo);
    const audio = getData(boundRtpAudio);

    if (isOut) {
      (video as any).qualityLimitation =
        getQualityLimitationData(boundRtpVideo);
    }

    return {
      video,
      audio,
    };
  }

  private _getAvailableOutgoingBitrate(stats: Stats) {
    const candidatePair = stats['candidate-pair'][0];
    return candidatePair.availableOutgoingBitrate;
  }

  public async handler(): Promise<void> {
    const rawStats = await this._getStats();

    const stats: BitrateMetricType = {
      outbound: this._getBoundRtpData(rawStats, 'out'),
      inbound: this._getBoundRtpData(rawStats, 'in'),
    };

    if (this.prevStats) {
      const metric = {
        info: this._info,
        effectiveType: (navigator?.connection as any).effectiveType,
        availableOutgoingBitrate: this._getAvailableOutgoingBitrate(rawStats),
        qualityLimitation: stats.outbound.video.qualityLimitation,
        deviceInfo: this.deviceInfo,
        bitrate: {
          out: {
            video: this._calcBitrate(
              this.prevStats.outbound.video,
              stats.outbound.video
            ),
            audio: this._calcBitrate(
              this.prevStats.outbound.audio,
              stats.outbound.audio
            ),
          },
          in: {
            video: this._calcBitrate(
              this.prevStats.inbound.video,
              stats.inbound.video
            ),
            audio: this._calcBitrate(
              this.prevStats.inbound.audio,
              stats.inbound.audio
            ),
          },
        },
      };
    }

    this.prevStats = stats;
  }
}
