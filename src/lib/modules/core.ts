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
  IReceiveMessageVideoAnswer,
  IReceiveMessageVideoOffer,
  IRtcSendPropsData,
  IVideoAnswerData,
  IVideoOfferData,
} from '../socketManager.types';
import { logger } from '../utils/logging';

import {
  CallErrorMessage,
  CallErrorType,
  CanvasElement,
  DeviceInfo,
  DeviceState,
  HasDevice,
  Member,
  RTCConnection,
  RTCInterface,
  RTCParams,
  StreamControllerInterface,
  UnknownResolve,
  uuid,
} from './core.types';

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

const ENTER_TIMEOUT_DEFAULT = 10;
const ANSWER_TIMEOUT_DEFAULT = 120;

export class StreamController implements StreamControllerInterface {
  value: MediaStream | null;
  list: MediaStream[];

  constructor() {
    this.value = null;
    this.list = [];
  }

  stopAllTracks(): void {
    this.list.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    this.value = null;
    this.list = [];
  }

  async initLocalMediaStream(): Promise<[MediaStream, HasDevice]> {
    try {
      const devices = await window.navigator.mediaDevices.enumerateDevices();
      const [stream, hasDevice] = await this._getStream(devices);
      const videoTracks = stream.getVideoTracks();
      const videoTrack = videoTracks[0] || {};

      if (videoTrack.readyState === 'ended') {
        const err = new Error('Ошибка инициализации камеры');
        err.name = 'StreamEnded';
        throw err;
      }

      this.value = stream;
      this.list.push(stream);
      return [stream, hasDevice];
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

  protected async _getStream(
    devices: MediaDeviceInfo[]
  ): Promise<[MediaStream, HasDevice]> {
    const cams = devices.filter((device) => device.kind === 'videoinput');
    const mics = devices.filter((device) => device.kind === 'audioinput');

    const TIMEOUT_SECOND = 30;
    const hasMicrophone = mics.length > 0;
    const hasCamera = cams.length > 0;
    const hasDevice = { hasCamera, hasMicrophone };

    const mediaStream = this._createMediaStream(hasDevice);
    const mediaStreamError: Promise<[MediaStream, HasDevice]> = new Promise(
      (_, reject) => {
        setTimeout(() => {
          const errorMessage = `Не удалось инициировать медиа-устройства в течении ${TIMEOUT_SECOND} секунд`;
          const err = new Error(errorMessage);
          err.name = 'Timeout';
          reject(err);
        }, TIMEOUT_SECOND * 1000);
      }
    );

    return Promise.race([mediaStream, mediaStreamError]);
  }

  protected async _createMediaStream(
    hasDevice: HasDevice
  ): Promise<[MediaStream, HasDevice]> {
    let stream: MediaStream;
    const { hasCamera, hasMicrophone } = hasDevice;
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

    return [stream, hasDevice];
  }

  protected _makeFakeStream(): MediaStream {
    const canvas = window.document.createElement('canvas') as CanvasElement;
    //https://bugzilla.mozilla.org/show_bug.cgi?id=1388974
    canvas.getContext('2d');

    const core = () => {
      return canvas.captureStream();
    };

    this._makeFakeStream = core;

    return core();
  }
}

export class RTCCore implements RTCInterface {
  connectionConfig: RTCConfiguration = {};
  emitter: EventsEmitter;
  params: RTCParams;
  connection: RTCConnection | null;
  socketMessenger: SocketMessenger;
  hasEntered: boolean;
  hasAnswered: boolean;
  deviceInfo: DeviceInfo;
  isDoctor: boolean;
  streams: StreamController;

  protected readonly _enterTimeoutSecond: number;
  protected _enteringTimeout: NodeJS.Timeout | null;
  protected _enterResolve: UnknownResolve;
  protected readonly _answerTimeoutSecond: number;
  protected _answerTimeout: NodeJS.Timeout | null;
  protected _answerResolve: UnknownResolve;

  constructor(params: RTCParams, connectionConfig?: RTCConfiguration) {
    this.connectionConfig = connectionConfig || {};
    this.emitter = new EventsEmitter();
    this.streams = new StreamController();
    this.params = params;
    this.connection = null;
    this.deviceInfo = {
      hasCamera: false,
      hasMicrophone: false,
      isHidden: false,
      isMute: false,
    };
    this.isDoctor = false;

    this._answerTimeout = null;
    this._answerTimeoutSecond =
      params.answerTimeoutSecond || ANSWER_TIMEOUT_DEFAULT;
    this.hasAnswered = false;
    this._enterResolve = () => undefined;

    this.socketMessenger = new SocketMessenger(params);

    this._enterTimeoutSecond =
      params.enterTimeoutSecond || ENTER_TIMEOUT_DEFAULT;
    this._enteringTimeout = null;
    this.hasEntered = false;
    this._answerResolve = () => undefined;
  }

  async call(): Promise<MediaStream> {
    const [stream, hasDevice] = await this.streams.initLocalMediaStream();
    this.deviceInfo = { ...this.deviceInfo, ...hasDevice };
    if (this.isDoctor) {
      await this._sendAvailableEvent(true);
    }

    const promiseList = [this._enterProcess()];
    if (this.isDoctor) {
      promiseList.push(this._setAnswerTimeout());
    }

    await Promise.all(promiseList);
    return stream;
  }

  changeDeviceState(deviceState: DeviceState): void {
    const { value: mediaStream } = this.streams;
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

  async socketMessageHandler(
    message:
      | IMessageEnter
      | IReceiveMessageRtcSendProps
      | IReceiveMessageVideoOffer
      | IReceiveMessageVideoAnswer
      | IReceiveMessageNewIceCandidate
      | IReceiveMessageHangup
  ): Promise<void> {
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
        if (!this.isDoctor) break;
        if (this._answerTimeout) {
          clearTimeout(this._answerTimeout);
          this._answerTimeout = null;
          this._answerResolve();
        }

        this.hasAnswered = true;
        await this._videoOfferMessageHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.VIDEO_ANSWER:
        if (this.isDoctor) break;
        await this._videoAnswerMessageHandler(message.data);
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

  async hangUp() {
    this.streams.stopAllTracks();
    const message = this.socketMessenger.createPublishMessage(
      SOCKET_MESSAGES_EVENT_LIST.HANG_UP
    );
    await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.HANG_UP, message);
    await this.destroy();

    if (this.isDoctor) {
      await this._sendAvailableEvent(false);
    }
  }

  async destroy(): Promise<void> {
    if (this.connection) await this._closeConnection();

    this._enteringTimeout && clearTimeout(this._enteringTimeout);
    this._answerTimeout && clearTimeout(this._answerTimeout);
  }

  protected _setEntiringTimeout(): Promise<unknown> {
    if (this._enteringTimeout) clearTimeout(this._enteringTimeout);

    const enterPromise = new Promise((resolve, reject) => {
      this._enterResolve = resolve;
      this._enteringTimeout = setTimeout(
        () => reject(new CallError('Failed entering', 'enter')),
        this._enterTimeoutSecond * 1000
      );
    });

    return enterPromise;
  }

  protected async _enterProcess(): Promise<unknown> {
    // Отправляем событие отправки запроса на вход в комнату
    const enterMessage = this.socketMessenger.createPublishMessage(
      SOCKET_MESSAGES_EVENT_LIST.ENTER
    );
    await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.ENTER, enterMessage);

    // Устанавливаем таймаут на вхождение в комнату
    return this._setEntiringTimeout();
  }

  protected _setAnswerTimeout(): Promise<unknown> {
    if (this._answerTimeout) clearTimeout(this._answerTimeout);

    const answerPromise = new Promise((resolve, reject) => {
      this._answerResolve = resolve;
      this._answerTimeout = setTimeout(
        () => reject(new CallError('Failed answer', 'answer')),
        this._answerTimeoutSecond * 1000
      );
    });

    return answerPromise;
  }

  protected async _sendAvailableEvent(status: boolean): Promise<void> {
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

  protected async _getMediaStream(): Promise<MediaStream> {
    const { value: mediaStream } = this.streams;
    if (mediaStream) return mediaStream;
    else {
      const [stream, hasDevice] = await this.streams.initLocalMediaStream();
      this.deviceInfo = { ...this.deviceInfo, ...hasDevice };
      return stream;
    }
  }

  protected async _closeConnection(): Promise<void> {
    if (!this.connection) return;

    const connection = this.connection;
    this.connection = null;
    connection.isClosing = true;

    await this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_CLOSE, connection);
    connection.close();
  }

  protected async _createPeerConnection(
    connectionId: uuid
  ): Promise<RTCConnection> {
    // Если существует такое-же подключение, то пересоздаем его
    if (this.connection) await this._closeConnection();

    const connection = new RTCPeerConnection(
      this.connectionConfig
    ) as RTCConnection;
    this.connection = connection;

    connection.connectionId = connectionId;
    connection.isInviter = this.isDoctor;
    connection.isClosing = false;
    connection.iceCandidatesQueue = [];

    connection.onnegotiationneeded = () => this._negotiationNeededHandler();
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

  protected async _connectMember({ clientId, connectionId, name }: Member) {
    const connection = await this._createPeerConnection(connectionId);
    connection.clientId = clientId;
    connection.name = name;
    const stream = await this._getMediaStream();
    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });
  }

  protected async _createOffer() {
    const { connection } = this;
    if (!connection) return;

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    const message = this.socketMessenger.createTransientMessage(
      connection.connectionId,
      {
        type: SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER,
        sdp: connection.localDescription,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER, message);
  }

  protected _sendMyProps() {
    const message = this.socketMessenger.createTransientMessage(
      this.connection && this.connection.connectionId,
      {
        type: SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS,
        ...this.deviceInfo,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS, message).then();
  }

  protected async _enterRoomHandler(data: EnterData): Promise<void> {
    const {
      iceservers,
      sender: { connectionId, clientId },
    } = data;

    this.connectionConfig.iceServers = iceservers;
    this.params.connectionId = connectionId;
    this.params.name = this.params.clientId;

    if (!this.isDoctor) {
      const params = {
        clientId,
        connectionId: '',
        name: this.params.name,
      };
      await this._connectMember(params);
    }
  }

  protected _videoAnswerMessageHandler(data: IVideoAnswerData) {
    const { connection } = this;
    if (!connection) return;
    connection.connectionId = data.sender.connectionId;
    const description = new RTCSessionDescription(data.sdp);
    connection.setRemoteDescription(description);
    connection.iceCandidatesQueue.forEach((candidate) =>
      connection.addIceCandidate(candidate)
    );
  }

  protected async _videoOfferMessageHandler(
    data: IVideoOfferData
  ): Promise<void> {
    if (this.connection) await this._closeConnection();

    const connection = await this._createPeerConnection(
      data.sender.connectionId
    );
    connection.clientId = data.sender.clientId;
    connection.name = data.sender.clientId;
    const stream = await this._getMediaStream();

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
    }
  }

  protected _newICECandidateMessageHandler(data: any) {
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

  protected async _hangUpMessageHandler(): Promise<void> {
    await this.emitter.emit(EVENT_LIST.HANG_UP);
  }

  protected async _rtcRespondentPropsMessageHandler(data: IRtcSendPropsData) {
    await this.emitter.emit(EVENT_LIST.RTC_RESPONDENT_PROPS, data);
  }

  /**
   * Обработчики события icecandidate
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate
   * @param event {RTCPeerConnectionIceEvent}
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @protected
   */
  protected _iceCandidateEventHandler(
    event: RTCPeerConnectionIceEvent,
    connection: RTCConnection
  ): void {
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
   * @protected
   */
  protected _iceConnectionStateChangeEventHandler(
    _: Event,
    connection: RTCConnection
  ): void {
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
   * @protected
   */
  protected _signalingStateChangeEventHandler(
    _: Event,
    connection: RTCConnection
  ): void {
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
   * @protected
   */
  protected _dataChannelEventHandler(
    event: RTCDataChannelEvent,
    connection: RTCConnection
  ): void {
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
   * @protected
   */
  protected _trackEventHandler(event: RTCTrackEvent): void {
    this.emitter
      .emit(CONNECTION_EVENT_LIST.CONNECTION_TRACK, event.streams[0])
      .then();

    this._sendMyProps();
  }

  /** Обработчик согласования сеанса на клиентской стороне.
   *
   * !!! не реализовывать на стороне инициатора !!!
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onnegotiationneeded
   * @returns {void}
   * @protected
   *
   */
  protected _negotiationNeededHandler(): void {
    if (this.isDoctor) return;
    this._createOffer();
  }
}
