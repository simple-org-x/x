import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import type { RewardPool, MockERC20 } from "../typechain-types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MATCH_ID = ethers.id("match-1");
const ENTRY_FEE = ethers.parseEther("0.1");
const MAX_PLAYERS = 4;

const SETTLEMENT_TYPES = {
  Settlement: [
    { name: "matchId", type: "bytes32" },
    { name: "winners", type: "address[]" },
    { name: "shares", type: "uint256[]" },
  ],
};

async function signSettlement(
  pool: RewardPool,
  signer: HardhatEthersSigner,
  matchId: string,
  winners: string[],
  shares: bigint[]
): Promise<string> {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "CryptoArenaSurvivors.RewardPool",
    version: "1",
    chainId: Number(network.chainId),
    verifyingContract: await pool.getAddress(),
  };
  return signer.signTypedData(domain, SETTLEMENT_TYPES, {
    matchId,
    winners,
    shares,
  });
}

describe("RewardPool", () => {
  let pool: RewardPool;
  let admin: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let player1: HardhatEthersSigner;
  let player2: HardhatEthersSigner;
  let player3: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  beforeEach(async () => {
    [admin, signer, player1, player2, player3, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("RewardPool");
    pool = (await Factory.deploy(admin.address, signer.address)) as unknown as RewardPool;
    await pool.waitForDeployment();
  });

  describe("createMatch", () => {
    it("creates a native-asset match and emits MatchCreated", async () => {
      await expect(
        pool
          .connect(admin)
          .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS)
      )
        .to.emit(pool, "MatchCreated")
        .withArgs(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);

      const m = await pool.getMatch(MATCH_ID);
      expect(m.token).to.equal(ZERO_ADDRESS);
      expect(m.entryFee).to.equal(ENTRY_FEE);
      expect(m.maxPlayers).to.equal(MAX_PLAYERS);
      expect(m.deposits).to.equal(0);
      expect(m.pool).to.equal(0n);
      expect(m.settled).to.equal(false);
    });

    it("reverts when a non-admin tries to create a match", async () => {
      await expect(
        pool
          .connect(outsider)
          .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS)
      ).to.be.revertedWithCustomError(pool, "AccessControlUnauthorizedAccount");
    });

    it("reverts on duplicate matchId", async () => {
      await pool
        .connect(admin)
        .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);
      await expect(
        pool
          .connect(admin)
          .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS)
      ).to.be.revertedWithCustomError(pool, "MatchAlreadyExists");
    });
  });

  describe("deposit (native)", () => {
    beforeEach(async () => {
      await pool
        .connect(admin)
        .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);
    });

    it("accepts a deposit equal to the entry fee and emits Deposited", async () => {
      await expect(pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE }))
        .to.emit(pool, "Deposited")
        .withArgs(MATCH_ID, player1.address, ENTRY_FEE);

      const m = await pool.getMatch(MATCH_ID);
      expect(m.deposits).to.equal(1);
      expect(m.pool).to.equal(ENTRY_FEE);
      expect(await pool.hasDeposited(MATCH_ID, player1.address)).to.equal(true);
    });

    it("reverts when msg.value does not match the entry fee", async () => {
      await expect(
        pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE - 1n })
      ).to.be.revertedWithCustomError(pool, "WrongFee");
      await expect(
        pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE + 1n })
      ).to.be.revertedWithCustomError(pool, "WrongFee");
    });

    it("reverts when the same player deposits twice", async () => {
      await pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE });
      await expect(
        pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE })
      ).to.be.revertedWithCustomError(pool, "AlreadyDeposited");
    });

    it("reverts when the match is full", async () => {
      const SMALL_ID = ethers.id("match-small");
      await pool.connect(admin).createMatch(SMALL_ID, ZERO_ADDRESS, ENTRY_FEE, 2);
      await pool.connect(player1).deposit(SMALL_ID, { value: ENTRY_FEE });
      await pool.connect(player2).deposit(SMALL_ID, { value: ENTRY_FEE });
      await expect(
        pool.connect(player3).deposit(SMALL_ID, { value: ENTRY_FEE })
      ).to.be.revertedWithCustomError(pool, "MatchFull");
    });
  });

  describe("deposit (ERC-20)", () => {
    let token: MockERC20;
    const TOKEN_FEE = ethers.parseUnits("10", 18);
    const ERC20_MATCH_ID = ethers.id("match-erc20");

    beforeEach(async () => {
      const Mock = await ethers.getContractFactory("MockERC20");
      token = (await Mock.deploy("Mock", "MCK")) as unknown as MockERC20;
      await token.waitForDeployment();

      await pool
        .connect(admin)
        .createMatch(ERC20_MATCH_ID, await token.getAddress(), TOKEN_FEE, 2);

      await token.mint(player1.address, TOKEN_FEE);
      await token.connect(player1).approve(await pool.getAddress(), TOKEN_FEE);
    });

    it("pulls ERC-20 fees and rejects native value", async () => {
      await expect(
        pool.connect(player1).deposit(ERC20_MATCH_ID, { value: 1n })
      ).to.be.revertedWithCustomError(pool, "NativeNotAccepted");

      await expect(pool.connect(player1).deposit(ERC20_MATCH_ID))
        .to.emit(pool, "Deposited")
        .withArgs(ERC20_MATCH_ID, player1.address, TOKEN_FEE);

      expect(await token.balanceOf(await pool.getAddress())).to.equal(TOKEN_FEE);
    });
  });

  describe("settle / withdraw", () => {
    beforeEach(async () => {
      await pool
        .connect(admin)
        .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);
      await pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE });
      await pool.connect(player2).deposit(MATCH_ID, { value: ENTRY_FEE });
    });

    it("settles with a valid EIP-712 signature and pays out via withdraw", async () => {
      const winners = [player1.address, player2.address];
      const shares = [ENTRY_FEE + ENTRY_FEE / 2n, ENTRY_FEE / 2n];
      const sig = await signSettlement(pool, signer, MATCH_ID, winners, shares);

      await expect(pool.connect(outsider).settle(MATCH_ID, winners, shares, sig))
        .to.emit(pool, "Settled")
        .withArgs(MATCH_ID, winners, shares);

      expect(await pool.withdrawable(MATCH_ID, player1.address)).to.equal(shares[0]);
      expect(await pool.withdrawable(MATCH_ID, player2.address)).to.equal(shares[1]);

      const before = await ethers.provider.getBalance(player1.address);
      const tx = await pool.connect(player1).withdraw(MATCH_ID);
      const rcpt = await tx.wait();
      const gasCost = rcpt!.gasUsed * rcpt!.gasPrice;
      const after = await ethers.provider.getBalance(player1.address);
      expect(after - before + gasCost).to.equal(shares[0]);

      await expect(pool.connect(player1).withdraw(MATCH_ID))
        .to.be.revertedWithCustomError(pool, "NothingToWithdraw");
    });

    it("rejects a signature from a non-SIGNER_ROLE signer", async () => {
      const winners = [player1.address];
      const shares = [ENTRY_FEE * 2n];
      const sig = await signSettlement(pool, outsider, MATCH_ID, winners, shares);

      await expect(
        pool.connect(outsider).settle(MATCH_ID, winners, shares, sig)
      ).to.be.revertedWithCustomError(pool, "InvalidSigner");
    });

    it("rejects a tampered signature", async () => {
      const winners = [player1.address];
      const shares = [ENTRY_FEE * 2n];
      const sig = await signSettlement(pool, signer, MATCH_ID, winners, shares);
      const tampered = sig.slice(0, -2) + (sig.endsWith("00") ? "01" : "00");

      await expect(
        pool.connect(outsider).settle(MATCH_ID, winners, shares, tampered)
      ).to.be.reverted; // could be ECDSAInvalidSignature or InvalidSigner
    });

    it("reverts when sum(shares) != pool", async () => {
      const winners = [player1.address];
      const shares = [ENTRY_FEE]; // pool is 2 * ENTRY_FEE
      const sig = await signSettlement(pool, signer, MATCH_ID, winners, shares);

      await expect(
        pool.connect(outsider).settle(MATCH_ID, winners, shares, sig)
      ).to.be.revertedWithCustomError(pool, "ShareSumMismatch");
    });

    it("reverts on double-settle", async () => {
      const winners = [player1.address];
      const shares = [ENTRY_FEE * 2n];
      const sig = await signSettlement(pool, signer, MATCH_ID, winners, shares);

      await pool.connect(outsider).settle(MATCH_ID, winners, shares, sig);
      await expect(
        pool.connect(outsider).settle(MATCH_ID, winners, shares, sig)
      ).to.be.revertedWithCustomError(pool, "MatchAlreadySettled");
    });

    it("reverts on length mismatch and empty winners", async () => {
      const sig = await signSettlement(pool, signer, MATCH_ID, [], []);
      await expect(
        pool.connect(outsider).settle(MATCH_ID, [], [], sig)
      ).to.be.revertedWithCustomError(pool, "EmptyWinners");

      const winners = [player1.address];
      const shares = [ENTRY_FEE, ENTRY_FEE];
      const sig2 = await signSettlement(pool, signer, MATCH_ID, winners, shares);
      await expect(
        pool.connect(outsider).settle(MATCH_ID, winners, shares, sig2)
      ).to.be.revertedWithCustomError(pool, "LengthMismatch");
    });
  });

  describe("adminSweep", () => {
    beforeEach(async () => {
      await pool
        .connect(admin)
        .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);
      await pool.connect(player1).deposit(MATCH_ID, { value: ENTRY_FEE });
      const winners = [player1.address];
      const shares = [ENTRY_FEE];
      const sig = await signSettlement(pool, signer, MATCH_ID, winners, shares);
      await pool.connect(outsider).settle(MATCH_ID, winners, shares, sig);
      // Player never withdraws -> dust stays in the contract.
    });

    it("reverts before SWEEP_DELAY has elapsed", async () => {
      await expect(
        pool.connect(admin).adminSweep(MATCH_ID, admin.address)
      ).to.be.revertedWithCustomError(pool, "SweepTooEarly");
    });

    it("transfers the residual balance to `to` after SWEEP_DELAY", async () => {
      const sweepDelay = await pool.SWEEP_DELAY();
      await time.increase(Number(sweepDelay) + 1);

      const beforeBal = await ethers.provider.getBalance(outsider.address);
      await pool.connect(admin).adminSweep(MATCH_ID, outsider.address);
      const afterBal = await ethers.provider.getBalance(outsider.address);
      expect(afterBal - beforeBal).to.equal(ENTRY_FEE);
    });

    it("reverts for non-admin callers", async () => {
      const sweepDelay = await pool.SWEEP_DELAY();
      await time.increase(Number(sweepDelay) + 1);
      await expect(
        pool.connect(outsider).adminSweep(MATCH_ID, outsider.address)
      ).to.be.revertedWithCustomError(pool, "AccessControlUnauthorizedAccount");
    });
  });

  describe("EIP-712 helpers", () => {
    it("exposes the configured domain separator and digest", async () => {
      await pool
        .connect(admin)
        .createMatch(MATCH_ID, ZERO_ADDRESS, ENTRY_FEE, MAX_PLAYERS);
      const winners = [player1.address];
      const shares = [ENTRY_FEE];

      const onChain = await pool.settlementDigest(MATCH_ID, winners, shares);
      const network = await ethers.provider.getNetwork();
      const offChain = ethers.TypedDataEncoder.hash(
        {
          name: "CryptoArenaSurvivors.RewardPool",
          version: "1",
          chainId: Number(network.chainId),
          verifyingContract: await pool.getAddress(),
        },
        SETTLEMENT_TYPES,
        { matchId: MATCH_ID, winners, shares }
      );
      expect(onChain).to.equal(offChain);
    });
  });
});
