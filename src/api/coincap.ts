import axios from 'axios'
import BigNumber from 'bignumber.js'
import WebSocket from 'ws'
import { RateApi } from '..'

// Schema and data validation

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

const parseJson = (data: WebSocket.Data): any => {
  try {
    return JSON.parse(data.toString())
  } catch (err) {
    return
  }
}

const isValidPriceResponse = (
  o: any,
  assets: CoinCapAsset[]
): o is CoinCapPriceResponse =>
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

/** Delay (ms) between polling requests for prices and ids from all assets */
const POLLING_REFRESH_INTERVAL = 20000
/** Maximum amount of time (ms) before a price is invalidated since it's too old */
const MAX_PRICE_AGE = 30000

export const connectCoinCap = async (): Promise<RateApi> => {
  // Initial state
  let assets: CoinCapAsset[] = []
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
  const updateAssets = (data: CoinCapAssetsResponse): CoinCapAsset[] =>
    data.data.map(({ symbol, id, priceUsd }) => {
      // Get the old version of the asset
      const asset = assets.find(a => a.symbol === symbol)

      // If the old price is more up-to-date, stick with that and don't update it
      return asset && asset.updated > data.timestamp
        ? asset
        : {
            id,
            symbol,
            price: new BigNumber(priceUsd),
            updated: Math.min(Date.now(), data.timestamp),
            // Assets that we're subscripted to should stay subscribed
            subscribe: !!asset && asset.subscribe
          }
    })

  // Actions (side effects)
  const fetchAssets = () =>
    axios
      .get<CoinCapAssetsResponse>('https://api.coincap.io/v2/assets')
      .then(({ data }) => {
        assets = updateAssets(data)
      })
      .catch(() => Promise.resolve())
  const resubscribe = () => {
    if (socket) {
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

    socket.on('close', () => setTimeout(resubscribe, 5000))
    socket.on('error', () => setTimeout(resubscribe, 5000))
    socket.on('message', message => {
      // Validate the schema of the data
      const data = parseJson(message)
      if (!isValidPriceResponse(data, assets)) {
        throw new Error(
          'failed to update prices: invalid response from CoinCap API'
        )
      }

      assets = updatePrices(data)
    })
  }

  // Start interval to update all assets at regular interval
  const refresh = setInterval(fetchAssets, POLLING_REFRESH_INTERVAL)

  // Initially fetch assets
  await fetchAssets()

  // Build the exported/public interface
  return {
    getPrice(symbol: string) {
      // Must be hardcoded, since every pair's price is denominated in USD
      if (symbol === 'USD') {
        return new BigNumber(1)
      }

      const asset = getAsset(symbol)
      if (!asset) {
        throw new Error('asset not available via the CoinCap API')
      }

      const { updated, subscribe, price } = asset
      const outdatedPrice = Date.now() > updated + MAX_PRICE_AGE
      if (outdatedPrice) {
        throw new Error(
          `asset price hasn't been updated within the last 30 seconds`
        )
      }

      // If we're not getting updates for the price of that asset, subscribe to it
      if (!subscribe) {
        assets = subscribeTo(symbol)
        resubscribe()
      }

      return price
    },
    async disconnect() {
      if (socket) {
        socket.removeAllListeners()
        socket.close()
      }

      clearInterval(refresh)
    }
  }
}
