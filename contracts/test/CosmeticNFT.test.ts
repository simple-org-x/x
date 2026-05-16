import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import type { CosmeticNFT } from "../typechain-types";

const BASE_URI = "ipfs://bafy.../";
const CATEGORY_SKIN = ethers.id("skin");
const CATEGORY_EMOTE = ethers.id("emote");
const CATEGORY_KILL_ANIMATION = ethers.id("kill_animation");
const CATEGORY_VISUAL_EFFECT = ethers.id("visual_effect");

describe("CosmeticNFT", () => {
  let nft: CosmeticNFT;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  beforeEach(async () => {
    [admin, minter, user, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CosmeticNFT");
    nft = (await Factory.deploy(BASE_URI, admin.address)) as unknown as CosmeticNFT;
    await nft.waitForDeployment();

    const minterRole = await nft.MINTER_ROLE();
    await nft.connect(admin).grantRole(minterRole, minter.address);
  });

  describe("mint", () => {
    it("allows MINTER_ROLE to mint a token and records its category", async () => {
      await expect(
        nft.connect(minter).mint(user.address, 1, 5, CATEGORY_SKIN, "0x")
      )
        .to.emit(nft, "CategoryAssigned")
        .withArgs(1, CATEGORY_SKIN);

      expect(await nft.balanceOf(user.address, 1)).to.equal(5n);
      expect(await nft.categoryOf(1)).to.equal(CATEGORY_SKIN);
      expect(await nft["totalSupply(uint256)"](1)).to.equal(5n);
    });

    it("reverts when a non-minter tries to mint", async () => {
      await expect(
        nft.connect(outsider).mint(user.address, 1, 1, CATEGORY_SKIN, "0x")
      ).to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });

    it("reverts on an unknown category", async () => {
      const unknown = ethers.id("unknown_category");
      await expect(
        nft.connect(minter).mint(user.address, 1, 1, unknown, "0x")
      ).to.be.revertedWithCustomError(nft, "UnknownCategory");
    });

    it("locks the category to the first mint of an id", async () => {
      await nft.connect(minter).mint(user.address, 1, 1, CATEGORY_SKIN, "0x");
      // Same category is fine.
      await nft.connect(minter).mint(user.address, 1, 1, CATEGORY_SKIN, "0x");
      // Different category reverts.
      await expect(
        nft.connect(minter).mint(user.address, 1, 1, CATEGORY_EMOTE, "0x")
      ).to.be.revertedWithCustomError(nft, "CategoryMismatch");
    });

    it("supports batch minting across categories", async () => {
      const ids = [10, 11, 12, 13];
      const amounts = [1, 2, 3, 4];
      const categories = [
        CATEGORY_SKIN,
        CATEGORY_EMOTE,
        CATEGORY_KILL_ANIMATION,
        CATEGORY_VISUAL_EFFECT,
      ];
      await nft
        .connect(minter)
        .mintBatch(user.address, ids, amounts, categories, "0x");

      for (let i = 0; i < ids.length; i++) {
        expect(await nft.balanceOf(user.address, ids[i])).to.equal(BigInt(amounts[i]));
        expect(await nft.categoryOf(ids[i])).to.equal(categories[i]);
      }
    });
  });

  describe("uri", () => {
    it("returns the base URI with the id appended when no override is set", async () => {
      await nft.connect(minter).mint(user.address, 42, 1, CATEGORY_SKIN, "0x");
      expect(await nft.uri(42)).to.equal(`${BASE_URI}42`);
    });

    it("per-id override wins over the base URI", async () => {
      await nft.connect(minter).mint(user.address, 7, 1, CATEGORY_SKIN, "0x");
      const override = "ipfs://customcid/skin-7.json";
      await expect(nft.connect(admin).setTokenURI(7, override))
        .to.emit(nft, "TokenURISet")
        .withArgs(7, override);
      expect(await nft.uri(7)).to.equal(override);
    });

    it("setBaseURI updates the base URI for all ids without overrides", async () => {
      await nft.connect(minter).mint(user.address, 99, 1, CATEGORY_SKIN, "0x");
      await expect(nft.connect(admin).setBaseURI("ipfs://newbase/"))
        .to.emit(nft, "BaseURIUpdated")
        .withArgs("ipfs://newbase/");
      expect(await nft.uri(99)).to.equal("ipfs://newbase/99");
    });

    it("reverts when a non-uri-setter tries to update URIs", async () => {
      await expect(
        nft.connect(outsider).setBaseURI("ipfs://nope/")
      ).to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
      await expect(
        nft.connect(outsider).setTokenURI(1, "ipfs://nope/1")
      ).to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount");
    });
  });

  describe("anti pay-to-win invariants", () => {
    it("ABI exposes no function whose name suggests stat advantage", async () => {
      const abi = nft.interface.fragments;
      const banned = /stat|damage|hp|power|boost/i;
      const offending: string[] = [];
      for (const frag of abi) {
        if (frag.type === "function" && banned.test((frag as { name: string }).name)) {
          offending.push((frag as { name: string }).name);
        }
      }
      expect(
        offending,
        `CosmeticNFT exposes banned function names: ${offending.join(", ")}`
      ).to.deep.equal([]);
    });

    it("source contains the verbatim anti pay-to-win NatSpec invariant", () => {
      const source = readFileSync(
        join(__dirname, "..", "contracts", "CosmeticNFT.sol"),
        "utf8"
      );
      const expected =
        "This contract MUST NOT and DOES NOT confer any in-game stat advantage. It exists solely for cosmetic ownership.";
      expect(source).to.include(expected);
    });

    it("category mapping covers exactly the four documented categories", async () => {
      expect(await nft.CATEGORY_SKIN()).to.equal(CATEGORY_SKIN);
      expect(await nft.CATEGORY_EMOTE()).to.equal(CATEGORY_EMOTE);
      expect(await nft.CATEGORY_KILL_ANIMATION()).to.equal(CATEGORY_KILL_ANIMATION);
      expect(await nft.CATEGORY_VISUAL_EFFECT()).to.equal(CATEGORY_VISUAL_EFFECT);
    });
  });
});
