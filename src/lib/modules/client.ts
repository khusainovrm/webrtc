'use strict';
import { EnterData } from '../socketManager.types';

import { RTCCore } from './core';

export class RTCClient extends RTCCore {
  protected async _enterRoomHandler(data: EnterData): Promise<void> {
    super._enterRoomHandler(data);
    await this._connectMember('');
  }
}

export default {
  RTCClient,
};
