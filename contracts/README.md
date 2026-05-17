# contracts/

Hardhat project for the EVM smart contracts that power the optional
on-chain features of **Crypto Arena Survivors**. This package is an
npm workspace; it builds and tests with the standard Hardhat
toolbox (Solidity 0.8.24, ethers v6, Mocha + Chai).

The project ships three contracts:

| Contract | Purpose |
| --- | --- |
| `RewardPool.sol` | Holds match entry fees and pays out winners after a server-signed settlement. |
| `CosmeticNFT.sol` | ERC-1155 collection of cosmetic-only items (skins, emotes, kill animations, visual effects). **Stat-free by design.** |
| `TournamentEscrow.sol` | Holds tournament entry fees until a server-signed final ranking is submitted. |

## Layout

```
contracts/
├── contracts/                 # Solidity sources
│   ├── RewardPool.sol
│   ├── CosmeticNFT.sol
│   ├── TournamentEscrow.sol
│   └── test/MockERC20.sol     # used only by the test suite
├── test/                      # TypeScript Mocha + Chai tests
├── scripts/deploy.ts          # local-only deployment script
├── hardhat.config.ts
├── tsconfig.json
└── package.json
```

## Roles per contract

### RewardPool

| Role | Granted to | Capabilities |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | constructor `admin` | grant/revoke other roles |
| `ADMIN_ROLE` | constructor `admin` | `createMatch`, `adminSweep` (after `SWEEP_DELAY`) |
| `SIGNER_ROLE` | constructor `signer` (off-chain match runner) | sign EIP-712 settlement payloads |

`deposit`, `settle`, and `withdraw` are permissionless: any address may
submit a deposit (paying the entry fee) or call `settle` once a valid
signature is in hand. `withdraw` only pays the caller and only what
they are owed.

### CosmeticNFT

| Role | Granted to | Capabilities |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | constructor `admin` | grant/revoke other roles |
| `MINTER_ROLE` | constructor `admin` (re-grantable) | `mint`, `mintBatch` |
| `URI_SETTER_ROLE` | constructor `admin` (re-grantable) | `setBaseURI`, `setTokenURI` |

Token ids are partitioned into four categories, stored on-chain as the
`keccak256` of the category name:

```
CATEGORY_SKIN            = keccak256("skin")
CATEGORY_EMOTE           = keccak256("emote")
CATEGORY_KILL_ANIMATION  = keccak256("kill_animation")
CATEGORY_VISUAL_EFFECT   = keccak256("visual_effect")
```

The first mint of an id locks in its category; subsequent mints of the
same id must pass the same category or revert with `CategoryMismatch`.

### TournamentEscrow

| Role | Granted to | Capabilities |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | constructor `admin` | grant/revoke other roles |
| `ADMIN_ROLE` | constructor `admin` | `createTournament` |
| `SIGNER_ROLE` | constructor `signer` (off-chain runner) | sign EIP-712 finalisation payloads |

`enter`, `finalize`, and `claim` are permissionless once a tournament
is open / a valid signature exists.

## Anti pay-to-win invariant (CosmeticNFT)

The brief forbids any stat-affecting on-chain power. `CosmeticNFT.sol`
encodes this invariant in NatSpec at the top of the contract, verbatim:

> This contract MUST NOT and DOES NOT confer any in-game stat advantage. It exists solely for cosmetic ownership.

Two automated checks enforce this:

1. **Source assertion** in `CosmeticNFT.test.ts` greps the `.sol` file
   for the exact sentence above. A future refactor that drops the
   comment fails the suite.
2. **ABI meta-test** in `CosmeticNFT.test.ts` walks every function
   fragment in the compiled ABI and asserts none of the names match
   `/stat|damage|hp|power|boost/i`. Adding a setter for "power level"
   or similar will fail compilation tests, not just lint.

## EIP-712 server signatures

Both `RewardPool.settle` and `TournamentEscrow.finalize` accept an
EIP-712 typed-data signature produced off-chain by an address that
holds `SIGNER_ROLE`. This decouples the on-chain payout from the
on-chain match runner: any caller may submit the payout transaction,
but only the server can authorise the result.

### RewardPool

```
DOMAIN
  name:              "CryptoArenaSurvivors.RewardPool"
  version:           "1"
  chainId:           <network>
  verifyingContract: <RewardPool address>

primaryType: Settlement
types:
  Settlement:
    - matchId : bytes32
    - winners : address[]
    - shares  : uint256[]
```

The contract exposes `settlementDigest(matchId, winners, shares)`
returning the exact EIP-712 hash a signer should sign; tests use this
to cross-check the off-chain digest computed via
`ethers.TypedDataEncoder.hash`.

### TournamentEscrow

```
DOMAIN
  name:              "CryptoArenaSurvivors.TournamentEscrow"
  version:           "1"
  chainId:           <network>
  verifyingContract: <TournamentEscrow address>

primaryType: Finalization
types:
  Finalization:
    - tournamentId : bytes32
    - winners      : address[]
```

`finalizationDigest(tournamentId, winners)` returns the digest. The
`prizeShares` schedule is on-chain (set at `createTournament`), so the
server only needs to sign the rank-ordered winner list.

## Settlement invariants

* `RewardPool.settle` requires `sum(shares) == pool` exactly. Off-chain
  callers MUST handle integer-division dust (typical recipe: award the
  remainder to rank #1) before signing. This keeps on-chain accounting
  trivial and auditable.
* As a safety net, `RewardPool.adminSweep(matchId, to)` lets
  `ADMIN_ROLE` recover any residual balance after `SWEEP_DELAY`
  (30 days) has elapsed since settlement, e.g. when a winner has
  permanently lost their key. It cannot be invoked before settlement
  or before the delay, and only `ADMIN_ROLE` may call it.
* `TournamentEscrow.finalize` distributes `pool * prizeShares[i] /
  weightSum` per rank, with the rounding remainder awarded to the
  highest rank so `sum(payouts) == pool` always.
* All payouts are pull-based (`withdraw` / `claim`) so a malicious
  winner cannot grief the settlement transaction by reverting on a
  forced transfer.

## Build, test, deploy

From the repo root:

```sh
# Install deps for all workspaces (client + contracts)
npm install

# Compile all contracts and generate TypeChain types
npm -w contracts run compile

# Run the Mocha suite
npm -w contracts run test
```

You can also run the project Makefile, which calls the same scripts:

```sh
make build  # invokes `npm -w contracts run compile`
make test   # invokes `npm -w contracts run test`
```

### Local deployment

In one terminal start an in-memory chain:

```sh
npx hardhat node    # listens on http://127.0.0.1:8545, chainId 31337
```

In another terminal deploy the three contracts and dump addresses to
`contracts/deployments/localhost.json`:

```sh
npm -w contracts run deploy:local
```

You can override the admin / signer addresses or the cosmetic base URI
via env vars:

```sh
ADMIN_ADDRESS=0x...  SIGNER_ADDRESS=0x...  COSMETIC_BASE_URI=ipfs://my-cid/  \
  npm -w contracts run deploy:local
```

`deployments/` is gitignored. **No live-network deployment is provided
here**; production deploys are a downstream concern.
