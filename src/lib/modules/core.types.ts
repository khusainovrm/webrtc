'use strict';

import { IEventsEmitter } from '../emitter.types';
import { ISocketMessenger, SocketMessage } from '../socketManager.types';

export type uuid = string;

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

export type RTCParams = {
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
};

export interface RTCCoreInterface {
  connectionConfig: RTCConfiguration;
  emitter: IEventsEmitter;
  params: RTCParams;
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

export interface StreamControllerInterface {
  value: MediaStream | null;
  list: MediaStream[];
  stopAllTracks(): void;
  initLocalMediaStream(): Promise<[MediaStream, HasDevice]>;
}

export interface RTCInterface {
  connectionConfig: RTCConfiguration;
  emitter: IEventsEmitter;
  streams: StreamControllerInterface;
  params: RTCParams;
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
