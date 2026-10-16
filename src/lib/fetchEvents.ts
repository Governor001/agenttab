/**
 * Shared event-fetching utilities for AgentTab.
 *
 * Scans from AGENT_TAB_DEPLOY_BLOCK to the current head in LOG_CHUNK_SIZE-block
 * windows so no history is lost even if the RPC caps range size.
 */

import type { PublicClient } from 'viem'
import {
  AGENT_TAB_ADDRESS,
  AGENT_TAB_DEPLOY_BLOCK,
  LOG_CHUNK_SIZE,
} from '../contracts/agentTab'

// ── Charged event ABI (inline to avoid importing the full ABI) ───────────────
const CHARGED_EVENT = {
  type: 'event' as const,
  name: 'Charged',
  inputs: [
    { name: 'tabId',       type: 'uint256', indexed: true  },
    { name: 'provider',    type: 'address', indexed: true  },
    { name: 'amount',      type: 'uint256', indexed: false },
    { name: 'jobRef',      type: 'bytes32', indexed: true  },
    { name: 'balanceAfter',type: 'uint256', indexed: false },
  ],
}

export interface ChargedEvent {
  tabId:        bigint
  provider:     `0x${string}`
  amount:       bigint
  jobRef:       `0x${string}`
  balanceAfter: bigint
  blockNumber:  bigint
  txHash:       string
}

/**
 * Fetch all Charged events for the AgentTab contract from the deployment block
 * to the current head, chunking requests into LOG_CHUNK_SIZE-block windows.
 *
 * Optionally filter by tabId and/or provider address.
 */
export async function fetchAllChargedEvents(
  publicClient: PublicClient,
  opts: {
    tabId?:    bigint
    provider?: `0x${string}`
    onProgress?: (scanned: bigint, total: bigint) => void
  } = {},
): Promise<ChargedEvent[]> {
  const head = await publicClient.getBlockNumber()
  const start = AGENT_TAB_DEPLOY_BLOCK

  if (head < start) return []

  const total = head - start + 1n
  const results: ChargedEvent[] = []

  for (let from = start; from <= head; from += LOG_CHUNK_SIZE) {
    const to = from + LOG_CHUNK_SIZE - 1n < head ? from + LOG_CHUNK_SIZE - 1n : head

    const args: Record<string, bigint | `0x${string}`> = {}
    if (opts.tabId !== undefined) args.tabId = opts.tabId
    if (opts.provider !== undefined) args.provider = opts.provider

    const logs = await publicClient.getLogs({
      address: AGENT_TAB_ADDRESS,
      event: CHARGED_EVENT,
      args,
      fromBlock: from,
      toBlock: to,
    })

    for (const log of logs) {
      const a = log.args as {
        tabId?: bigint
        provider?: `0x${string}`
        amount?: bigint
        jobRef?: `0x${string}`
        balanceAfter?: bigint
      }
      results.push({
        tabId:        a.tabId        ?? 0n,
        provider:     a.provider     ?? '0x',
        amount:       a.amount       ?? 0n,
        jobRef:       a.jobRef       ?? '0x',
        balanceAfter: a.balanceAfter ?? 0n,
        blockNumber:  log.blockNumber ?? 0n,
        txHash:       log.transactionHash ?? '',
      })
    }

    opts.onProgress?.(to - start + 1n, total)
  }

  return results
}
