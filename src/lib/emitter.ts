'use strict';

import {
  AnyCallback,
  EMIT_TYPE_LIST,
  EventCallbackMap,
  EventDataMap,
  EventMap,
  EventsDict,
  IEvent,
  IEventsEmitter,
} from './emitter.types';
import { EVENT_LIST } from './events';
import { logger } from './utils/logging';

export class EventsEmitter implements IEventsEmitter {
  events: EventsDict;

  constructor() {
    this.events = {
      [EVENT_LIST.ALL]: [] as Array<AnyCallback>,
    } as EventsDict;
  }

  /**
   * Подписка на событие
   * @param event {String}
   * @param callback {(event: EventEmitter) => void}
   */
  on<K extends keyof EventCallbackMap>(
    event: K,
    callback: EventCallbackMap[K]
  ): void {
    if (!Object.keys(this.events).includes(event)) {
      this.events[event] = [];
    }
    this.events[event].push(callback as AnyCallback);
  }

  /**
   * Отписка от события
   * @param event {String}
   * @param callback {Function}
   */
  off<K extends keyof EventCallbackMap>(
    event: K,
    callback: EventCallbackMap[K]
  ): void {
    if (!Object.keys(this.events).includes(event)) return;
    const callbacks = this.events[event] as AnyCallback[];
    this.events[event] = callbacks.filter(
      (cb: EventCallbackMap[K]) => cb !== callback
    );
  }

  /**
   * Отправка события всем подписчикам
   * @param eventType {String}
   * @param payload
   * @param emitType
   */
  async emit<K extends keyof EventDataMap>(
    eventType: K,
    payload: EventDataMap[K] = null,
    emitType: EMIT_TYPE_LIST = EMIT_TYPE_LIST.EVENT
  ): Promise<void> {
    if (!Object.keys(this.events).includes(eventType)) {
      this.events[eventType] = [];
    }

    const event = this._createEvent(eventType, payload, emitType);

    logger.log({
      direction: 'out',
      event: eventType,
      payload,
    });

    const callbacks = this.events[eventType] as AnyCallback[];
    callbacks.forEach((cb) => cb(event));

    if (eventType !== EVENT_LIST.ALL) {
      this.events[EVENT_LIST.ALL].forEach(
        (cb: EventCallbackMap[EVENT_LIST.ALL]) =>
          cb(event as EventMap[EVENT_LIST.ALL])
      );
    }
  }

  _createEvent<T, D>(
    eventType: T,
    payload: D,
    emitType: EMIT_TYPE_LIST = EMIT_TYPE_LIST.EVENT
  ): IEvent<T, D> {
    return {
      emitType,
      eventType,
      payload,
    };
  }
}

export default {
  EMIT_TYPE_LIST,

  EventsEmitter,
};
