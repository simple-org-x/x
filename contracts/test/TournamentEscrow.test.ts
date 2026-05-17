import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import type { TournamentEscrow } from "../typechain-types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TOURNEY_ID = ethers.id("tourney-1");
const ENTRY_FEE = ethers.parseEther("0.1");

const FINALIZATION_TYPES = {
  Finalization: [
    { name: "tournamentId", type: "bytes32" },
    { name: "winners", type: "address[]" },
  ],
};

async function signFinalization(
  escrow: TournamentEscrow,
  signer: HardhatEthersSigner,
  tournamentId: string,
  winners: string[]
): Promise<string> {
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "CryptoArenaSurvivors.TournamentEscrow",
    version: "1",
    chainId: Number(network.chainId),
    verifyingContract: await escrow.getAddress(),
  };
  return signer.signTypedData(domain, FINALIZATION_TYPES, {
    tournamentId,
    winners,
  });
}

describe("TournamentEscrow", () => {
  let escrow: TournamentEscrow;
  let admin: HardhatEthersSigner;
  let signer: HardhatEthersSigner;
  let p1: HardhatEthersSigner;
  let p2: HardhatEthersSigner;
  let p3: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  let startTime: number;

  beforeEach(async () => {
    [admin, signer, p1, p2, p3, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TournamentEscrow");
    escrow = (await Factory.deploy(admin.address, signer.address)) as unknown as TournamentEscrow;
    await escrow.waitForDeployment();

    startTime = (await time.latest()) + 1_000;
  });

  describe("createTournament", () => {
    it("creates a tournament and emits TournamentCreated", async () => {
      const shares = [60n, 30n, 10n];
      await expect(
        escrow
          .connect(admin)
          .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, shares)
      )
        .to.emit(escrow, "TournamentCreated")
        .withArgs(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, shares);

      const t = await escrow.getTournament(TOURNEY_ID);
      expect(t.entryFee).to.equal(ENTRY_FEE);
      expect(t.startTime).to.equal(BigInt(startTime));
      expect(t.entrants).to.equal(0);
      expect(t.finalized).to.equal(false);
      expect(await escrow.prizeShares(TOURNEY_ID)).to.deep.equal(shares);
    });

    it("reverts on duplicate id", async () => {
      const shares = [70n, 30n];
      await escrow
        .connect(admin)
        .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, shares);
      await expect(
        escrow
          .connect(admin)
          .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, shares)
      ).to.be.revertedWithCustomError(escrow, "TournamentAlreadyExists");
    });

    it("reverts when startTime is in the past", async () => {
      const past = (await time.latest()) - 1;
      await expect(
        escrow
          .connect(admin)
          .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, past, [100n])
      ).to.be.revertedWithCustomError(escrow, "InvalidStartTime");
    });

    it("reverts on empty prizeShares or zero total", async () => {
      await expect(
        escrow
          .connect(admin)
          .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, [])
      ).to.be.revertedWithCustomError(escrow, "EmptyPrizeShares");
      await expect(
        escrow
          .connect(admin)
          .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, [0n, 0n])
      ).to.be.revertedWithCustomError(escrow, "EmptyPrizeShares");
    });
  });

  describe("enter", () => {
    beforeEach(async () => {
      await escrow
        .connect(admin)
        .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, [
          60n,
          30n,
          10n,
        ]);
    });

    it("accepts an entry before startTime and emits Entered", async () => {
      await expect(escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE }))
        .to.emit(escrow, "Entered")
        .withArgs(TOURNEY_ID, p1.address, ENTRY_FEE);

      const t = await escrow.getTournament(TOURNEY_ID);
      expect(t.entrants).to.equal(1);
      expect(t.pool).to.equal(ENTRY_FEE);
      expect(await escrow.hasEntered(TOURNEY_ID, p1.address)).to.equal(true);
    });

    it("reverts on duplicate entry from the same address", async () => {
      await escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE });
      await expect(
        escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE })
      ).to.be.revertedWithCustomError(escrow, "AlreadyEntered");
    });

    it("reverts when msg.value does not match the entry fee", async () => {
      await expect(
        escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE - 1n })
      ).to.be.revertedWithCustomError(escrow, "WrongFee");
    });

    it("reverts after startTime has passed", async () => {
      await time.increaseTo(startTime + 1);
      await expect(
        escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE })
      ).to.be.revertedWithCustomError(escrow, "TournamentAlreadyStarted");
    });
  });

  describe("finalize / claim", () => {
    beforeEach(async () => {
      await escrow
        .connect(admin)
        .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, [
          60n,
          30n,
          10n,
        ]);
      await escrow.connect(p1).enter(TOURNEY_ID, { value: ENTRY_FEE });
      await escrow.connect(p2).enter(TOURNEY_ID, { value: ENTRY_FEE });
      await escrow.connect(p3).enter(TOURNEY_ID, { value: ENTRY_FEE });
      await time.increaseTo(startTime + 1);
    });

    it("distributes the pool by share % and pays out via claim", async () => {
      const winners = [p1.address, p2.address, p3.address];
      const sig = await signFinalization(escrow, signer, TOURNEY_ID, winners);
      const pool = ENTRY_FEE * 3n;
      const expected = [
        (pool * 60n) / 100n,
        (pool * 30n) / 100n,
        pool - (pool * 60n) / 100n - (pool * 30n) / 100n,
      ];

      await expect(escrow.connect(outsider).finalize(TOURNEY_ID, winners, sig))
        .to.emit(escrow, "Finalized")
        .withArgs(TOURNEY_ID, winners, expected);

      expect(await escrow.withdrawable(TOURNEY_ID, p1.address)).to.equal(expected[0]);
      expect(await escrow.withdrawable(TOURNEY_ID, p2.address)).to.equal(expected[1]);
      expect(await escrow.withdrawable(TOURNEY_ID, p3.address)).to.equal(expected[2]);

      const before = await ethers.provider.getBalance(p1.address);
      const tx = await escrow.connect(p1).claim(TOURNEY_ID);
      const rcpt = await tx.wait();
      const gasCost = rcpt!.gasUsed * rcpt!.gasPrice;
      const after = await ethers.provider.getBalance(p1.address);
      expect(after - before + gasCost).to.equal(expected[0]);

      await expect(escrow.connect(p1).claim(TOURNEY_ID))
        .to.be.revertedWithCustomError(escrow, "NothingToClaim");
    });

    it("reverts on empty winners", async () => {
      const sig = await signFinalization(escrow, signer, TOURNEY_ID, []);
      await expect(
        escrow.connect(outsider).finalize(TOURNEY_ID, [], sig)
      ).to.be.revertedWithCustomError(escrow, "EmptyWinners");
    });

    it("reverts when more winners than prize shares", async () => {
      const winners = [p1.address, p2.address, p3.address, outsider.address];
      const sig = await signFinalization(escrow, signer, TOURNEY_ID, winners);
      await expect(
        escrow.connect(outsider).finalize(TOURNEY_ID, winners, sig)
      ).to.be.revertedWithCustomError(escrow, "WinnersExceedShares");
    });

    it("reverts on a signature from a non-SIGNER_ROLE address", async () => {
      const winners = [p1.address];
      const sig = await signFinalization(escrow, outsider, TOURNEY_ID, winners);
      await expect(
        escrow.connect(outsider).finalize(TOURNEY_ID, winners, sig)
      ).to.be.revertedWithCustomError(escrow, "InvalidSigner");
    });

    it("reverts on double-finalize", async () => {
      const winners = [p1.address, p2.address, p3.address];
      const sig = await signFinalization(escrow, signer, TOURNEY_ID, winners);
      await escrow.connect(outsider).finalize(TOURNEY_ID, winners, sig);
      await expect(
        escrow.connect(outsider).finalize(TOURNEY_ID, winners, sig)
      ).to.be.revertedWithCustomError(escrow, "TournamentAlreadyFinalized");
    });
  });

  describe("EIP-712 helpers", () => {
    it("matches the off-chain digest", async () => {
      await escrow
        .connect(admin)
        .createTournament(TOURNEY_ID, ZERO_ADDRESS, ENTRY_FEE, startTime, [100n]);
      const winners = [p1.address];

      const onChain = await escrow.finalizationDigest(TOURNEY_ID, winners);
      const network = await ethers.provider.getNetwork();
      const offChain = ethers.TypedDataEncoder.hash(
        {
          name: "CryptoArenaSurvivors.TournamentEscrow",
          version: "1",
          chainId: Number(network.chainId),
          verifyingContract: await escrow.getAddress(),
        },
        FINALIZATION_TYPES,
        { tournamentId: TOURNEY_ID, winners }
      );
      expect(onChain).to.equal(offChain);
    });
  });
});
