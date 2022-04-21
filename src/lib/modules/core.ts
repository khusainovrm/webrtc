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
import { BitrateMetric } from '../utils/metrics/bitrate';

import {
  CallErrorMessage,
  CallErrorType,
  CanvasElement,
  DeviceInfo,
  DeviceState,
  HasDevice,
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
  private _value: MediaStream | null;
  list: MediaStream[];

  constructor() {
    this._value = null;
    this.list = [];
  }

  public async getStream(): Promise<MediaStream> {
    if (this._value) return this._value;
    else {
      const [stream] = await this.initLocalMediaStream();
      return stream;
    }
  }

  stopAllTracks(): void {
    this.list.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    this._value = null;
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

      this._value = stream;
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

export class ProcessTimeoutController {
  readonly name: CallErrorMessage;

  private _resolve: UnknownResolve;
  private _timeout: NodeJS.Timeout | null;
  private readonly _timeoutSecond: number;

  constructor(name: CallErrorMessage, timeoutSecond: number) {
    this._timeoutSecond = timeoutSecond;
    this.name = name;
    this._timeout = null;
    this._resolve = () => undefined;
  }

  public get resolve(): UnknownResolve {
    return this._resolve;
  }

  public get timeout(): NodeJS.Timeout | null {
    return this._timeout;
  }

  setTimeout(): Promise<unknown> {
    if (this._timeout) clearTimeout(this._timeout);

    const promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._timeout = setTimeout(
        () => reject(new CallError(`Failed ${this.name}`, this.name)),
        this._timeoutSecond * 1000
      );
    });

    return promise;
  }

  clearTimeout() {
    if (!this._timeout) return;
    clearTimeout(this._timeout);
    this._timeout = null;
  }
}

class RTCCoreConnection {
  connectionConfig: RTCConfiguration;
  streams: StreamController;
  params: RTCParams;
  connection: RTCConnection | null;

  constructor(params: RTCParams, connectionConfig?: RTCConfiguration) {
    this.connectionConfig = connectionConfig || {};
    this.streams = new StreamController();
    this.params = params;
    this.connection = null;
  }

  protected async _closeConnection(): Promise<RTCConnection | null> {
    if (!this.connection) return null;

    const connection = this.connection;
    connection.metrics.forEach(
      (metric) => metric.isSubscribed && metric.unsubscribe()
    );
    this.connection = null;
    connection.isClosing = true;

    connection.close();
    return connection;
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
    connection.isClosing = false;
    connection.iceCandidatesQueue = [];
    connection.metrics = [];

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

    return connection;
  }

  protected async _connectMember(connectionId: uuid) {
    const connection = await this._createPeerConnection(connectionId);
    const stream = await this.streams.getStream();
    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });
  }

  protected async _createOffer(): Promise<RTCConnection | null> {
    const { connection } = this;
    if (!connection) return null;

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    return connection;
  }

  protected async _createAnswer(
    sdp: RTCSessionDescriptionInit
  ): Promise<RTCConnection | null> {
    const { connection } = this;
    if (!connection) return null;

    const desc = new RTCSessionDescription(sdp);
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
    return connection;
  }

  // =================================================================
  /**
   * Обработчики события icecandidate
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onicecandidate
   * @param event {RTCPeerConnectionIceEvent}
   * @param connection {RTCPeerConnection}
   * @returns {void}
   * @protected
   */
  protected _iceCandidateEventHandler(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _: RTCPeerConnectionIceEvent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    __: RTCConnection
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): void {}

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
  ): RTCConnection {
    if (!connection) return connection;

    switch (connection.iceConnectionState) {
      case 'closed':
      case 'disconnected':
        this._closeConnection();
        break;
      case 'failed':
        this._closeConnection();
        break;
    }

    return connection;
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
        this._closeConnection();
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
   * @param _event {RTCTrackEvent}
   * @returns {void}
   * @protected
   */
  protected _trackEventHandler(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _event: RTCTrackEvent
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ): void {}

  /** Обработчик согласования сеанса на клиентской стороне.
   *
   * !!! не реализовывать на стороне инициатора !!!
   * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/onnegotiationneeded
   * @returns {void}
   * @protected
   *
   */
  protected _negotiationNeededHandler(): void {
    this._createOffer();
  }
}

class RTCCoreConnectionWithEvents extends RTCCoreConnection {
  emitter: EventsEmitter;
  socketMessenger: SocketMessenger;

  constructor(params: RTCParams, connectionConfig?: RTCConfiguration) {
    super(params, connectionConfig);
    this.emitter = new EventsEmitter();
    this.socketMessenger = new SocketMessenger(params);
  }

  protected async _closeConnection(): Promise<RTCConnection | null> {
    const connection = await super._closeConnection();
    if (connection) {
      await this.emitter.emit(
        CONNECTION_EVENT_LIST.CONNECTION_CLOSE,
        connection
      );
    }
    return connection;
  }

  protected async _createPeerConnection(
    connectionId: uuid
  ): Promise<RTCConnection> {
    const connection = await super._createPeerConnection(connectionId);
    await this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_NEW, connection);
    return connection;
  }

  protected async _createOffer(): Promise<RTCConnection | null> {
    const connection = await super._createOffer();
    if (!connection) return connection;

    const message = this.socketMessenger.createTransientMessage(
      connection.connectionId,
      {
        type: SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER,
        sdp: connection.localDescription,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER, message);
    return connection;
  }

  protected _iceCandidateEventHandler(
    event: RTCPeerConnectionIceEvent,
    connection: RTCConnection
  ): void {
    super._iceCandidateEventHandler(event, connection);
    if (!(connection && event.candidate)) return;

    const message = this.socketMessenger.createTransientMessage(
      connection.connectionId,
      {
        type: 'new-ice-candidate',
        sdp: event.candidate,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.ICE_CANDIDATE_UPDATE, message);
  }

  protected _iceConnectionStateChangeEventHandler(
    event: Event,
    connection: RTCConnection
  ): RTCConnection {
    super._iceConnectionStateChangeEventHandler(event, connection);

    if (!connection) return connection;
    this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE, connection);

    if (connection.iceConnectionState === 'disconnected') {
      this.emitter.emit(EVENT_LIST.HANG_UP);
    }

    return connection;
  }

  protected _trackEventHandler(event: RTCTrackEvent): void {
    super._trackEventHandler(event);
    this.emitter.emit(CONNECTION_EVENT_LIST.CONNECTION_TRACK, event.streams[0]);
  }
}

class RTCBase extends RTCCoreConnectionWithEvents {
  deviceInfo: DeviceInfo;

  protected _answerTimeoutController: ProcessTimeoutController;
  protected _enterTimeoutController: ProcessTimeoutController;

  constructor(params: RTCParams, connectionConfig?: RTCConfiguration) {
    super(params, connectionConfig);
    this.deviceInfo = {
      hasCamera: false,
      hasMicrophone: false,
      isHidden: false,
      isMute: false,
    };

    this._enterTimeoutController = new ProcessTimeoutController(
      'enter',
      params.enterTimeoutSecond || ENTER_TIMEOUT_DEFAULT
    );
    this._answerTimeoutController = new ProcessTimeoutController(
      'answer',
      params.answerTimeoutSecond || ANSWER_TIMEOUT_DEFAULT
    );

    this.emitter.on(CONNECTION_EVENT_LIST.CONNECTION_NEW, ({ payload }) => {
      payload.metrics.push(
        ...[
          new BitrateMetric({
            params: this.params,
            connection: payload,
            deviceInfo: this.deviceInfo,
            timeout: 2000,
          }),
        ]
      );
    });
  }

  protected async _enterProcess(): Promise<unknown> {
    // Отправляем событие отправки запроса на вход в комнату
    const enterMessage = this.socketMessenger.createPublishMessage(
      SOCKET_MESSAGES_EVENT_LIST.ENTER
    );
    await this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.ENTER, enterMessage);

    // Устанавливаем таймаут на вхождение в комнату
    return this._enterTimeoutController.setTimeout();
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

  protected _sendMyProps() {
    const message = this.socketMessenger.createTransientMessage(
      this.connection && this.connection.connectionId,
      {
        type: SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS,
        ...this.deviceInfo,
      }
    );
    this.emitter.emit(SOCKET_MESSAGES_EVENT_LIST.SEND_PROPS, message);
  }

  protected async _enterRoomHandler(data: EnterData): Promise<void> {
    const {
      iceservers,
      sender: { connectionId },
    } = data;

    this.connectionConfig.iceServers = iceservers;
    this.params.connectionId = connectionId;
    this.params.name = this.params.clientId;
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
    const stream = await this.streams.getStream();

    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });

    try {
      await this._createAnswer(data.sdp);
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

  protected _trackEventHandler(event: RTCTrackEvent): void {
    super._trackEventHandler(event);
    this._sendMyProps();
  }
}

export class RTCCore extends RTCBase implements RTCInterface {
  hasEntered: boolean;
  hasAnswered: boolean;
  isDoctor: boolean;

  constructor(params: RTCParams, connectionConfig?: RTCConfiguration) {
    super(params, connectionConfig);
    this.deviceInfo = {
      hasCamera: false,
      hasMicrophone: false,
      isHidden: false,
      isMute: false,
    };
    this.isDoctor = false;

    this.hasAnswered = false;
    this.hasEntered = false;
  }

  async call(): Promise<MediaStream> {
    const [stream, hasDevice] = await this.streams.initLocalMediaStream();
    this.deviceInfo = { ...this.deviceInfo, ...hasDevice };
    if (this.isDoctor) {
      await this._sendAvailableEvent(true);
    }

    const promiseList = [this._enterProcess()];
    if (this.isDoctor) {
      promiseList.push(this._answerTimeoutController.setTimeout());
    }

    await Promise.all(promiseList);
    return stream;
  }

  changeDeviceState(deviceState: DeviceState): void {
    this.streams.getStream().then((mediaStream) => {
      this.deviceInfo = { ...this.deviceInfo, ...deviceState };

      if (mediaStream) {
        mediaStream
          .getAudioTracks()
          .forEach((audioTrack) => (audioTrack.enabled = !deviceState.isMute));
        mediaStream
          .getVideoTracks()
          .forEach(
            (videoTrack) => (videoTrack.enabled = !deviceState.isHidden)
          );
      }

      this._sendMyProps();
    });
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
        if (!this._enterTimeoutController.timeout) break;

        this._enterTimeoutController.clearTimeout();
        this._enterTimeoutController.resolve();
        this.hasEntered = true;

        await this._enterRoomHandler(message.data);
        break;

      case SOCKET_MESSAGES_EVENT_LIST.VIDEO_OFFER:
        if (!this.isDoctor) break;
        if (this._answerTimeoutController.timeout) {
          this._answerTimeoutController.clearTimeout();
          this._answerTimeoutController.resolve();
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

    [this._answerTimeoutController, this._enterTimeoutController].forEach(
      (controller) => controller.clearTimeout()
    );
  }
}
