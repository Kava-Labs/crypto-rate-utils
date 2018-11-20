// TODO WIP

import io, { SocketIOClient } from 'socket.io-client'

export default class CryptoCompareBackend {
  protected socket?: SocketIOClient.Socket

  public async connect() {
    // var subscription = ['5~CCCAGG~BTC~USD', '5~CCCAGG~ETH~USD', '11~BTC', '11~ETH']
    const symbol = 'BTC'

    this.socket = io('https://streamer.cryptocompare.com/')
    this.socket.emit('SubAdd', {
      subs: [`5~CCCAGG~${symbol}~USD`]
    })
    this.socket.on('m', (message: string) => {
      // '{SubscriptionId}~{ExchangeName}~{FromCurrency}~{ToCurrency}~{Flag}~{Price}~{LastUpdate}~{LastVolume}~{LastVolumeTo}~{LastTradeId}~{Volume24h}~{Volume24hTo}~{LastMarket}'
    })
  }
}
