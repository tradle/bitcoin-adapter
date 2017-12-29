
# @tradle/bitcoin-adapter

Bitcoin network adapter for [@tradle/engine](https://github.com/tradle/engine)

See adapter [API spec](https://github.com/tradle/engine/blob/eth/adapter.md)

## Usage

```js
const { testnet /*,bitcoin*/ } = require('@tradle/bitcoin-adapter')
const tradle = require('@tradle/engine')
const blockchain = testnet.createBlockchainAPI()
const privateKey = '..' // WIF private key
const transactor = testnet.createTransactor({ privateKey, blockchain })
const node = tradle.node({
  // ...
  network: testnet,
  blockchain,
  transactor
  // ...
})

```
