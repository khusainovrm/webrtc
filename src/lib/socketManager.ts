'use strict';
import { SOCKET_MESSAGES_EVENT_LIST } from './events';
import {
  IPublishMessage,
  ISocketMessenger,
  TransientMessage,
} from './socketManager.types';

export class SocketMessenger implements ISocketMessenger {
  private _params: any;
  /**
   * @constructor
   * @param params {Object}
   */
  constructor(params: any) {
    this._params = params;
  }

  /**
   * Создание сообщения для сервиса
   * @param type {String}
   * @returns {{
   *  route: string,
   *  data: {
   *    type: String,
   *    consultationId: String,
   *    sender: {
   *      clientId: String,
   *      chatId: String,
   *      connectionId: String
   *      }
   *  }
   * }}
   */
  createPublishMessage<K extends SOCKET_MESSAGES_EVENT_LIST>(
    type: K
  ): IPublishMessage<K> {
    return {
      data: {
        type,
        sender: {
          chatId: this._params.chatId,
          clientId: this._params.clientId,
          connectionId: this._params.connectionId,
        },
        consultationId: this._params.consultationId,
      },
      route: 'vcm',
    };
  }

  /**
   * Создание сообщения для сервера
   * @param connectionId {String | null}
   * @param data {Object}
   * @returns {{chatId: String, data: Object}}
   */
  createTransientMessage(connectionId: string | null, data: any) {
    const payload: TransientMessage = {
      type: data.type,
      chatId: this._params.chatId,
      data: Object.assign({}, data, {
        sender: {
          chatId: this._params.chatId,
          clientId: this._params.clientId,
          connectionId: this._params.connectionId,
        },
        consultationId: this._params.consultationId,
      }),
    };
    if (connectionId) {
      payload.connectionIds = [connectionId];
    }
    return payload;
  }
}

export default {
  SocketMessenger,
};
