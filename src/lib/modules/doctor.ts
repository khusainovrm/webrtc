'use strict';

import { EventsEmitter } from '../emitter';
import {
  CONNECTION_EVENT_LIST,
  EVENT_LIST,
  SOCKET_MESSAGES_EVENT_LIST,
} from '../events';
import { SocketMessenger } from '../socketManager';
import {
  EnterData,
  IMessageEnter,
  IReceiveMessageHangup,
  IReceiveMessageNewIceCandidate,
  IReceiveMessageRtcSendProps,
  IReceiveMessageVideoOffer,
  IRtcSendPropsData,
  IVideoOfferData,
} from '../socketManager.types';
import { logger } from '../utils/logging';

import {
  CallErrorMessage,
  CallErrorType,
  CanvasElement,
  DeviceInfo,
  DeviceState,
  IRTCDoctor,
  IRTCDoctorParams,
  Member,
  NewConnection,
  RTCConnection,
  UnknownResolve,
} from './doctor.types';

const ENTER_TIMEOUT_DEFAULT = 10;
const ANSWER_TIMEOUT_DEFAULT = 120;

export class CallError extends Error implements CallErrorType {
  name: string;
  message: string;
  type: CallErrorMessage;
  stack?: string | undefined;
  description?: string | null;

  constructor(message: string, type: CallErrorMessage) {
    super(message);
    this.type = type;
    this.message = message;
    this.name = 'CallError';
    this.description = null;
  }
}
export class RTCDoctor implements IRTCDoctor {
  connectionConfig: RTCConfiguration = {};
  emitter: EventsEmitter;
  params: IRTCDoctorParams;
  mediaStream: MediaStream | null;
  allMediaStreams: MediaStream[];
  connection: RTCConnection | null;
  socketMessenger: SocketMessenger;
  hasEntered: boolean;
  hasAnswered: boolean;
  deviceInfo: DeviceInfo;

  private readonly _enterTimeoutSecond: number;
  private _enteringTimeout: NodeJS.Timeout | null;
  private _enterResolve: UnknownResolve;
  private readonly _answerTimeoutSecond: number;
  private _answerTimeout: NodeJS.Timeout | null;
  private _answerResolve: UnknownResolve;

  /**
   * @constructor
   * @param params {Object}
   * @param connectionConfig
   */
  constructor(params: IRTCDoctorParams, connectionConfig?: RTCConfiguration) {
    this.connectionConfig = connectionConfig || {};
    this.emitter = new EventsEmitter();
    this.params = params;
    this.mediaStream = null;
    this.allMediaStreams = [];
    this.connection = null;
    this.deviceInfo = {
      hasCamera: false,
      hasMicrophone: false,
      isHidden: false,
      isMute: false,
    };

    // Answer
    this._answerTimeout = null;
    this._answerTimeoutSecond =
      params.answerTimeoutSecond || ANSWER_TIMEOUT_DEFAULT;
    this.hasAnswered = false;
    this._enterResolve = () => undefined;

    // Socket
    this.socketMessenger = new SocketMessenger(params);

    // Enter
    this._enterTimeoutSecond =
      params.enterTimeoutSecond || ENTER_TIMEOUT_DEFAULT;
    this._enteringTimeout = null;
    this.hasEntered = false;
    this._answerResolve = () => undefined;
  }

  changeDeviceState(deviceState: DeviceState): void {
    const { mediaStream } = this;
    this.deviceInfo = { ...this.deviceInfo, ...deviceState };

    if (mediaStream) {
      mediaStream
        .getAudioTracks()
        .forEach((audioTrack) => (audioTrack.enabled = !deviceState.isMute));
      mediaStream
        .getVideoTracks()
        .forEach((videoTrack) => (videoTrack.enabled = !deviceState.isHidden));
    }

    this._sendMyProps();
  }

  async call(): Promise<MediaStream> {
    await this._initLocalMediaStream();
    await this._sendAvailableEvent(true);

    const enterMessage = this.socketMessenger.createPublishMessage(
      SOCKET_MESSAGES_EVENT_LIST.ENTER
    );
    await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.ENTER, enterMessage);

    if (this._enteringTimeout) clearTimeout(this._enteringTimeout);
    const enterPromise = new Promise((resolve, reject) => {
      this._enterResolve = resolve;
      this._enteringTimeout = setTimeout(
        () => reject(new CallError('Failed entering', 'enter')),
        this._enterTimeoutSecond * 1000
      );
    });

    if (this._answerTimeout) clearTimeout(this._answerTimeout);
    const answerPromise = new Promise((resolve, reject) => {
      this._answerResolve = resolve;
      this._answerTimeout = setTimeout(
        () => reject(new CallError('Failed answer', 'answer')),
        this._answerTimeoutSecond * 1000
      );
    });

    return Promise.all([enterPromise, answerPromise]).then(() =>
      this._getMediaStream()
    );
  }

  /**
   * Отправка системного сообщение о готовности подключения
   * @param status {Boolean} доступен ли респондент
   * @returns {Promise<void>}
   */
  private async _sendAvailableEvent(status: boolean) {
    const { doctor } = this.params;
    const message = this.socketMessenger.createTransientMessage(null, {
      type: 'rtc-available-event',
      isRespondentAvailable: status,
      consultationId: this.params.consultationId,
      callType: this.params.isAudio ? 'audio' : 'video',
      doctor,
    });
    await this.emitter.emit(
      SOCKET_MESSAGES_EVENT_LIST.AVAILABLE_EVENT,
      message
    );
  }

  /**
   * Получить текущий медиа стрим
   * @returns {MediaStream}
   */
  private _getMediaStream() {
    const stream = this.mediaStream as MediaStream;
    this.allMediaStreams.push(stream);
    return stream;
  }

  /**
   * Закрытие соединения
   * @returns {Promise<void>}
   */
  private async _closeConnection() {
    if (!this.connection) return;

    const connection = this.connection;
    this.connection = null;
    connection.isClosing = true;

    await this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_CLOSE, connection);
    connection.close();
  }

  /**
   * Создание RTC соединения
   * @param clientId {String} uuid клиента
   * @param connectionId {String} uuid соединения
   * @param isInviter {Boolean} Флаг приглашающий
   * @returns {Promise<RTCPeerConnection>}
   */
  private async _createPeerConnection({
    connectionId,
    isInviter,
  }: NewConnection) {
    // Если существует такое-же подключение, то пересоздаем его
    if (this.connection) await this._closeConnection();

    const connection = new RTCPeerConnection(
      this.connectionConfig
    ) as RTCConnection;
    this.connection = connection;

    connection.connectionId = connectionId;
    connection.isInviter = isInviter;
    connection.isClosing = false;
    connection.iceCandidatesQueue = [];

    connection.onicecandidate = (event) =>
      this._iceCandidateEventHandler(event, connection);
    connection.oniceconnectionstatechange = (event) =>
      this._iceConnectionStateChangeEventHandler(event, connection);
    connection.onsignalingstatechange = (event) =>
      this._signalingStateChangeEventHandler(event, connection);
    connection.ondatachannel = (event) =>
      this._dataChannelEventHandler(event, connection);
    connection.ontrack = (event) => this._trackEventHandler(event);

    await this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_NEW, connection);
    return connection;
  }

  /**
   * Создание соединения для кандидата
   * @param clientId {String} uuid клиента
   * @param connectionId {String} uuid соединения
   * @param name {String} uuid клиента
   */
  private async _connectMember({ clientId, connectionId, name }: Member) {
    const connection = await this._createPeerConnection({
      connectionId,
      isInviter: true,
    });
    connection.clientId = clientId;
    connection.name = name;
    const stream = this._getMediaStream();
    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });
  }

  /**
   * Обработка серверных сообщений
   * @param message {{
   *   chatId: String,
   *   clientId: String,
   *   data: Object,
   *   type: String,
   *   traceId: null
   * }}
   * @returns {Promise<void>}
   */
  async socketMessageHandler(
    message:
      | IMessageEnter
      | IReceiveMessageRtcSendProps
      | IReceiveMessageVideoOffer
      | IReceiveMessageNewIceCandidate
      | IReceiveMessageHangup
  ) {
    if (
      Object.values(SOCKET_MESSAGES_EVENT_LIST).includes(
        message.type as SOCKET_MESSAGES_EVENT_LIST
      )
    ) {
      logger.log({
        direction: 'in',
        event: message.type,
        payload: message.data,
      });
    }

    switch (message.type) {
      case SOCKET_MESSAGES_EVENT_LIST.ENTER:
        if (!this._enteringTimeout) break;

        clearTimeout(this._enteringTimeout);
        this._enteringTimeout = null;
        this.hasEntered = true;
        this._enterResolve();

        await this._enterRoomHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER:
        if (this._answerTimeout) {
          clearTimeout(this._answerTimeout);
          this._answerTimeout = null;
          this._answerResolve();
        }

        this.hasAnswered = true;
        await this._videoOfferMessageHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS:
        await this._rtcRespondentPropsMessageHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.NEW_ICE_CANDIDATE:
        this._newICECandidateMessageHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.HANG_UP:
        await this._hangUpMessageHandler();
        break;
    }
  }

  /** Инициирует отправку props */
  private _sendMyProps() {
    const message = this.socketMessenger.createTransientMessage(
      this.connection && this.connection.connectionId,
      {
        type: SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS,
        ...this.deviceInfo,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS, message).then();
  }

  async hangUp() {
    this.allMediaStreams.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    this.mediaStream = null;
    this.allMediaStreams = [];
    const message = this.socketMessenger.createPublishMessage(
      SOCKET_MESSAGES_EVENT_LIST.HANG_UP
    );
    await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.HANG_UP, message);
    await this.destroy();
    await this._sendAvailableEvent(false);
  }

  /**
   * Закрытие всех соединений
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this.connection) await this._closeConnection();

    this._enteringTimeout && clearTimeout(this._enteringTimeout);
    this._answerTimeout && clearTimeout(this._answerTimeout);
  }

  // Private
  /**
   * Инициализация media stream
   * @returns {Promise<void>}
   * @private
   */
  private async _initLocalMediaStream(): Promise<MediaStream> {
    try {
      const devices = await window.navigator.mediaDevices.enumerateDevices();
      const stream = await this._getStream(devices);
      const videoTracks = stream.getVideoTracks();
      const videoTrack = videoTracks[0] || {};

      if (videoTrack.readyState === 'ended') {
        const err = new Error('Ошибка инициализации камеры');
        err.name = 'StreamEnded';
        throw err;
      }

      this.mediaStream = stream;
      this.allMediaStreams.push(stream);
      return stream;
    } catch (error: any) {
      const errorMessage = 'Ошибка медиаустройств: ' + (error.message || error);
      const streamError = new CallError(errorMessage, 'streamError');

      switch (error.name) {
        case 'NotFoundError':
          streamError.description = 'Камера и/или микрофон не найдены';
          break;
        case 'SecurityError':
          streamError.description =
            'Ошибка безопасности медиаустройства (камеры и/или микрофона)';
          break;
        case 'PermissionDeniedError':
          streamError.description = 'Запрет доступа к камере и/или микрофону';
          break;
      }

      throw streamError;
    }
  }

  /**
   *
   * @param devices {MediaDeviceInfo[]}
   * @returns {Promise<MediaStream>}
   * @private
   */
  private async _getStream(devices: MediaDeviceInfo[]) {
    const cams = devices.filter((device) => device.kind === 'videoinput');
    const mics = devices.filter((device) => device.kind === 'audioinput');

    const TIMEOUT_SECOND = 30;
    const hasMicrophone = mics.length > 0;
    const hasCamera = cams.length > 0;
    this.deviceInfo = { ...this.deviceInfo, hasCamera, hasMicrophone };

    const mediaStream = this._createMediaStream(hasCamera, hasMicrophone);
    const mediaStreamError: Promise<MediaStream> = new Promise((_, reject) => {
      setTimeout(() => {
        const errorMessage = `Не удалось инициировать медиа-устройства в течении ${TIMEOUT_SECOND} секунд`;
        const err = new Error(errorMessage);
        err.name = 'Timeout';
        reject(err);
      }, TIMEOUT_SECOND * 1000);
    });

    return Promise.race([mediaStream, mediaStreamError]);
  }

  /**
   * Make and get media steam
   * @returns {Promise<MediaStream>} media stream
   * @private
   */
  private async _createMediaStream(hasCamera: boolean, hasMicrophone: boolean) {
    let stream: MediaStream;
    const hasInterface = hasCamera || hasMicrophone;

    if (hasInterface) {
      stream = await window.navigator.mediaDevices.getUserMedia({
        video: hasCamera,
        audio: hasMicrophone,
      });
    } else {
      stream = this._makeFakeStream();
    }

    if (stream.getVideoTracks().length === 0) {
      const fake = this._makeFakeStream();
      stream.addTrack(fake.getVideoTracks()[0]);
    }

    return stream;
  }

  /**
   * Make and get fake media steam
   * @returns {MediaStream} fake media stream
   * @private
   */
  private _makeFakeStream() {
    const canvas = window.document.createElement('canvas') as CanvasElement;
    //https://bugzilla.mozilla.org/show_bug.cgi?id=1388974
    canvas.getContext('2d');

    const core = () => {
      return canvas.captureStream();
    };

    this._makeFakeStream = core;

    return core();
  }

  /**
   * Обработка события enter
   * @param data {EnterData}
   * @returns {Promise<void>}
   * @private
   */
  private async _enterRoomHandler(data: EnterData) {
    this.connectionConfig.iceServers = data.iceservers;
    this.params.connectionId = data.sender.connectionId;
    this.params.name = this.params.clientId;
  }

  /**
   * Обработчики события icecandidate
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate
   * @param event {RTCPeerConnectionIceEvent}
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @private
   */
  private _iceCandidateEventHandler(
    event: RTCPeerConnectionIceEvent,
    connection: RTCConnection
  ) {
    if (!(connection && event.candidate)) return;

    const message = this.socketMessenger.createTransientMessage(
      connection.connectionId,
      {
        type: 'new-ice-candidate',
        sdp: event.candidate,
      }
    );
    this.emitter
      .emit(SOCKET_MESSAGES_EVENT_LIST.ICE_CANDIDATE_UPDATE, message)
      .then();
  }

  /**
   * Обработчики события изменения статуса ice агента
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/oniceconnectionstatechange
   * @param _
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @private
   */
  private _iceConnectionStateChangeEventHandler(
    _: Event,
    connection: RTCConnection
  ) {
    if (!connection) return;

    this.emitter
      .emit(CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE, connection)
      .then();

    switch (connection.iceConnectionState) {
      case 'closed':
      case 'disconnected':
        this.emitter.emit(EVENT_LIST.HANG_UP).then();
        this._closeConnection().then();
        break;
      case 'failed':
        this._closeConnection().then();
        //попытка повторного подключения
        if (connection.isInviter) {
          this._connectMember({
            clientId: connection.clientId,
            connectionId: connection.connectionId,
            name: connection.name,
          }).then();
        }
        break;
    }
  }

  /**
   * Обработчик события signalingState
   * @desc события при изменении signalingState однорангового соединения, что может произойти либо из-за вызова setLocalDescription (), либо из-за setRemoteDescription ().
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onsignalingstatechange
   * @param _
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @private
   */
  private _signalingStateChangeEventHandler(
    _: Event,
    connection: RTCConnection
  ) {
    switch (connection.signalingState) {
      case 'closed':
        this._closeConnection().then();
        break;
    }
  }

  /**
   * Обработчик события datachannel в RTCPeerConnection.
   * @desc Это событие типа RTCDataChannelEvent отправляется, когда RTCDataChannel добавляется к соединению удаленным одноранговым узлом, вызывающим createDataChannel().
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ondatachannel
   * @param event {RTCDataChannelEvent}
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @private
   */
  private _dataChannelEventHandler(
    event: RTCDataChannelEvent,
    connection: RTCConnection
  ) {
    if (!connection) return;

    const dataChannel = event.channel;
    dataChannel.onmessage = (message) => {
      //Получаем данные из канала от МП и тут же их отправляем обратно,
      //чтобы можно было замерить временную задержку RTC-канала на стороне МП для метрик качества связи
      dataChannel.send(message.data);
    };
  }

  /**
   * Обработчик события добавления трека в RTCPeerConnection.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/ontrack
   * @param event {RTCTrackEvent}
   * @returns {void}
   * @private
   */
  private _trackEventHandler(event: RTCTrackEvent) {
    this.emitter
      .emit(CONNECTION_EVENT_LIST.CONNECTION_TRACK, event.streams[0])
      .then();

    this._sendMyProps();
  }

  /**
   * Обработка события video-offer
   * @param data
   * @returns {Promise<void>}
   * @private
   */
  private async _videoOfferMessageHandler(data: IVideoOfferData) {
    if (this.connection) await this._closeConnection();

    const connection = await this._createPeerConnection({
      connectionId: data.sender.connectionId,
      isInviter: false,
    });
    connection.clientId = data.sender.clientId;
    connection.name = data.sender.clientId;
    connection.negotiating = true;
    const stream = this._getMediaStream();

    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });

    const desc = new RTCSessionDescription(data.sdp);
    try {
      await connection.setRemoteDescription(desc);
      //проставляем полученных ICE кандидатов из очереди, если таковые имеются
      if (connection.iceCandidatesQueue.length > 0) {
        connection.iceCandidatesQueue.forEach((candidate) => {
          connection
            .addIceCandidate(candidate)
            .catch((error) => console.error(error));
        });
      }
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      const message = this.socketMessenger.createTransientMessage(
        data.sender.connectionId,
        {
          type: SOCKET_MESSAGES_EVENT_LIST.VIDEO_ANSWER,
          sdp: connection.localDescription,
        }
      );
      await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.VIDEO_ANSWER, message);
    } catch (error) {
      console.error(error);
    } finally {
      connection.negotiating = false;
    }
  }

  /**
   * Обработка нового ICE кандидата
   * @param data {Object}
   * @private
   */
  private _newICECandidateMessageHandler(data: any) {
    const connection = this.connection;
    if (!connection) return;

    const candidate = new RTCIceCandidate(data.sdp);

    if (!connection.remoteDescription || !connection.remoteDescription.type) {
      connection.iceCandidatesQueue.push(candidate);
    } else {
      connection
        .addIceCandidate(candidate)
        .catch((error) => console.log(error));
    }
  }

  /**
   * Обработчик события Hung Up
   * @returns {Promise<void>}
   * @private
   */
  private async _hangUpMessageHandler() {
    await this.emitter.emit(EVENT_LIST.HANG_UP);
  }

  private async _rtcRespondentPropsMessageHandler(data: IRtcSendPropsData) {
    await this.emitter.emit(EVENT_LIST.RTC_RESPONDENT_PROPS, data);
  }
}

export default {
  RTCDoctor,
};
