import { connectCoinCap } from './api/coincap'
import BigNumber from 'bignumber.js'

interface RateApi {
  getPrice: (symbol: string) => Promise<BigNumber>
  disconnect: () => Promise<void>
}

/**
 * Unique 3 or 4 character code for the given asset
 */
enum AssetCode {
  Btc = 'BTC',
  Eth = 'ETH',
  Xrp = 'XRP',
  Usd = 'USD'
}

interface AssetUnit {
  /**
   * Difference in orders of magnitude between this unit and this asset's
   * base unit, or its smallest denomination on ledger
   */
  unit: number
  /** Unique 3 or 4 digit character code for the given asset (e.g. "BTC") */
  symbol: AssetCode
  /** Amount of the asset (positive), or 1 to functionally get the rate */
  amount: BigNumber
  /**
   * Scale used in the Interledger plugin, relative to the base unit of the ledger
   * (e.g. -3 for XRP, as the base unit used the XRP plugin is 3 orders of
   * magnitude smaller than a drop of XRP)
   */
  pluginBase: number
  /**
   * Scale of the unit of exchange, relative to the base unit of the ledger
   * (e.g. Bitcoin, the unit of exchange, is 8 orders or magnitude larger
   * than a satoshi, the smallest denomination)
   */
  exchangeUnit: number
}

type CreateAssetUnit = (unit: number) => (amount?: BigNumber.Value) => AssetUnit

const ethAsset: CreateAssetUnit = unit => amount => ({
  unit,
  exchangeUnit: 18,
  pluginBase: 9,
  symbol: AssetCode.Eth,
  amount: new BigNumber(amount || 1)
})

const eth = ethAsset(18)
const gwei = ethAsset(9)
const wei = ethAsset(0)

const xrpAsset: CreateAssetUnit = unit => amount => ({
  unit,
  pluginBase: -3,
  exchangeUnit: 6,
  symbol: AssetCode.Xrp,
  amount: new BigNumber(amount || 1)
})

const xrp = xrpAsset(6)
const drop = xrpAsset(0)
const xrpBase = xrpAsset(-3)

const btcAsset: CreateAssetUnit = unit => amount => ({
  unit,
  exchangeUnit: 8,
  pluginBase: 0,
  symbol: AssetCode.Btc,
  amount: new BigNumber(amount || 1)
})

const btc = btcAsset(8)
const satoshi = btcAsset(0)

const usdAsset: CreateAssetUnit = unit => amount => ({
  unit,
  exchangeUnit: 2,
  pluginBase: 0,
  symbol: AssetCode.Usd,
  amount: new BigNumber(amount || 1)
})

const usd = usdAsset(2)

/**
 * Determine quantity of destination asset given 1 unit of source asset, in given units
 * @param source Source asset and its unit (amount disregarded)
 * @param dest Destination asset and its unit (amount disregarded)
 * @param api Backend to fetch prices
 */
const getRate = async (
  source: AssetUnit,
  dest: AssetUnit,
  api?: RateApi
): Promise<BigNumber> => {
  let rate = new BigNumber(1)

  // Only fetch the price if the assets are different -- otherwise rate is 1!
  if (source.symbol !== dest.symbol) {
    if (!api) {
      throw new Error(
        'API instance is required for non- like-kind conversions (e.g. BTC to ETH)'
      )
    }

    const [sourcePrice, destPrice] = await Promise.all([
      api.getPrice(source.symbol),
      api.getPrice(dest.symbol)
    ])
    rate = sourcePrice.div(destPrice)
  }

  // Since the rate is in the unit of exchange (e.g. BTC, ETH),
  // it must be converted to scale of the given unit
  return rate.shiftedBy(
    source.unit - source.exchangeUnit - (dest.unit - dest.exchangeUnit)
  )
}

/**
 * Determine quantity of destination asset for the given amount of the source asset
 * - If no amount is provided for the source unit, returns the exchange rate
 * - Backend must be provided to convert between different types of assets
 * @param source Source assest, its amount, and its unit
 * @param dest Destination asset and its unit (amount disregarded)
 * @param api Backend to fetch prices
 */
const convert = async (
  source: AssetUnit,
  dest: AssetUnit,
  api?: RateApi
): Promise<BigNumber> => {
  const rate = await getRate(source, dest, api)
  return (
    source.amount
      .times(rate)
      // Limit the precision based on the scale of the base unit
      .decimalPlaces(dest.unit - dest.pluginBase, BigNumber.ROUND_DOWN)
  )
}

export {
  // Rate backend
  connectCoinCap,
  RateApi,
  // Utilities for rates and converting units
  convert,
  AssetUnit,
  // Creating BTC units
  btc,
  satoshi,
  // Creating ETH units
  eth,
  gwei,
  wei,
  // Creating XRP units
  xrp,
  drop,
  xrpBase,
  // Creating USD units
  usd
}
