import { DeviceInfo } from '../../modules/core.types';

import { BitrateMetricParams, MetricTypesEnum, Stats } from './types';

import { BaseMetric } from '.';

type ProcessedBoundRtpData = ReturnType<BitrateMetric['_getBoundRtpData']>;
type BoundRtpData = {
  out: ProcessedBoundRtpData;
  in: ProcessedBoundRtpData;
};
type Bitrate = ReturnType<BitrateMetric['_collectBitrate']>;
type AvailableOutgoingBitrate = ReturnType<
  BitrateMetric['_getAvailableOutgoingBitrate']
>;
export class BitrateMetric extends BaseMetric {
  prevStats: BoundRtpData | null;
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
    type ProcessedBoundRtpAudio = ReturnType<typeof getData>;
    type ProcessedBoundRtpVideo = ProcessedBoundRtpAudio & {
      qualityLimitation?: ReturnType<typeof getQualityLimitationData>;
      resolutions?: ReturnType<typeof getResolution>;
    };

    const isOut = type === 'out';
    const boundRtpList = stats[isOut ? 'outbound-rtp' : 'inbound-rtp'];

    const findByMedia = (list: Array<any>, mediaType: 'audio' | 'video') =>
      list.find((l) => l.mediaType === mediaType);

    const getData = (dataRaw: ReturnType<typeof findByMedia>) => ({
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

    const getResolution = (dataRaw: any) => {
      const resolutions = {
        frameHeight: null,
        frameWidth: null,
        framesPerSecond: null,
      };

      resolutions.frameHeight = dataRaw?.frameHeight;
      resolutions.frameWidth = dataRaw?.frameWidth;
      resolutions.framesPerSecond = dataRaw?.framesPerSecond;

      return resolutions;
    };

    const boundRtpVideo = findByMedia(boundRtpList, 'video');
    const boundRtpAudio = findByMedia(boundRtpList, 'audio');

    const audio: ProcessedBoundRtpAudio = getData(boundRtpAudio);
    const video: ProcessedBoundRtpVideo = getData(boundRtpVideo);

    if (isOut) {
      video.qualityLimitation = getQualityLimitationData(boundRtpVideo);
      video.resolutions = getResolution(boundRtpVideo);
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

  protected _collectBitrate(prevStats: BoundRtpData, newStats: BoundRtpData) {
    return {
      out: {
        video: this._calcBitrate(prevStats.out.video, newStats.out.video),
        audio: this._calcBitrate(prevStats.out.audio, newStats.out.audio),
      },
      in: {
        video: this._calcBitrate(prevStats.in.video, newStats.in.video),
        audio: this._calcBitrate(prevStats.in.audio, newStats.in.audio),
      },
    };
  }

  protected _collectMetric(
    bitrate: Bitrate,
    newStats: BoundRtpData,
    availableOutgoingBitrate: AvailableOutgoingBitrate
  ) {
    return {
      info: this._info,
      effectiveType: (navigator?.connection as any).effectiveType,
      availableOutgoingBitrate,
      qualityLimitation: newStats.out.video.qualityLimitation,
      deviceInfo: this.deviceInfo,
      bitrate,
      resolutions: newStats.out.video.resolutions,
    };
  }

  public async handler(): Promise<void> {
    const rawStats = await this._getStats();

    const newStats: BoundRtpData = {
      out: this._getBoundRtpData(rawStats, 'out'),
      in: this._getBoundRtpData(rawStats, 'in'),
    };

    if (this.prevStats) {
      const bitrateData = this._collectBitrate(this.prevStats, newStats);
      const availableOutgoingBitrate =
        this._getAvailableOutgoingBitrate(rawStats);
      const metric = this._collectMetric(
        bitrateData,
        newStats,
        availableOutgoingBitrate
      );
      this._sendMetric('budu-webrtc-bitrate', metric);
    }

    this.prevStats = newStats;
  }
}
