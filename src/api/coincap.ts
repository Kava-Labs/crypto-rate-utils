import axios from 'axios'
import BigNumber from 'bignumber.js'
import WebSocket from 'ws'
import { RateApi } from '../'

// Schema for the internal data

interface CoinCapAssetsResponse {
  data: Array<{
    id: string
    symbol: string
    priceUsd: string
  }>
  timestamp: number
}

interface CoinCapPriceResponse {
  [id: string]: string
}

interface CoinCapAsset {
  id: string
  symbol: string
  price: BigNumber
  updated: number
  subscribe: boolean
}

// Utility functions to fetch and parse data

const getAssetDetails = (): Promise<CoinCapAsset[]> =>
  axios
    .get<CoinCapAssetsResponse>('https://api.coincap.io/v2/assets')
    .then(({ data }) =>
      data.data.map(({ symbol, id, priceUsd }) => ({
        id,
        symbol,
        price: new BigNumber(priceUsd),
        updated: Math.min(Date.now(), data.timestamp),
        subscribe: false
      }))
    )

const parseJson = (data: WebSocket.Data): any => {
  try {
    return JSON.parse(data.toString())
  } catch (err) {
    return
  }
}

const isValid = (o: any, assets: CoinCapAsset[]): o is CoinCapPriceResponse =>
  typeof o === 'object' &&
  // Every key should be a known asset id (e.g. 'bitcoin', 'ethereum')
  Object.keys(o).every(id => assets.some(asset => asset.id === id)) &&
  // Every value should be a string, parsable as a valid number
  Object.values(o).every(
    rate =>
      typeof rate === 'string' &&
      new BigNumber(rate).isPositive() &&
      new BigNumber(rate).isFinite()
  )

// Factory function to connect and construct the API

export const connectCoinCap = async (): Promise<RateApi> => {
  // Initial state
  let assets: CoinCapAsset[] = await getAssetDetails()
  let socket: WebSocket

  // Getters
  const getAsset = (symbolOrId: string): CoinCapAsset | undefined =>
    assets.find(asset => asset.id === symbolOrId || asset.symbol === symbolOrId)

  // Reducers (pure)
  const subscribeTo = (symbol: string): CoinCapAsset[] =>
    assets.map(asset => ({
      ...asset,
      ...(asset.symbol === symbol && {
        subscribe: true
      })
    }))
  const updatePrices = (data: CoinCapPriceResponse): CoinCapAsset[] =>
    assets.map(asset => ({
      ...asset,
      // Add the new price & timestamp, if they're available
      ...(data[asset.id] && {
        price: new BigNumber(data[asset.id]),
        updated: Date.now()
      })
    }))

  // Actions (side effects)
  const reconnect = async () => {
    if (socket) {
      // If there was already a connection in progress, wait for that to complete
      // to prevent multiple simultaneous attempts
      if (socket.readyState === WebSocket.CONNECTING) {
        await new Promise(resolve => socket.once('open', resolve))
      }

      socket.close()
      socket.removeAllListeners()
    }

    const assetIds = assets
      .filter(({ subscribe }) => subscribe)
      .map(({ id }) => id)
    if (assetIds.length === 0) {
      return
    }

    socket = new WebSocket(
      `wss://ws.coincap.io/prices?assets=${assetIds.join(',')}`
    )

    await new Promise((resolve, reject) => {
      socket.on('open', resolve)

      socket.on('close', () => {
        reject()
        setTimeout(reconnect, 5000)
      })

      socket.on('error', () => {
        reject()
        setTimeout(reconnect, 5000)
      })

      socket.on('message', message => {
        // Validate the schema of the data
        const data = parseJson(message)
        if (!isValid(data, assets)) {
          throw new Error(
            'failed to update prices: invalid response from CoinCap API'
          )
        }

        assets = updatePrices(data)
      })
    })
  }

  // Build the exported/public interface
  return {
    async getPrice(symbol: string) {
      const asset = getAsset(symbol)
      if (!asset) {
        throw new Error('asset not available via the CoinCap API')
      }

      // If we're not getting updates for the price of that asset, subscribe to it
      if (!asset.subscribe) {
        assets = subscribeTo(symbol)
        await reconnect()
      }

      const { updated, price } = getAsset(symbol) || asset

      const outdatedPrice = Date.now() > updated + 30000
      if (outdatedPrice) {
        throw new Error(
          `asset price hasn't been updated within the last 30 seconds`
        )
      }

      return price
    },
    async disconnect() {
      if (socket) {
        socket.removeAllListeners()
        socket.close()
      }
    }
  }
}
