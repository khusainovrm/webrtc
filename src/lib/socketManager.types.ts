'use strict';

import { SOCKET_MESSAGES_EVENT_LIST } from './events';
import { DeviceInfo, HasDevice } from './modules/doctor.types';

export type uuid = string;

export type IReceiveMessage<T, D> = {
  chatId: uuid;
  clientId: uuid;
  data: D;
  type: T;
  traceId: null;
};

type ISender = {
  chatId: uuid;
  clientId: uuid;
  connectionId: uuid;
};

// Socket Messages
export type ISocketPublishMessage<T> = {
  data: {
    type: T;
    sender: ISender;
    consultationId: uuid;
  };
  route: 'vcm';
};

export type ISocketTransientMessage<T, D> = {
  chatId: uuid;
  data: D;
  type: T;
  connectionIds?: uuid[];
};

export type SocketMessage = { type: string; data: any };

export type IPublishMessage<T> = {
  data: {
    type: T;
    sender: {
      chatId: uuid;
      clientId: uuid;
      connectionId: uuid;
    };
    consultationId: uuid;
  };
  route: 'vcm';
};

export type ISocketMessenger = {
  createPublishMessage<K extends SOCKET_MESSAGES_EVENT_LIST>(
    type: K
  ): IPublishMessage<K>;
  createTransientMessage(
    connectionId: string | null,
    data: any
  ): TransientMessage;
};

// Strings
export type RtcSendPropsString = 'rtc-send-props';
export type EnterString = 'enter';
export type RtcAvailableEventString = 'rtc-available-event';
export type VideoOfferString = 'video-offer';
export type NewIceCandidateString = 'new-ice-candidate';
export type HangupString = 'hangup';

// Data
export type EnterData = {
  sender: ISender;
  visitortype: number;
  iceservers: RTCIceServer[];
};

export type IRtcSendPropsData = DeviceInfo & {
  type: RtcSendPropsString;
  isRtcSupport: boolean;
  sender: ISender;
};

export type IRtcAvailableEventData = {
  type: RtcAvailableEventString;
  isRespondentAvailable: boolean;
  consultationId: uuid;
  callType: 'video' | 'audio';
  doctor: {
    fullName: string;
    specialityName: string;
    avatarId: string | null;
  };
};

export type IVideoOfferData = HasDevice & {
  type: VideoOfferString;
  isRtcSupport: boolean;
  sdp: {
    sdp: string;
    type: 'offer';
  };
  sender: ISender;
};

export type INewIceCandidateData = HasDevice & {
  isRtcSupport: boolean;
  type: NewIceCandidateString;
  sdp: {
    candidate: string;
    sdpMid: string;
    sdpMLineIndex: number;
  };
  sender: ISender;
};

export type IHangupData = {
  sender: ISender;
};

// Messages
export type IMessageEnter = IReceiveMessage<EnterString, EnterData>;

export type IReceiveMessageRtcSendProps = IReceiveMessage<
  RtcSendPropsString,
  IRtcSendPropsData
>;
export type ITransmitMessageRtcAvailableEvent = ISocketTransientMessage<
  RtcAvailableEventString,
  IRtcAvailableEventData
>;
export type IReceiveMessageVideoOffer = IReceiveMessage<
  VideoOfferString,
  IVideoOfferData
>;
export type IReceiveMessageNewIceCandidate = IReceiveMessage<
  NewIceCandidateString,
  INewIceCandidateData
>;
export type IReceiveMessageHangup = IReceiveMessage<HangupString, IHangupData>;

export type TransientMessage = {
  type: string;
  chatId: string;
  data: {
    sender: {
      chatId: string;
      clientId: string;
      connectionId: string;
    };
    consultationId: string;
  };
  connectionIds?: string[];
};
