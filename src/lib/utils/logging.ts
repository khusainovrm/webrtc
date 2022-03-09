import {
  CONNECTION_EVENT_LIST as CONNECTION_LIST,
  EVENT_LIST,
  SOCKET_MESSAGES_EVENT_LIST as SOCKET_LIST,
} from '../events';

export type Direction = 'in' | 'out';
export type Log = {
  event: string;
  timestamp: string;
  payload: any;
  direction: Direction;
};

export type LogMessage = {
  direction: Direction;
  event: string;
  payload: any;
};

export class Logger extends Array<Log> {
  protected static _instance: Logger;
  isLogToConsole: boolean;

  constructor(...props: any[]) {
    super(...props);
    this.isLogToConsole = Logger._instance?.isLogToConsole || false;
    if (Logger._instance) return Logger._instance;
    Logger._instance = this;
  }

  log(message: LogMessage): void {
    const log = {
      direction: message.direction,
      event: message.event,
      timestamp: new Date().toISOString(),
      payload: message.payload,
    };

    this.isLogToConsole && console.log(log);
    this.push(log);
  }

  getSocketEvents(): Log[] {
    return [...this].filter((f) =>
      Object.values(SOCKET_LIST).includes(f.event as SOCKET_LIST)
    );
  }

  getConnectionEvents(): Log[] {
    return [...this].filter((f) =>
      Object.values(CONNECTION_LIST).includes(f.event as CONNECTION_LIST)
    );
  }

  getLibEvents(): Log[] {
    return [...this].filter((f) =>
      Object.values(EVENT_LIST).includes(f.event as EVENT_LIST)
    );
  }
}

export const logger = new Logger();
