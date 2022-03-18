'use strict';

import { RTCCore } from './core';
import { RTCParams } from './core.types';

export class RTCDoctor extends RTCCore {
  constructor(
    params: RTCParams,
    connectionConfig?: RTCConfiguration | undefined
  ) {
    super(params, connectionConfig);
    this.isDoctor = true;
  }
}

export default {
  RTCDoctor,
};
