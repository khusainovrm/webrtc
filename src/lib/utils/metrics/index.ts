import { eventsEmitter, EventsEmitter } from '../../emitter';
import { RTCConnection, RTCParams } from '../../modules/core.types';

import { MetricParams, MetricTypesEnum, Stats, StatsTypes } from './types';

export class BaseMetric {
  public type: MetricTypesEnum;
  public timeout: number;

  protected _params: RTCParams;
  protected _connection: RTCConnection;
  protected _timeout: NodeJS.Timeout | undefined;
  protected _emitter: EventsEmitter;

  constructor({ params, connection, timeout }: MetricParams) {
    this._params = params;
    this._connection = connection;
    this.timeout = timeout;
    this.subscribe();
    this.type = MetricTypesEnum.BASE;
    this._emitter = eventsEmitter;
  }

  get isSubscribed() {
    return Boolean(this._timeout);
  }

  get hasConnection() {
    return this._connection && !this._connection.isClosing;
  }

  public subscribe(): void {
    if (this.isSubscribed) return;
    this._timeout = setInterval(this._handler.bind(this), this.timeout);
  }

  public async handler(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public unsubscribe(): void {
    if (this._timeout) clearTimeout(this._timeout);
  }

  protected _sendMetric(type: string, metric: any): void {
    const emitter = this._emitter;
    const payload = {
      type,
      data: metric,
      timestamp: Date.now(),
    };
    emitter.emit(emitter.eventsMap.EVENT_LIST.SEND_METRIC, payload);
  }

  protected async _getStats(): Promise<Stats> {
    const statsList = await this._connection.getStats(null);
    const stats: Partial<Stats> = {};

    statsList.forEach((stat: any) => {
      if (stats[stat.type as StatsTypes]) {
        stats[stat.type as StatsTypes]?.push(stat);
      } else {
        stats[stat.type as StatsTypes] = [stat];
      }
    });
    return stats as Stats;
  }

  protected get _info() {
    const { clientId, consultationId } = this._params;
    return { clientId, consultationId };
  }

  private async _handler(): Promise<void> {
    if (!this.hasConnection) return this.unsubscribe();
    return await this.handler();
  }
}
