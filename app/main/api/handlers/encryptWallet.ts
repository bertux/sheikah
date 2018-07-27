import { SubSystems } from "app/main/system"
import { asRuntimeType, asObject } from "app/common/runtimeTypes"
import {
  EncryptWalletParams,
  EncryptWalletResponse,
  encryptWalletErrors,
  EncryptWalletError
} from "app/common/runtimeTypes/ipc/wallets"
import { AesCipher, AesCipherSettings, defaultAesCipherSettings } from "app/main/ciphers/aes"
import { jsonBufferSerializer } from "app/main/serializers/jsonBuffer"
import { LevelPersister } from "app/main/persisters/level"
import * as path from "path"
import { homedir } from "os"
import { ensurePath } from "app/main/storage/utils"
import * as level from "level"
import { JsonAesLevelStorage } from "app/main/subsystems/jsonAesLevel"
import { Storage } from "app/main/storage"
import { sha256BufferHasher } from "app/main/hashers/sha256Buffer"
import {
  ExtendedKey,
  Wallet,
  WalletInfo,
  UnconsolidatedWallet,
  Seed,
  Wip3SeedInfo,
  KeyPath,
  KeyChain,
  Account
} from "app/common/runtimeTypes/storage/wallets"
import * as CryptoSeed from "app/main/crypto/seed"
import * as PrivateKey from "app/main/crypto/key/privateKey"
import { ExtendedKey as CryptoExtendedKey } from "app/main/crypto/key/key"
import * as AccountFactory from "app/common/factories/account"
import { JsonSerializable } from "app/common/serializers"
import * as t from "io-ts"
import { inject, asType } from "app/main/utils/utils"

/**
 * Handler function for "encryptWallet" method.
 * @param {SubSystems} system
 * @param params
 * @returns {Promise<void>}
 */
export default async function encryptWallet(system: SubSystems, params: any):
  Promise<JsonSerializable> {

  return Promise.all([
    Promise.resolve(params)
      .then((p) => asType(p, EncryptWalletParams, encryptWalletErrors.WRONG_TYPE_PARAMS))
      .then(newWalletStorage),
    Promise.resolve(params)
      .then(inject(updateUnconsolidatedWallet, system))
      .then(inject(newWallet, system))
  ])
  .then(storeWallet)
  .then(inject(replaceWallet, system))
  .then(buildSuccessResponse)
  .catch(buildErrorResponse)
  .then(encodeResponse)
}

/**
 * Update and validate unconsolidated wallet
 * @param params
 * @param system
 */
function updateUnconsolidatedWallet(params: EncryptWalletParams, system: SubSystems):
  UnconsolidatedWallet {

  const unconsolidatedWallet = system.appStateManager.state.unconsolidatedWallet
  if (!unconsolidatedWallet) { throw encryptWalletErrors.UNCONSONSOLIDATEDWALLET_UNAVAILABLE }
  if (unconsolidatedWallet.id !== params.id) { throw encryptWalletErrors.INVALID_WALLET_ID }
  unconsolidatedWallet.caption = params.caption

  return unconsolidatedWallet
}

/**
 * Stores wallet in WalletStorage.
 */
async function storeWallet([walletStorage, wallet]: [JsonAesLevelStorage, Wallet]) {
  try {
    const storage = Wallet.encode(wallet)
    await walletStorage.put("wallet", storage)

    return { walletStorage, wallet }
  } catch (error) {
    throw encryptWalletErrors.WALLET_STORE_FAILURE
  }
}

/**
 * Replaces the walletStorage and remove the unconsolidated wallet.
 */
async function replaceWallet(
  { walletStorage, wallet }: { walletStorage: JsonAesLevelStorage, wallet: Wallet },
  system: SubSystems): Promise<Wallet> {

  try {
    await system.walletStorage.replace(walletStorage)
    // as the wallet has been stored with success the unconsolidated wallet is removed
    system.appStateManager.update({unconsolidatedWallet: {} as UnconsolidatedWallet})

    return wallet
  } catch  {
    throw encryptWalletErrors.WALLET_REPLACE_FAILURE
  }
}

/**
 * Builds a success response.
 * @param wallet
 */
function buildSuccessResponse(wallet: Wallet): EncryptWalletResponse {
  return {
    kind: "SUCCESS",
    wallet
  }
}

/**
 * Builds an error response.
 * @param error
 */
function buildErrorResponse(error: t.LiteralType<EncryptWalletError["error"]>):
  EncryptWalletResponse {

  return {
    kind: "ERROR",
    error: error.value
  }
}

/**
 * Encodes a response as JsonSerializable.
 * @param response
 */
function encodeResponse(response: EncryptWalletResponse): JsonSerializable {
  return asObject(response, EncryptWalletResponse)
}

/**
 * Generate a new wallet.
 * @param system
 * @param encryptWalletParams
 * @param unconsolidatedWallet
 */
function newWallet(unconsolidatedWallet: UnconsolidatedWallet, system: SubSystems): Wallet {

  const privateKey = newPrivateKey(unconsolidatedWallet.mnemonics)
  if (!unconsolidatedWallet.id) { throw encryptWalletErrors.INVALID_WALLET_ID }
  const walletInfo: WalletInfo = {
    id: unconsolidatedWallet.id,
    caption: unconsolidatedWallet.caption || newCaption(system)
  }
  const seed: Seed = {
    masterSecret: privateKey.key.bytes,
    chainCode: privateKey.chainCode
  }
  const seedInfo: Wip3SeedInfo = {
    kind: "Wip3",
    mnemonics: unconsolidatedWallet.mnemonics,
    seed
  }
  const extendedKey: ExtendedKey = {
    type: "private",
    key: privateKey.key.bytes,
    chainCode: privateKey.chainCode
  }
  const path = "m/3'/4919'/0'"
  const account = createAccount(path, extendedKey)

  return {
    ...walletInfo,
    seed: seedInfo,
    epochs: {
      last: 0,
      born: 0,
    },
    purpose: 0x80000003,
    accounts: [account]
  }
}

/**
 * Generate private key from mnemonics.
 * @param mnemonics
 */
function newPrivateKey(mnemonics: string): CryptoExtendedKey<PrivateKey.PrivateKey> {
  const {masterSecret, chainCode} = CryptoSeed.fromMnemonics(mnemonics)

  return PrivateKey.extend(PrivateKey.fromBytes(masterSecret), chainCode)
}

/**
 * Generate default caption.
 * @param {SubSystems} system
 * @returns {string}
 */
function newCaption(system: SubSystems): string {
  const index = system.appStateManager.state.wallets.length as number + 1

  return `Wallet #${index}`
}

/**
 * Create account.
 * @param keyPath
 * @param extendedKey
 */
function createAccount(keyPath: string, extendedKey: ExtendedKey): Account {
  const externalKeyChain = createKeyChain(`${keyPath}/0`)
  const internalKeyChain = createKeyChain(`${keyPath}/1`)
  // rad => retrieve, attest, deliver
  const radKeyChain = createKeyChain(`${keyPath}/2`)
  const keyChains = [externalKeyChain, internalKeyChain, radKeyChain]

  return AccountFactory.createAccount(asKeyPath(keyPath), keyChains)
}

/**
 * Create key chain.
 * @param keyPath
 */
function createKeyChain(keyPath: string): KeyChain {
  return AccountFactory.createKeyChain(asKeyPath(keyPath), [])
}

/**
 * Wrapper around asRuntimeType for KeyPath.
 * @param keyPath
 */
function asKeyPath(keyPath: string): KeyPath {
  return asRuntimeType(keyPath, KeyPath)
}

/**
 * Create a new wallet storage.
 * @param {EncryptWalletParams} params
 * @returns {Promise<JsonAesLevelStorage>}
 */
async function newWalletStorage(params: EncryptWalletParams): Promise<JsonAesLevelStorage> {
  try {
    const aesSettings: AesCipherSettings = {
      ...defaultAesCipherSettings,
      pbkdPassword: params.password
    }
    const connection = await getConnection(params.id)

    return new Storage(
      sha256BufferHasher,
      jsonBufferSerializer,
      new AesCipher(aesSettings),
      new LevelPersister(connection)
    )
  } catch {
    throw encryptWalletErrors.STORAGE_CREATION_FAILURE
  }
}

/**
 * Create a new connection to level db.
 * @param {string} id
 * @returns {Promise<levelup.LevelUp>}
 */
async function getConnection(id: string) {
  // Compose the absolute path of the LevelDB directory
  const dbPath = path.normalize(`${homedir()}/.sheikah/storage/${id}`)

  // Ensure the path exists
  await ensurePath(dbPath)

  // Create the LevelDB connection
  return level(dbPath, {
    keyEncoding: "binary",
    valueEncoding: "binary"
  })
}