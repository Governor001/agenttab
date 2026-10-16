/**
 * AgentTab contract configuration.
 *
 * To switch to Arc mainnet:
 *   1. Change AGENT_TAB_CHAIN to the Arc mainnet chain object (chain ID: 5042)
 *      RPC: https://rpc.mainnet.arc.io  Explorer: https://explorer.arc.io
 *   2. Change AGENT_TAB_ADDRESS to the mainnet deployment address
 *   3. Change AGENT_TAB_DEPLOY_BLOCK to the mainnet deployment block
 *   4. Update src/config.ts to include the Arc mainnet chain
 */

import { arcTestnet } from 'viem/chains'

// ── Network config ──────────────────────────────────────────────────────────
export const AGENT_TAB_CHAIN = arcTestnet
export const AGENT_TAB_CHAIN_ID = arcTestnet.id // 5042002

// ── Contract address ─────────────────────────────────────────────────────────
export const AGENT_TAB_ADDRESS = '0xf52108362fa77e8a3800954df8d69dc9836d2393' as const

// ── Deployment block (Arc Testnet) ────────────────────────────────────────────
// Used as the fromBlock for all event scans so no history is missed.
// To switch to Arc mainnet, update this to the mainnet deployment block.
export const AGENT_TAB_DEPLOY_BLOCK = 67566743n

// ── Event scan chunk size ─────────────────────────────────────────────────────
// Arc Testnet RPC accepts up to 10 000 blocks per eth_getLogs request.
export const LOG_CHUNK_SIZE = 10_000n

// ── USDC on Arc Testnet ──────────────────────────────────────────────────────
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6

// ── Explorer ─────────────────────────────────────────────────────────────────
export const EXPLORER_BASE = 'https://explorer.testnet.arc.io'
export const txUrl = (hash: string) => `${EXPLORER_BASE}/tx/${hash}`
export const addrUrl = (addr: string) => `${EXPLORER_BASE}/address/${addr}`

// ── ABI ──────────────────────────────────────────────────────────────────────
export const AGENT_TAB_ABI = [
  {
    type: 'function', name: 'openTab', stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'agent', type: 'address' },
      { name: 'deposit', type: 'uint256' },
      { name: 'maxPerCharge', type: 'uint256' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'label', type: 'string' },
    ],
    outputs: [{ name: 'tabId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'topUp', stateMutability: 'nonpayable',
    inputs: [{ name: 'tabId', type: 'uint256' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function', name: 'charge', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tabId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'jobRef', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'setPaused', stateMutability: 'nonpayable',
    inputs: [{ name: 'tabId', type: 'uint256' }, { name: 'paused', type: 'bool' }],
    outputs: [],
  },
  {
    type: 'function', name: 'updateLimits', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tabId', type: 'uint256' },
      { name: 'maxPerCharge', type: 'uint256' },
      { name: 'dailyCap', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'closeTab', stateMutability: 'nonpayable',
    inputs: [{ name: 'tabId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function', name: 'getTab', stateMutability: 'view',
    inputs: [{ name: 'tabId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'payer', type: 'address' },
        { name: 'agent', type: 'address' },
        { name: 'provider', type: 'address' },
        { name: 'balance', type: 'uint256' },
        { name: 'maxPerCharge', type: 'uint256' },
        { name: 'dailyCap', type: 'uint256' },
        { name: 'spentToday', type: 'uint256' },
        { name: 'dayIndex', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'totalCharged', type: 'uint256' },
        { name: 'chargeCount', type: 'uint256' },
        { name: 'paused', type: 'bool' },
        { name: 'open', type: 'bool' },
        { name: 'label', type: 'string' },
      ],
    }],
  },
  {
    type: 'function', name: 'tabsByPayer', stateMutability: 'view',
    inputs: [{ name: 'payer', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function', name: 'tabsByProvider', stateMutability: 'view',
    inputs: [{ name: 'provider', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function', name: 'remainingToday', stateMutability: 'view',
    inputs: [{ name: 'tabId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'tabCount', stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Events
  {
    type: 'event', name: 'Charged', anonymous: false,
    inputs: [
      { name: 'tabId', type: 'uint256', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'jobRef', type: 'bytes32', indexed: true },
      { name: 'balanceAfter', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'TabOpened', anonymous: false,
    inputs: [
      { name: 'tabId', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'agent', type: 'address', indexed: false },
      { name: 'deposit', type: 'uint256', indexed: false },
      { name: 'maxPerCharge', type: 'uint256', indexed: false },
      { name: 'dailyCap', type: 'uint256', indexed: false },
      { name: 'expiry', type: 'uint256', indexed: false },
      { name: 'label', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event', name: 'TabPaused', anonymous: false,
    inputs: [
      { name: 'tabId', type: 'uint256', indexed: true },
      { name: 'paused', type: 'bool', indexed: false },
      { name: 'by', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event', name: 'TabClosed', anonymous: false,
    inputs: [
      { name: 'tabId', type: 'uint256', indexed: true },
      { name: 'by', type: 'address', indexed: true },
      { name: 'refund', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'TabToppedUp', anonymous: false,
    inputs: [
      { name: 'tabId', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'newBalance', type: 'uint256', indexed: false },
    ],
  },
] as const
