# crypto-rate-utils

> Fetch exchange rates for conversions between crypto assets

### Install

```shell
npm i @kava-labs/crypto-rate-utils
```

### Usage

```js
import { connectCoinCap, eth, gwei, satoshi, convert } from 'crypto-rate-utils'

async function run() {
  const api = await connectCoinCap()

  await convert(gwei(1200000), eth()) // => BN(0.0012)
  await convert(gwei(1200000), satoshi(), api) // => BN(...)
}

run().catch(err => console.error(err))
```
