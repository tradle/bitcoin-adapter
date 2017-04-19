const crypto = require('crypto')
const bitcoin = require('@tradle/bitcoinjs-lib')
const Blockr = require('@tradle/cb-blockr')
const bs58check = require('bs58check')
const shallowClone = require('xtend')

/**
 * supported blockchain networks
 * @module networks
 */
const networks = {
  bitcoin: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4
    },
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80,
    dustThreshold: 546 // https://github.com/bitcoin/bitcoin/blob/v0.9.2/src/core.h#L151-L162
  },
  testnet: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bip32: {
      public: 0x043587cf,
      private: 0x04358394
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
    dustThreshold: 546
  }
}

Object.keys(networks).forEach(networkName => {
  const constants = networks[networkName]
  exports[networkName] = getNetworkAPI({ networkName, constants })
})

function getNetworkAPI ({ networkName, constants }) {

  const api = {
    blockchain: 'bitcoin',
    name: networkName,
    minOutputAmount: constants.dustThreshold + 1,
    constants,
    pubKeyToAddress,
    createBlockchainAPI,
    createTransactor,
    wrapCommonBlockchain,
    // specific to bitcoin
    privToWIF
  }

  return api

  function createBlockchainAPI () {
    return wrapCommonBlockchain(new Blockr(networkName))
  }

  function wrapCommonBlockchain (blockchain) {
    const { blocks, addresses, transactions, info } = blockchain
    return {
      info: info && info.bind(blockchain),
      blocks: {
        latest: blocks.latest.bind(blocks)
      },
      transactions: {
        get: wrapGetTransactions(transactions.get.bind(transactions)),
        // propagate: transactions.propagate.bind(transactions)
        propagate: function propagate (txHex, cb) {
          transactions.propagate(txHex, function (err) {
            if (err) return cb(err)

            cb(null, parseCommonBlockchainTransaction({ txHex }))
          })
        }
      },
      addresses: {
        transactions: wrapGetTransactions(addresses.transactions.bind(addresses)),
        unspents: addresses.unspents.bind(addresses)
      },
      _advanceToNextBlock: blockchain._advanceToNextBlock
    }
  }

  function wrapGetTransactions (fn) {
    return function getTransactions (...args) {
      const cb = args.pop()
      args.push(function (err, results) {
        if (err) return cb(err)

        cb(null, results.map(parseCommonBlockchainTransaction))
      })

      fn(...args)
    }
  }

  function createTransactor ({ privateKey, blockchain }) {
    if (!blockchain) blockchain = createBlockchainAPI()

    const Wallet = require('@tradle/simple-wallet')
    const transactor = Wallet.transactor({
      networkName,
      blockchain,
      priv: privateKey
    })

    return {
      send: function (opts, cb) {
        transactor.send(opts, function (err, result) {
          if (err) return cb(err)

          cb(null, parseCommonBlockchainTransaction(result))
        })
      }
    }
  }

  function pubKeyToAddress (pub) {
    let hash = sha256(pub)
    hash = crypto.createHash('ripemd160').update(hash).digest()

    const version = constants.pubKeyHash
    let payload = new Buffer(21)
    payload.writeUInt8(version, 0)
    hash.copy(payload, 1)

    return bs58check.encode(payload)
  }

  function parseCommonBlockchainTransaction (txInfo) {
    var tx = txInfo.toHex ? txInfo : bitcoin.Transaction.fromHex(txInfo.txHex)
    return shallowClone(txInfo, {
      from: parseTxSender(tx),
      to: {
        addresses: getOutputAddresses(tx)
      },
      confirmations: txInfo.confirmations || 0,
      txId: txInfo.txId || tx.getId(),
      txHex: txInfo.txHex || tx.toHex()
    })
  }

  function parseTxSender (tx) {
    const pubkeys = []
    const addrs = []
    tx.ins.map(function (input) {
      const pubKeyBuf = input.script.chunks[1]
      try {
        const pub = bitcoin.ECPubKey.fromBuffer(pubKeyBuf)
        const addr = pub.getAddress(constants).toString()
        pubkeys.push(pubKeyBuf)
        addrs.push(addr)
      } catch (err) {}
    })

    return {
      pubkeys: pubkeys,
      addresses: addrs
    }
  }

  function getOutputAddresses (tx) {
    return tx.outs.map(function (output) {
      return getAddressFromOutput(output)
    })
    .filter(val => val)
  }

  function getAddressFromOutput (output) {
    if (bitcoin.scripts.classifyOutput(output.script) === 'pubkeyhash') {
      return bitcoin.Address
        .fromOutputScript(output.script, constants)
        .toString()
    }
  }

  function privToWIF (priv, compressed) {
    const bufferLen = compressed ? 34 : 33
    const buffer = new Buffer(bufferLen)

    buffer.writeUInt8(constants.wif, 0)
    priv.copy(buffer, 1)

    if (compressed) {
      buffer.writeUInt8(0x01, 33)
    }

    return bs58check.encode(buffer)
  }
}

function sha256 (data) {
  return crypto.createHash('sha256').update(data).digest()
}
