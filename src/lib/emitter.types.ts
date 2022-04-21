'use strict';

import {
  CONNECTION_EVENT_LIST,
  EVENT_LIST,
  SOCKET_MESSAGES_EVENT_LIST,
} from './events';
import { RTCConnection } from './modules/core.types';
import {
  IPublishMessage,
  IRtcSendPropsData,
  TransientMessage,
} from './socketManager.types';

export type EventList =
  | EVENT_LIST
  | SOCKET_MESSAGES_EVENT_LIST
  | CONNECTION_EVENT_LIST;

export enum EMIT_TYPE_LIST {
  EVENT = 'event',
  ERROR = 'error',
}

// DataEvents
export type AllEventData = any;
export type ConnectionCloseEventData = RTCConnection;
export type ConnectionNewEventData = RTCConnection;
export type ConnectionIceStateEventData = RTCConnection;
export type ConnectionTrackEventData = MediaStream;
export type HangUpReceiveEventData = void;
export type RtcRespondentPropsEventData = IRtcSendPropsData;
export type SendMetricEventData = {
  type: string;
  data: any;
  timestamp: number;
};

export type SocketEnterEventData =
  IPublishMessage<SOCKET_MESSAGES_EVENT_LIST.ENTER>;
export type GetVisitorsEventData =
  IPublishMessage<SOCKET_MESSAGES_EVENT_LIST.GET_VISITORS>;
export type ActivvisitorsEventData = void;
export type IceCandidateUpdateEventData = TransientMessage;
export type AvailableEventEventData = TransientMessage;
export type SendPropsEventData = TransientMessage;
export type VideoAnswerEventData = TransientMessage;
export type VideoOfferEventData = TransientMessage;
export type NewIceCandidateEventData = void;
export type HangUpEventData =
  IPublishMessage<SOCKET_MESSAGES_EVENT_LIST.HANG_UP>;

export type IEvent<T, P> = {
  emitType: EMIT_TYPE_LIST;
  eventType: T;
  payload: P;
};
export type AnyEvent = IEvent<string, any>;
export type EventCallback<T> = (event: T) => void;
export type AnyCallback = EventCallback<AnyEvent>;

// Maps
export type EventDataMap = {
  [EVENT_LIST.ALL]: AllEventData;
  [EVENT_LIST.HANG_UP]: HangUpReceiveEventData;
  [EVENT_LIST.RTC_RESPONDENT_PROPS]: RtcRespondentPropsEventData;
  [EVENT_LIST.SEND_METRIC]: SendMetricEventData;

  [CONNECTION_EVENT_LIST.CONNECTION_CLOSE]: ConnectionCloseEventData;
  [CONNECTION_EVENT_LIST.CONNECTION_NEW]: ConnectionNewEventData;
  [CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE]: ConnectionIceStateEventData;
  [CONNECTION_EVENT_LIST.CONNECTION_TRACK]: ConnectionTrackEventData;

  [SOCKET_MESSAGES_EVENT_LIST.ENTER]: SocketEnterEventData;
  [SOCKET_MESSAGES_EVENT_LIST.GET_VISITORS]: GetVisitorsEventData;
  [SOCKET_MESSAGES_EVENT_LIST.ACTIVVISITORS]: ActivvisitorsEventData;
  [SOCKET_MESSAGES_EVENT_LIST.ICE_CANDIDATE_UPDATE]: IceCandidateUpdateEventData;
  [SOCKET_MESSAGES_EVENT_LIST.AVAILABLE_EVENT]: AvailableEventEventData;
  [SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS]: SendPropsEventData;
  [SOCKET_MESSAGES_EVENT_LIST.VIDEO_ANSWER]: VideoAnswerEventData;
  [SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER]: VideoOfferEventData;
  [SOCKET_MESSAGES_EVENT_LIST.NEW_ICE_CANDIDATE]: NewIceCandidateEventData;
  [SOCKET_MESSAGES_EVENT_LIST.HANG_UP]: HangUpEventData;
};

export type EventMap = {
  [K in keyof EventDataMap]: IEvent<K, EventDataMap[K]>;
};

export type EventCallbackMap = {
  [K in keyof EventMap]: K extends EVENT_LIST.ALL
    ? AnyCallback
    : EventCallback<EventMap[K]>;
};

// Interfaces of classes
export type EventsDict = {
  [K in keyof EventCallbackMap]: Array<EventCallbackMap[K]>;
};

export interface IEventsEmitter {
  events: EventsDict;

  on<K extends keyof EventCallbackMap>(
    event: K,
    callback: EventCallbackMap[K]
  ): void;

  off<K extends keyof EventCallbackMap>(
    event: K,
    callback: EventCallbackMap[K]
  ): void;

  emit<K extends keyof EventMap>(
    eventType: K,
    payload?: EventDataMap[K],
    emitType?: EMIT_TYPE_LIST
  ): Promise<void>;
}
