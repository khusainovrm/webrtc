'use strict';

import { IEventsEmitter } from '../emitter.types';
import { ISocketMessenger, SocketMessage } from '../socketManager.types';

export type uuid = string;
export type CallCallback = (hasEntered: boolean) => void;

export type HasDevice = {
  hasCamera: boolean;
  hasMicrophone: boolean;
};

export type DeviceState = {
  isHidden: boolean;
  isMute: boolean;
};

export type DeviceInfo = HasDevice & DeviceState;

export type DoctorInfo = {
  avatarId: string | null;
  fullName: string;
  specialityName: string;
};

export type IRTCDoctorParams = {
  name: string;
  clientId: string;
  connectionId: string | null;
  connectionsId?: string[];
  consultationId: string;
  doctor: DoctorInfo;
  isAudio: boolean;

  enterTimeoutSecond?: number;
  answerTimeoutSecond?: number;
};

export type RTCConnection = RTCPeerConnection & {
  clientId: string;
  connectionId: string;
  name: string;
  iceCandidatesQueue: RTCIceCandidate[];
  isInviter: boolean;
  isClosing: boolean;
  negotiating: boolean;
};

export type NewConnection = {
  connectionId: uuid;
  isInviter: boolean;
};

export interface IRTCDoctor {
  connectionConfig: RTCConfiguration;
  emitter: IEventsEmitter;
  params: IRTCDoctorParams;
  mediaStream: MediaStream | null;
  allMediaStreams: MediaStream[];
  connection: RTCConnection | null;
  socketMessenger: ISocketMessenger;
  hasEntered: boolean;
  hasAnswered: boolean;

  call(): Promise<MediaStream>;

  socketMessageHandler(message: SocketMessage): Promise<void>;

  changeDeviceState(props: DeviceState): void;

  hangUp(): void;

  destroy(): void;
}

export interface CanvasElement extends HTMLCanvasElement {
  captureStream(frameRequestRate?: number): MediaStream;
}

export type Member = {
  clientId: string;
  connectionId: string;
  name: string;
};

export type UnknownResolve = (value?: unknown) => void;

export type CallErrorMessage = 'streamError' | 'enter' | 'answer';

export type CallErrorType = Error & {
  type: CallErrorMessage;
  description?: string | null;
};
