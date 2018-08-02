import { Wallet, CURRENT_WALLET_VERSION } from "app/common/runtimeTypes/storage/wallets"
import { EncryptWalletParams } from "app/common/runtimeTypes/ipc/wallets"
import { WalletStorage } from "app/main/subsystems/wallets"
import { JsonSerializable } from "app/common/serializers/json"
import { AesCipher, AesCipherSettings, defaultAesCipherSettings } from "app/main/ciphers/aes"
import { InMemoryPersister } from "app/main/persisters/inMemory"
import { jsonBufferSerializer } from "app/main/serializers/jsonBuffer"
import { Storage } from "app/main/storage"
import { sha256BufferHasher } from "app/main/hashers/sha256Buffer"
import { AppStateManager } from "app/main/appState"
import { AppStateS, WalletStorageS } from "app/main/system"

export const walletParams: EncryptWalletParams = {
  id: "42",
  caption: "Hello World",
  password: "abc123"
}
export const defaultMnemonics =
  "gun illegal rough meat planet public weasel pact pipe few bitter burst arm good choice"

export const wallet: Wallet = {
  _v: CURRENT_WALLET_VERSION,
  // walletInfo
  id: "42",
  caption: "Hello World",
  // SeedInfo
  seed: {
    kind: "Wip3",
    mnemonics: defaultMnemonics,
    seed: {
      chainCode: Buffer.from(
        [152, 8, 159, 246, 221, 27, 159, 171, 139, 98, 82, 232, 229, 140, 201, 2, 78, 113, 141, 104,
          187, 192, 191, 147, 91, 108, 192, 174, 214, 251, 100, 79]),
      masterSecret: Buffer.from(
        [196, 188, 49, 56, 180, 80, 166, 118, 177, 247, 66, 74, 173, 113, 48, 127, 194, 4, 164, 0,
          70, 14, 21, 211, 113, 209, 238, 121, 124, 251, 139, 168]),
    },
  },
  // EpochsInfo
  epochs: {
    last: 0,
    born: 0,
  },
  purpose: 0x80000003,
  // [Accounts]
  accounts: [
    {
      balance: 0,
      keyChains: [
        { finalKeys: [], keyPath: [2147483651, 2147488567, 2147483648, 0] },
        { finalKeys: [], keyPath: [2147483651, 2147488567, 2147483648, 1] },
        { finalKeys: [], keyPath: [2147483651, 2147488567, 2147483648, 2] }
      ],
      keyPath: [2147483651, 2147488567, 2147483648]
    }
  ],
}

/// helpers
/** create inmemory storage */
export async function inMemoryStorage(args: any):
  Promise<Storage<Buffer, JsonSerializable, Buffer, Buffer>> {

  const pbkdPassword = "password"
  const aesSettings: AesCipherSettings = {
    ...defaultAesCipherSettings,
    pbkdPassword
  }
  const keyHasher = sha256BufferHasher
  const serializer = jsonBufferSerializer
  const cipher = new AesCipher(aesSettings)
  const backend = new InMemoryPersister()

  return new Storage(keyHasher, serializer, cipher, backend)
}

/** Build error message */
export function buildError(error: string) {
  return {
    kind: "ERROR",
    error
  }
}

/** system factory */
export function systemFactory(mnemonics?: string): AppStateS & WalletStorageS {
  return {
    appStateManager: new AppStateManager({
      unconsolidatedWallet: {
        mnemonics: mnemonics || defaultMnemonics,
        id: walletParams.id
      }
    }),
    walletStorage: new WalletStorage(),
    storageFactory: inMemoryStorage
  }
}