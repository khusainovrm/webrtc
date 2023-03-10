'use strict';

import { RTCCore } from './core';
import { RTCConnection, RTCParams } from './core.types';

export class RTCDoctor extends RTCCore {
  constructor(
    params: RTCParams,
    connectionConfig?: RTCConfiguration | undefined
  ) {
    super(params, connectionConfig);
    this.isDoctor = true;
  }

  protected _iceConnectionStateChangeEventHandler(
    event: Event,
    connection: RTCConnection
  ): RTCConnection {
    super._iceConnectionStateChangeEventHandler(event, connection);
    if (connection.iceConnectionState === 'failed') {
      this._connectMember(connection.connectionId);
    }
    return connection;
  }
}

export default {
  RTCDoctor,
};
