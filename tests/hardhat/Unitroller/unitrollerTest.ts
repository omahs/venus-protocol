import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ContractTransaction, constants } from "ethers";
import { ethers } from "hardhat";

import {
  ComptrollerMock,
  ComptrollerMock__factory,
  EchoTypesComptroller,
  EchoTypesComptroller__factory,
  Unitroller,
  Unitroller__factory,
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

describe("Unitroller", () => {
  let root: SignerWithAddress;
  let accounts: SignerWithAddress[];
  let unitroller: MockContract<Unitroller>;
  let brains: MockContract<ComptrollerMock>;

  async function unitrollerFixture() {
    const ComptrollerFactory = await smock.mock<ComptrollerMock__factory>("ComptrollerMock");
    const UnitrollerFactory = await smock.mock<Unitroller__factory>("Unitroller");
    brains = await ComptrollerFactory.deploy();
    unitroller = await UnitrollerFactory.deploy();
    return { unitroller, brains };
  }

  beforeEach(async () => {
    [root, ...accounts] = await ethers.getSigners();
    ({ unitroller, brains } = await loadFixture(unitrollerFixture));
  });

  async function setPending<Impl extends { address: string }>(
    implementation: Impl,
    from: SignerWithAddress,
  ): Promise<ContractTransaction> {
    return unitroller.connect(from)._setPendingImplementation(implementation.address);
  }

  describe("constructor", () => {
    it("sets admin to caller and addresses to 0", async () => {
      expect(await unitroller.admin()).to.equal(root.address);
      expect(await unitroller.pendingAdmin()).to.equal(constants.AddressZero);
      expect(await unitroller.pendingComptrollerImplementation()).to.equal(constants.AddressZero);
      expect(await unitroller.comptrollerImplementation()).to.equal(constants.AddressZero);
    });
  });

  describe("_setPendingImplementation", () => {
    describe("Check caller is admin", () => {
      let result: ContractTransaction;
      beforeEach(async () => {
        result = await setPending(brains, accounts[1]);
      });

      it("emits a failure log", async () => {
        await expect(result)
          .to.emit(unitroller, "Failure")
          .withArgs(
            ComptrollerErrorReporter.Error.UNAUTHORIZED,
            ComptrollerErrorReporter.FailureInfo.SET_PENDING_IMPLEMENTATION_OWNER_CHECK,
            0,
          );
      });

      it("does not change pending implementation address", async () => {
        expect(await unitroller.pendingComptrollerImplementation()).to.equal(constants.AddressZero);
      });
    });

    describe("succeeding", () => {
      it("stores pendingComptrollerImplementation with value newPendingImplementation", async () => {
        await setPending(brains, root);
        expect(await unitroller.pendingComptrollerImplementation()).to.equal(brains.address);
      });

      it("emits NewPendingImplementation event", async () => {
        await expect(await unitroller._setPendingImplementation(brains.address))
          .to.emit(unitroller, "NewPendingImplementation")
          .withArgs(constants.AddressZero, brains.address);
      });
    });
  });

  describe("_acceptImplementation", () => {
    describe("Check caller is pendingComptrollerImplementation  and pendingComptrollerImplementation ≠ address(0) ", () => {
      let result: ContractTransaction;
      beforeEach(async () => {
        await setPending(unitroller, root);
        result = await unitroller._acceptImplementation();
      });

      it("emits a failure log", async () => {
        await expect(result)
          .to.emit(unitroller, "Failure")
          .withArgs(
            ComptrollerErrorReporter.Error.UNAUTHORIZED,
            ComptrollerErrorReporter.FailureInfo.ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK,
            0,
          );
      });

      it("does not change current implementation address", async () => {
        expect(await unitroller.comptrollerImplementation()).not.to.equal(unitroller.address);
      });
    });

    describe("the brains must accept the responsibility of implementation", () => {
      let result: ContractTransaction;
      beforeEach(async () => {
        await setPending(brains, root);
        result = await brains._become(unitroller.address);
        expect(result); //.toSucceed();
      });

      it("Store comptrollerImplementation with value pendingComptrollerImplementation", async () => {
        expect(await unitroller.comptrollerImplementation()).to.equal(brains.address);
      });

      it("Unset pendingComptrollerImplementation", async () => {
        expect(await unitroller.pendingComptrollerImplementation()).to.equal(constants.AddressZero);
      });

      it("Emit NewImplementation(oldImplementation, newImplementation)", async () => {
        await expect(result).to.emit(unitroller, "NewImplementation").withArgs(constants.AddressZero, brains.address);
      });

      it("Emit NewPendingImplementation(oldPendingImplementation, 0)", async () => {
        await expect(result)
          .to.emit(unitroller, "NewPendingImplementation")
          .withArgs(brains.address, constants.AddressZero);
      });
    });

    describe("fallback delegates to brains", () => {
      let troll: MockContract<EchoTypesComptroller>;
      beforeEach(async () => {
        const trollFactory = await smock.mock<EchoTypesComptroller__factory>("EchoTypesComptroller");
        troll = await trollFactory.deploy();
        await setPending(troll, root);
        await troll.becomeBrains(unitroller.address);
        //troll.options.address = unitroller.address;
      });

      it("forwards reverts", async () => {
        await expect(troll.reverty()).to.be.revertedWith("gotcha sucka");
      });

      it("gets addresses", async () => {
        expect(await troll.addresses(troll.address)).to.equal(troll.address);
      });

      it("gets strings", async () => {
        expect(await troll.stringy("yeet")).to.equal("yeet");
      });

      it("gets bools", async () => {
        expect(await troll.booly(true)).to.equal(true);
      });

      it("gets list of ints", async () => {
        expect(await troll.listOInts([1, 2, 3])).to.deep.equal(["1", "2", "3"]);
      });
    });
  });
});
