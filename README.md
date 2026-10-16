# AgentTab

**Prepaid USDC tabs for AI-to-AI payments — built on Arc, deployed in Arc Studio.**

AgentTab lets a business open a prepaid USDC "tab" with a service provider so the provider's AI agent can bill per job, autonomously, within hard limits the business sets upfront. No approvals needed at charge time — the agent just calls `charge()` and the USDC moves instantly.

---

## What AgentTab Does

A business (payer) deposits USDC into a tab and configures:

| Parameter | What it controls |
|---|---|
| `maxPerCharge` | Maximum USDC a single job can cost |
| `dailyCap` | Maximum USDC the agent can spend in one calendar day |
| `expiry` | Optional deadline after which the tab stops accepting charges |
| `label` | Human-readable name for the tab |

The provider's AI agent calls `charge(tabId, amount, jobRef)`. The contract enforces every limit — if any check fails the transaction reverts and nothing moves. The business can `pause` the tab at any time as a kill switch. When a tab is closed (by either party), the entire remaining balance is refunded instantly to the payer.

### Key properties

- **No native ETH/gas token required** — fees are paid in USDC on Arc
- **Per-job receipts** — every charge emits a `Charged(tabId, provider, amount, jobRef, balanceAfter)` event with a free-form `jobRef` bytes32 for off-chain reconciliation
- **Daily cap resets automatically** — the contract tracks `dayIndex = block.timestamp / 1 days` and resets `spentToday` when the day rolls over
- **Instant refunds** — `closeTab()` transfers the remaining balance back to the payer in the same transaction
- **No admin, no upgrades** — the contract has zero owner functions; no one can change it after deployment

---

## Why Arc

Arc is Circle's EVM blockchain where **USDC is the native gas token** — there is no separate ETH-like asset to manage.

| Arc property | Why it matters for AgentTab |
|---|---|
| USDC as gas | Businesses and agents hold only USDC; no ETH top-ups to manage wallets |
| Sub-second finality | `charge()` settles in under one second — tight enough for synchronous AI agent workflows |
| Stable, predictable fees | Gas costs are denominated in USDC and do not spike with market volatility |
| EVM-compatible | Standard Solidity + wagmi/viem tooling, no custom SDKs |

---

## Contract

| Property | Value |
|---|---|
| Network | Arc Testnet (Chain ID: 5042002) |
| Address | `0xf52108362fa77e8a3800954df8d69dc9836d2393` |
| Explorer | https://explorer.testnet.arc.io/address/0xf52108362fa77e8a3800954df8d69dc9836d2393 |
| USDC | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Deploy block | 67,566,743 |

---

## Test Results

**64 / 64 tests passing** — zero failures.

Tests written with Foundry (Forge) and cover:

| Category | Tests |
|---|---|
| `openTab` input validation (zero deposit, zero addresses, bad limits, past expiry) | 8 |
| Happy path: open → charge → close with exact 6-decimal balances | 1 |
| Charge > `maxPerCharge` reverts | 1 |
| Charge > balance reverts | 1 |
| Daily cap blocks overspend; full reset after 1-day warp | 3 |
| Charge after expiry reverts | 1 |
| Paused tab rejects charge | 1 |
| Agent can pause but cannot unpause; payer can unpause; agent cannot close / topUp / updateLimits | 6 |
| Only provider can charge (payer / agent / stranger all revert) | 3 |
| `closeTab`: exact refund, sets `open = false`, blocks further charges | 3 |
| `topUp`, `updateLimits`, `remainingToday` coverage | 11 |
| Fuzz: balance never negative, `spentToday` never exceeds `dailyCap` | 3 × 256 runs |
| Invariants: `totalCharged` conservation, contract balance coverage, dailyCap | 3 × 128 000 call sequences |

Run them yourself:

```bash
cd contracts
forge test -vv
```

---

## Built in Arc Studio

This entire project — Solidity contract, security audit, Foundry test suite, and React frontend — was built in a single Arc Studio session using natural-language prompts. No manual Solidity editing, no local Hardhat setup, no deployment scripts written by hand.

Arc Studio is Circle's onchain app builder: describe what you want, and it writes, audits, tests, and deploys the contract, then wires the frontend to it.

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Foundry](https://getfoundry.sh) (for contract work)
- A wallet browser extension (MetaMask, Rabby, etc.) connected to Arc Testnet

### Arc Testnet RPC

| Field | Value |
|---|---|
| Network name | Arc Testnet |
| RPC URL | https://rpc.testnet.arc.io |
| Chain ID | 5042002 |
| Currency symbol | USDC |
| Block explorer | https://explorer.testnet.arc.io |

Add this network to your wallet, then get testnet USDC from the [Arc Studio sidebar](https://studio.arc.io) ("Get test USDC" button).

### Run the frontend

```bash
bun install
bun run dev
```

Open http://localhost:5173.

### Run contract tests

```bash
cd contracts   # or: bun run contracts:test from the project root
forge test -vv
```

### Build for production

```bash
bunx vite build
```

Output is in `dist/`.

---

## Project Structure

```
contracts/
  AgentTab.sol              # Main contract
  test/AgentTab.t.sol       # Foundry test suite (64 tests)
  test-helpers/MockERC20.sol
src/
  contracts/agentTab.ts     # ABI, address, deploy block, chain config
  components/
    BusinessTab.tsx         # Payer UI: open/top-up/pause/close tabs + charge history
    ProviderTab.tsx         # Provider UI: bill jobs, total earnings, charge history
    AgentDemo.tsx           # Live demo: freight quote agent charges 0.05 USDC onchain
  lib/
    fetchEvents.ts          # Chunked getLogs scanner (deploy block → latest)
    format.ts               # USDC formatting, address shortening, jobRef codec
    tabStatus.ts            # Tab status derivation (Active/Paused/Expired/Closed)
```

## Security

- OpenZeppelin `SafeERC20` and `ReentrancyGuard`
- Checks-effects-interactions throughout
- No admin, owner, or upgrade functions
- Custom errors (gas-efficient)
- Audited (balanced severity) — zero material findings

## License

MIT
