# budu-webrtc

Репозиторий budu-webrtc - внутренняя библиотека для реализации консультаций на базе WebRTC.
Библиотека представляет собой внутренний npm-пакет, который содержит:

- ✅ класс `RTCDoctor` для работы консультаций на стороне ЛК Врача
- ✅ класс `RTCClient` для работы консультаций на стороне клиента

###### 🚨 Обновление версии библиотеки происходит через интерфейс gitlab, поэтому поднимать версию пакета вручную в package.json НЕ требуется.

### Документация по использованию

---

#### ЛК Врача

```typescript

// Импортируем класс webrtc для ЛК Врача, события и инстанс логерра
import {
    RTCDoctor,
    CallError,
    EVENT_LIST,
    SOCKET_MESSAGES_EVENT_LIST,
    CONNECTION_EVENT_LIST,
    logger,
} from '@frontend/budu-webrtc';

// Создаем инстанс доктора
const wrtc_doctor = new RTCDoctor(params);

// Устанавливает состояние девайсов (Опционально)
wrtc_doctor.changeDeviceState({
  isHidden: true,
  isMute: false,
});

// Подписываемся на необходимые события
wrtc_doctor.emitter.on(EVENT_LIST.HANG_UP, event => {...});
wrtc_doctor.emitter.on(CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE, event => {...});
wrtc_doctor.emitter.on(SOCKET_MESSAGES_EVENT_LIST.ENTER, event => {...});
// ...Или можно подписаться на все события и фильтровать уже в обработчике
wrtc_doctor.emitter.on(EVENT_LIST.ALL, event => {
    switch (event.eventType) {
        case EVENT_LIST.HANG_UP: return HangUpHandler(event)
        case CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE: return ConnectionIceStateHandler(event)
        case SOCKET_MESSAGES_EVENT_LIST.ENTER: return SocketEnterHandler(event)
    }
});

// Чтобы сделать вызов необходимо вызвать метод `call`
try {
    const localStream = await wrtc_doctor.call();
} catch (error: CallError) {
    switch (err.type) {
      case 'enter': ...
      case 'answer': ...
      case 'streamError': ...
    }
}

// Чтобы получить логи используйте инстанс логера `logger`
console.log(logger.getConnectionEvents())
console.log(logger.filter( l => l.event === 'enter'))
```

#### ЛК Клиента

```typescript

// Импортируем класс webrtc для ЛК Врача, события и инстанс логерра
import {
    RTCClient,
    CallError,
    EVENT_LIST,
    SOCKET_MESSAGES_EVENT_LIST,
    CONNECTION_EVENT_LIST,
    logger,
} from '@frontend/budu-webrtc';

// Создаем инстанс доктора
const wrtc_client = new RTCClient(params);

// Устанавливаем состояние девайсов (Опционально)
wrtc_client.changeDeviceState({
  isHidden: true,
  isMute: false,
});

// Подписываемся на необходимые события
wrtc_client.emitter.on(EVENT_LIST.HANG_UP, event => {...});
wrtc_client.emitter.on(CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE, event => {...});
wrtc_client.emitter.on(SOCKET_MESSAGES_EVENT_LIST.ENTER, event => {...});
// ...Или можно подписаться на все события и фильтровать уже в обработчике
wrtc_client.emitter.on(EVENT_LIST.ALL, event => {
    switch (event.eventType) {
        case EVENT_LIST.HANG_UP: return HangUpHandler(event)
        case CONNECTION_EVENT_LIST.CONNECTION_ICE_STATE: return ConnectionIceStateHandler(event)
        case SOCKET_MESSAGES_EVENT_LIST.ENTER: return SocketEnterHandler(event)
    }
});

// Чтобы ответить вызов необходимо вызвать метод `call`
try {
    const localStream = await wrtc_client.call();
} catch (error: CallError) {
    switch (err.type) {
      case 'enter': ...
      case 'streamError': ...
    }
}

// Чтобы получить логи используйте инстанс логера `logger`
console.log(logger.getConnectionEvents())
console.log(logger.filter( l => l.event === 'enter'))
```

### Документация по API

---

### Базовые классы

#### class [`RTCCore`](#class-rtc-core) <a name="class-rtc-core"></a>

Обеспечивает пул соединений на стороне.

```typescript
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
```

**_param `RTCCore.connectionConfig` - [`RTCConfiguration`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection)_**
Конфиг для создания инстанса `RTCPeerConnection`

```typescript
new RTCPeerConnection(this.connectionConfig);
```

**_param `RTCCore.emitter` - [`EventsEmitter`](#class-events-emitter)_**
Инстанс класса [`EventsEmitter`](#class-events-emitter) для работы с событиями
**_param `RTCCore.params` - [`RTCParams`](#type-rtc-doc-params)_**
Вспомогательная информация

> смотреть описания типа [`RTCParams`](#type-rtc-doc-params)

**_param `RTCCore.mediaStream` - [`MediaStream`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream) | null_**
**_param `RTCCore.allMediaStreams` - [`MediaStream`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)[]_**

**_param `RTCCore.connection` - [`RTCConnection`](#type-rtc-connection) | null_**
Инстанс RTC соединения

**_param `RTCCore.socketMessenger` - [`ISocketMessenger`](#type-socket-messenger)_**
Инстанс класса [`SocketMessenger`](#class-socket-messenger) для генерации сокетных сообщений

**_param `RTCCore.hasEntered` - boolean_**
Флаг говорящий о успешном вхождение в комнату

**_param `RTCCore.hasAnswered` - boolean_**
Флаг говорящий о успешном ответе кандидата

**_method `RTCCore.call(): Promise<MediaStream>`_**
Инициация звонка кандидату:

- Вхождение в комнату
- Ожидание офера и ответ на него
  Возвращает Promise с локальным [`MediaStream`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)

Возможны ошибки типа [`CallError`](#class-call-error) (смотреть описание типа)

**_method `RTCCore.socketMessageHandler(message: SocketMessage): Promise<void>`_**
Обработка серверных сообщений.
Принимает сокетное сообщение [`SocketMessage`](#type-socket-message)

**_method `RTCCore.changeDeviceState(props: DeviceState): void`_**
Функция для изменения состояния audio и video треков по флагам [`DeviceState`](#type-device-state)

**_method `RTCCore.hangUp(): void`_**
Остановка треков стрима и отправка сокетного события об отключении

**_method `RTCCore.destroy(): void`_**
Закрытие всех соединений

#### class [`CallError`](#class-call-error) <a name="class-call-error"></a>

Класс ошибки вызова кандидата

```typescript
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
```

#### class [`EventsEmitter`](#class-events-emitter) <a name="class-events-emitter"></a>

Класс для работы с событиями библиотеки.
Возможность подписываться, отписываться и вызывать сообщения

```typescript
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
```

**_param `EventsEmitter.events` - [`EventsDict`](#type-events-dict)_**
Объект событий, где ключ - [`EventList`](#type-event-list), а значение - массив [`EventCallback`](#type-event-callback) для этого события

#### class [`SocketMessenger`](#class-socket-messenger) <a name="class-socket-messenger"></a>

```typescript
  createPublishMessage<K extends SOCKET_MESSAGES_EVENT_LIST>(
    type: K
  ): IPublishMessage<K>;
  createTransientMessage(
    connectionId: string | null,
    data: any
  ): TransientMessage;
```

### Types

---

#### type [`IPublishMessage`](#type-publish-message) <a name="type-publish-message"></a>

```typescript
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
```

#### type [`TransientMessage`](#type-transient-message) <a name="type-transient-message"></a>

```typescript
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
```

#### type [`RTCParams`](#type-rtc-doc-params) <a name="type-rtc-doc-params"></a>

```typescript
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
```

#### type `DoctorInfo`

```typescript
export type DoctorInfo = {
  avatarId: string | null;
  fullName: string;
  specialityName: string;
};
```

#### type [`RTCConnection`](#type-rtc-connection) <a name="type-rtc-connection"></a>

Тип расширяющий тип RTC соединения [`RTCPeerConnection`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)

```typescript
export type RTCConnection = RTCPeerConnection & {
  clientId: string;
  connectionId: string;
  name: string;
  iceCandidatesQueue: RTCIceCandidate[];
  isInviter: boolean;
  isClosing: boolean;
  negotiating: boolean;
};
```

#### type [`CallErrorType`](#type-call-error-type) <a name="type-call-error-type"></a>

```typescript
export type CallErrorType = Error & {
  type: CallErrorMessage;
  description?: string | null;
};
```

#### type [`CallErrorMessage`](#type-call-error-message) <a name="type-call-error-message"></a>

```typescript
export type CallErrorMessage = 'streamError' | 'enter' | 'answer';
```

#### type [`SocketMessage`](#type-socket-message) <a name="type-socket-message"></a>

```typescript
export type SocketMessage = { type: string; data: any };
```

#### type [`DeviceState`](#type-device-state) <a name="type-device-state"></a>

```typescript
export type DeviceState = {
  isHidden: boolean;
  isMute: boolean;
};
```

#### type [`EventList`](#type-event-list) <a name="type-event-list"></a>

```typescript
export type EventList =
  | EVENT_LIST
  | SOCKET_MESSAGES_EVENT_LIST
  | CONNECTION_EVENT_LIST;
```

#### type [`EventCallback`](#type-event-callback) <a name="type-event-callback"></a>

```typescript
export type EventCallback<T> = (event: T) => void;
```

#### type [`EventsDict`](#type-events-dict) <a name="type-events-dict"></a>

```typescript
export type EventsDict = {
  [K in keyof EventCallbackMap]: Array<EventCallbackMap[K]>;
};
```

_Пример_

```typescript
type EventsDict = {
    allEvent: AnyCallback[];
    hangUpReceiveEvent: EventCallback<IEvent<EVENT_LIST.HANG_UP, void>>[];
    rtcRespondentPropsEvent: EventCallback<IEvent<EVENT_LIST.RTC_RESPONDENT_PROPS, IRtcSendPropsData>>[];
    ... 12 more ...;
    hangup: EventCallback<...>[];
}
```

#### type [`EventCallbackMap`](#type-event-callback-map) <a name="type-event-callback-map"></a>

```typescript
export type EventCallbackMap = {
  [K in keyof EventMap]: K extends EVENT_LIST.ALL
    ? AnyCallback
    : EventCallback<EventMap[K]>;
};
```

_Пример_

```typescript
type EventCallbackMap = {
    allEvent: AnyCallback;
    hangUpReceiveEvent: EventCallback<IEvent<EVENT_LIST.HANG_UP, void>>;
    rtcRespondentPropsEvent: EventCallback<IEvent<EVENT_LIST.RTC_RESPONDENT_PROPS, IRtcSendPropsData>>;
    ... 12 more ...;
    hangup: EventCallback<...>;
}
```

#### type [`EventMap`](#type-event-map) <a name="type-event-map"></a>

```typescript
export type EventMap = {
  [K in keyof EventDataMap]: IEvent<K, EventDataMap[K]>;
};
```

_Пример_

```typescript
type EventMap = {
    allEvent: IEvent<EVENT_LIST.ALL, any>;
    hangUpReceiveEvent: IEvent<EVENT_LIST.HANG_UP, void>;
    rtcRespondentPropsEvent: IEvent<EVENT_LIST.RTC_RESPONDENT_PROPS, IRtcSendPropsData>;
    ... 12 more ...;
    hangup: IEvent<...>;
}
```

#### type [`IEvent`](#type-event) <a name="type-event"></a>

```typescript
export type IEvent<T, P> = {
  emitType: EMIT_TYPE_LIST;
  eventType: T;
  payload: P;
};
```

#### type [`ISocketMessenger`](#type-socket-messenger) <a name="type-socket-messenger"></a>

```typescript
export type ISocketMessenger = {
  createPublishMessage<K extends SOCKET_MESSAGES_EVENT_LIST>(
    type: K
  ): IPublishMessage<K>;
  createTransientMessage(
    connectionId: string | null,
    data: any
  ): TransientMessage;
};
```

### Enums

---

#### enum [`EMIT_TYPE_LIST`](#enum-emit-type-list) <a name="enum-emit-type-list)></a>

```typescript
export enum EMIT_TYPE_LIST {
  EVENT = 'event',
  ERROR = 'error',
}
```

### Установка npm пакета локально

---

Подробное описание по особенностям работы с внутренними npm-пакетами можно прочесть вот здесь:
https://confluence.renhealth.com/pages/viewpage.action?pageId=46654678

Обычная возникают проблемы с установкой npm пакетов локально на компьютерах разработчиков.
Локально пакеты из нашего npm-хранилища можно устанавливать только при наличии авторизации,
иначе при запросе _npm i @frontend/budu-webrtc_ можно получить ошибку 404.

Для правильной авторизации создаем (если еще нету) файл .npmrc в домашней директории (для Windows это папка C:\Users\ваше.имя, а для unix-систем /home/{username}/.npmrc) и добавляем в него:

@frontend:registry=https://gitlab.dev.renhealth.com/api/v4/packages/npm/
//gitlab.dev.renhealth.com/api/v4/packages/npm/:\_authToken= "ACCESS_TOKEN"
//gitlab.dev.renhealth.com/api/v4/projects/248/packages/npm/:\_authToken= "ACCESS_TOKEN"

Заменяем ACCESS_TOKEN на ваш персональный.
Персональный токен формируем в gitlab на странице https://gitlab.dev.renhealth.com/-/profile/keys
Для токена достаточно чтобы были права только на чтение
