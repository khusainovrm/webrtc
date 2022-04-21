export enum SOCKET_MESSAGES_EVENT_LIST {
  ENTER = 'enter',
  GET_VISITORS = 'getvisitors',
  ACTIVVISITORS = 'activvisitors',
  ICE_CANDIDATE_UPDATE = 'iceCandidateUpdate',
  AVAILABLE_EVENT = 'availableEvent',
  SEND_PROPS = 'rtc-send-props',
  VIDEO_OFFER = 'video-offer',
  VIDEO_ANSWER = 'video-answer',
  NEW_ICE_CANDIDATE = 'new-ice-candidate',
  HANG_UP = 'hangup',
}

export enum CONNECTION_EVENT_LIST {
  CONNECTION_CLOSE = 'connectionCloseEvent',
  CONNECTION_NEW = 'connectionNewEvent',
  CONNECTION_ICE_STATE = 'connectionIceStateEvent',
  CONNECTION_TRACK = 'connectionTrackEvent',
}

export enum EVENT_LIST {
  ALL = 'allEvent',
  HANG_UP = 'hangUpReceiveEvent',
  RTC_RESPONDENT_PROPS = 'rtcRespondentPropsEvent',
  SEND_METRIC = 'sendMetricEvent',
}

export default {
  SOCKET_MESSAGES_EVENT_LIST,
  CONNECTION_EVENT_LIST,
  EVENT_LIST,
};
