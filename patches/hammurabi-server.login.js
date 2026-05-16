"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEthereumUserAccount = exports.createIdentityFromPrivateKey = exports.loginFromPrivateKey = exports.createGuestIdentity = exports.loginUsingEthereumProvider = exports.explorerIdentityFromEphemeralIdentity = exports.loginAsGuest = void 0;
const crypto_1 = require("@dcl/crypto/dist/crypto");
const _secp256k1Mod = __importStar(require("ethereum-cryptography/secp256k1"));
const secp256k1 = _secp256k1Mod.secp256k1 || _secp256k1Mod;
const eth_connect_1 = require("eth-connect");
const crypto_2 = require("@dcl/crypto");
const ephemeralLifespanMinutes = 10000;
// this function creates a Decentraland AuthChain using an unsafe in-memory ephemeral
// private key
async function loginAsGuest() {
    // real account
    const account = (0, crypto_1.createUnsafeIdentity)();
    async function signer(message) {
        return crypto_2.Authenticator.createSignature(account, message);
    }
    return identityFromSigner(account.address, signer, true);
}
exports.loginAsGuest = loginAsGuest;
// this function creates a signer (ExplorerIdentity) based on a ephemeral identity
function explorerIdentityFromEphemeralIdentity(storeIdentity) {
    const ephemeralPrivateKey = (0, eth_connect_1.hexToBytes)(storeIdentity.ephemeralIdentity.privateKey);
    // remove heading 0x04
    const publicKey = secp256k1.getPublicKey(ephemeralPrivateKey, false).slice(1);
    const ephemeralAddress = (0, crypto_1.computeAddress)(publicKey);
    const account = {
        privateKey: (0, eth_connect_1.bytesToHex)(ephemeralPrivateKey),
        publicKey: (0, eth_connect_1.bytesToHex)(publicKey),
        address: ephemeralAddress
    };
    if (account.address.toLowerCase() !== storeIdentity.ephemeralIdentity.address.toLowerCase())
        throw new Error('Invalid ephemeral identity (address)');
    if (account.publicKey.toLowerCase() !== storeIdentity.ephemeralIdentity.publicKey.toLowerCase())
        throw new Error('Invalid ephemeral identity (publicKey)');
    if (storeIdentity.authChain[0].type !== 'SIGNER')
        throw new Error('Invalid auth chain, must block should be a signer');
    const signerAddress = storeIdentity.authChain[0].payload;
    // TODO: check whether the authChain corresponds to this ephemeral key
    async function signer(message) {
        return crypto_2.Authenticator.createSignature(account, message);
    }
    return {
        address: signerAddress,
        signer,
        authChain: storeIdentity,
        isGuest: storeIdentity.isGuest
    };
}
exports.explorerIdentityFromEphemeralIdentity = explorerIdentityFromEphemeralIdentity;
// this function creates a Decentraland AuthChain using a provider (like metamask)
async function loginUsingEthereumProvider(provider) {
    const requestManager = new eth_connect_1.RequestManager(provider);
    const address = await getEthereumUserAccount(requestManager, false);
    if (!address)
        throw new Error("Couldn't get an address from the Ethereum provider");
    async function signer(message) {
        while (true) {
            const result = await requestManager.personal_sign(message, address, '');
            if (!result)
                continue;
            return result;
        }
    }
    return identityFromSigner(address, signer, false);
}
exports.loginUsingEthereumProvider = loginUsingEthereumProvider;
// this function creates a Decentraland AuthChain using a signer function.
// the signer function is only used once, to sign the ephemeral private key. after that,
// the ephemeral private key is used to sign the rest of the authChain and subsequent
// messages. this is a good way to not over-expose the real user accounts to excessive
// signing requests.
async function identityFromSigner(address, signer, isGuest) {
    const ephemeral = (0, crypto_1.createUnsafeIdentity)();
    const authChain = await crypto_2.Authenticator.initializeAuthChain(address, ephemeral, ephemeralLifespanMinutes, signer);
    return {
        ...authChain,
        isGuest
    };
}
async function createGuestIdentity() {
    const storeableIdentity = await loginAsGuest();
    return explorerIdentityFromEphemeralIdentity(storeableIdentity);
}
exports.createGuestIdentity = createGuestIdentity;
async function loginFromPrivateKey(privateKey) {
    const privateKeyBytes = (0, eth_connect_1.hexToBytes)(privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey);
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, false).slice(1);
    const address = (0, crypto_1.computeAddress)(publicKey);
    const account = {
        privateKey: (0, eth_connect_1.bytesToHex)(privateKeyBytes),
        publicKey: (0, eth_connect_1.bytesToHex)(publicKey),
        address
    };
    async function signer(message) {
        return crypto_2.Authenticator.createSignature(account, message);
    }
    return identityFromSigner(account.address, signer, false);
}
exports.loginFromPrivateKey = loginFromPrivateKey;
async function createIdentityFromPrivateKey(privateKey) {
    const storeableIdentity = await loginFromPrivateKey(privateKey);
    return explorerIdentityFromEphemeralIdentity(storeableIdentity);
}
exports.createIdentityFromPrivateKey = createIdentityFromPrivateKey;
async function getEthereumUserAccount(requestManager, returnChecksum) {
    try {
        const accounts = await requestManager.eth_accounts();
        if (!accounts || accounts.length === 0) {
            return undefined;
        }
        return returnChecksum ? accounts[0] : accounts[0].toLowerCase();
    }
    catch (error) {
        throw new Error(`Could not access eth_accounts: "${error.message}"`);
    }
}
exports.getEthereumUserAccount = getEthereumUserAccount;
//# sourceMappingURL=login.js.map