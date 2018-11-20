# crypto-rate-utils

> Fetch exchange rates for conversions between crypto assets

### Usage

```js
import { connectCoinCap, eth, gwei, satoshi, convert } from 'crypto-rate-utils'

async function run() {
  const api = await connectCoinCap()

  convert(gwei(1200000), satoshi(), api) // => BN(3600)
  convert(gwei(1200000), eth()) // => BN(0.0012)
}

run().catch(err => console.error(err))
```
