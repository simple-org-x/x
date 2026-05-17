import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

/**
 * Hardhat configuration for Crypto Arena Survivors.
 *
 * Solidity 0.8.24 with the standard optimizer settings (200 runs) so
 * deployment costs stay predictable. The default network is the
 * in-process Hardhat EVM; `localhost` points at a developer-run node
 * (`npx hardhat node`).
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
  mocha: {
    timeout: 60_000,
  },
};

export default config;
