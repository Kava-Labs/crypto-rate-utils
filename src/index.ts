import BigNumber from 'bignumber.js'

export { connectCoinCap } from './api/coincap'

export interface RateApi {
  /** Fetch the price of the asset denoted by the given symbol in US dollars */
  getPrice: (symbol: string) => BigNumber

  /** Gracefully disconnect the connection to the API provider */
  disconnect: () => Promise<void>
}

export interface AssetUnit {
  /** Unique identifier for the asset (typically a 3 or 4 character uppercase code) */
  readonly symbol: string

  /** Orders of magnitude between the unit of exchange and the base unit */
  readonly exchangeScale: number

  /** Orders of magnitude between the unit of account and the base unit */
  readonly accountScale: number

  /**
   * Number of orders of magnitude between this unit and the base unit
   * - Defines the unit of the asset (e.g. ether, gwei, or wei, in the case of the asset ETH)
   * - By default, this should be 0, the base unit (typically the smallest denomination of the asset)
   */
  readonly scale: number
}

export interface AssetQuantity extends AssetUnit {
  /** Quantity of the asset */
  readonly amount: BigNumber
}

/** Create the base unit for the given asset */
export const baseUnit = (unit: AssetUnit): AssetUnit => ({
  ...unit,
  scale: 0
})

/** Create the unit of exchange for the given asset */
export const exchangeUnit = (unit: AssetUnit): AssetUnit => ({
  ...unit,
  scale: unit.exchangeScale
})

/** Create the unit of account for the given asset */
export const accountUnit = (unit: AssetUnit): AssetUnit => ({
  ...unit,
  scale: unit.accountScale
})

/**
 * Create or convert a quantity to a different unit of the given asset
 * - If given a quantity, convert it to the new unit
 * - If given an asset and amount, create a quantity with the amount
 */
export interface ConvertQuantity {
  (unit: AssetUnit, amount: BigNumber.Value): AssetQuantity
  (unit: AssetQuantity): AssetQuantity
}

/**
 * Create or convert a quantity to the base unit (typically the smallest denomination) of the given asset
 * - If given a quantity, convert it to the base unit
 * - If given an amount, create a quantity with that amount
 */
export const baseQuantity: ConvertQuantity = (
  unit: AssetUnit | AssetQuantity,
  amount?: BigNumber.Value
) => ({
  ...unit,
  scale: 0,
  amount:
    'amount' in unit
      ? unit.amount.shiftedBy(unit.scale)
      : new BigNumber(amount!)
})

/**
 * Create or convert a quantity to the unit of exchange of the given asset
 * - If given a quantity, convert it to the unit of exchange
 * - If given an asset and amount, create a quantity with that amount
 */
export const exchangeQuantity: ConvertQuantity = (
  unit: AssetUnit | AssetQuantity,
  amount?: BigNumber.Value
) => ({
  ...unit,
  scale: unit.exchangeScale,
  amount:
    'amount' in unit
      ? unit.amount.shiftedBy(unit.scale - unit.exchangeScale)
      : new BigNumber(amount!)
})

/**
 * Create or convert a quantity to the unit of account of the given asset
 * - If given a quantity, convert it to the unit of account
 * - If given an asset and amount, create a quantity with that amount
 */
export const accountQuantity: ConvertQuantity = (
  unit: AssetUnit | AssetQuantity,
  amount?: BigNumber.Value
) => ({
  ...unit,
  scale: unit.accountScale,
  amount:
    'amount' in unit
      ? unit.amount.shiftedBy(unit.scale - unit.accountScale)
      : new BigNumber(amount!)
})

/**
 * Determine quantity of destination asset for the given amount of the source asset
 * - If no amount is provided for the source unit, returns the exchange rate
 * - Backend must be provided to convert between different types of assets
 * @param source Source asset, its amount, and its unit
 * @param dest Destination asset and its unit (amount disregarded)
 * @param apiOrRate Backend to fetch prices, or an exchange rate
 */
export const convert = (
  source: AssetQuantity,
  dest: AssetUnit,
  api?: RateApi
): AssetQuantity => ({
  ...dest,
  amount: source.amount.times(getRate(source, dest, api))
})

/**
 * Determine quantity of destination asset given 1 unit of source asset, in given units
 * @param source Source asset and its unit (amount disregarded)
 * @param dest Destination asset and its unit (amount disregarded)
 * @param api Backend to fetch prices
 */
const getRate = (
  source: AssetUnit,
  dest: AssetUnit,
  api?: RateApi
): BigNumber => {
  let rate = new BigNumber(1)

  // Only fetch the price if the assets are different -- otherwise rate is 1!
  if (source.symbol !== dest.symbol) {
    if (!api) {
      throw new Error(
        'API instance is required for non- like-kind conversions (e.g. BTC to ETH)'
      )
    }

    const sourcePrice = api.getPrice(source.symbol)
    const destPrice = api.getPrice(dest.symbol)
    rate = sourcePrice.div(destPrice)
  }

  // Since the rate is in the unit of exchange (e.g. BTC, ETH),
  // it must be converted to scale of the given unit
  return rate.shiftedBy(
    source.scale - source.exchangeScale - (dest.scale - dest.exchangeScale)
  )
}
