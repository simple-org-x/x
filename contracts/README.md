# contracts/

Hardhat project for the EVM smart contracts powering optional on-chain
features of Crypto Arena Survivors. This package is an npm workspace. It
hosts three contracts: `RewardPool.sol` (tournament prize pool), `CosmeticNFT.sol`
(ERC-1155 cosmetic skins, deliberately stat-free to keep the game free of
pay-to-win effects), and `TournamentEscrow.sol` (escrow for tournament entry
fees and payouts). Tests live under `contracts/test/` and run via Hardhat's
built-in Mocha runner. Real implementation lands in FEAT-004.
