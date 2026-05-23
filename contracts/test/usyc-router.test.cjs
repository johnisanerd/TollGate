const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UsycRouter", function () {
  let router, usdc, usyc, adapter;
  let admin, operator, attacker;

  const ONE_USDC = ethers.parseUnits("1", 6);

  beforeEach(async function () {
    [admin, operator, attacker] = await ethers.getSigners();
    const Usdc = await ethers.getContractFactory("MockUsdc");
    usdc = await Usdc.deploy();
    usyc = await Usdc.deploy();
    const Router = await ethers.getContractFactory("UsycRouter");
    router = await Router.deploy(admin.address, await usdc.getAddress());
    const Adapter = await ethers.getContractFactory("MockOneToOneAdapter");
    adapter = await Adapter.deploy();

    const OP_ROLE = await router.ROUTER_OPERATOR_ROLE();
    await router.connect(admin).grantRole(OP_ROLE, operator.address);

    await usdc.mint(operator.address, ethers.parseUnits("1000", 6));
    await usyc.mint(await adapter.getAddress(), ethers.parseUnits("1000", 6));
    await usyc.mint(operator.address, ethers.parseUnits("500", 6));
    await usdc.mint(await adapter.getAddress(), ethers.parseUnits("1000", 6));
  });

  it("constructor reverts on zero USDC address", async function () {
    const Router = await ethers.getContractFactory("UsycRouter");
    await expect(Router.deploy(admin.address, ethers.ZeroAddress)).to.be.revertedWith("zero_usdc");
  });

  it("swapToUsyc reverts when USYC token unset", async function () {
    await expect(router.connect(operator).swapToUsyc(ONE_USDC, ONE_USDC, "RISK_OFF"))
      .to.be.revertedWithCustomError(router, "UsycTokenNotSet");
  });

  it("swapToUsyc reverts when adapter unset", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await expect(router.connect(operator).swapToUsyc(ONE_USDC, ONE_USDC, "RISK_OFF"))
      .to.be.revertedWithCustomError(router, "AdapterNotConfigured");
  });

  it("swapToUsyc reverts with ZeroAmount on amountIn=0", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());
    await expect(router.connect(operator).swapToUsyc(0, 0, "RISK_OFF"))
      .to.be.revertedWithCustomError(router, "ZeroAmount");
  });

  it("non-operator cannot call swapToUsyc", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());
    await expect(router.connect(attacker).swapToUsyc(ONE_USDC, ONE_USDC, "RISK_OFF"))
      .to.be.reverted;
  });

  it("happy path: swapToUsyc 100 USDC → 100 USYC with adapter mock", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());

    const amount = ethers.parseUnits("100", 6);
    await usdc.connect(operator).approve(await router.getAddress(), amount);

    await expect(router.connect(operator).swapToUsyc(amount, amount, "RISK_OFF regime detected"))
      .to.emit(router, "SwapToUsyc")
      .withArgs(amount, amount, amount, operator.address, "RISK_OFF regime detected");

    expect(await router.totalSwappedToUsyc()).to.equal(amount);
    expect(await usyc.balanceOf(operator.address)).to.equal(ethers.parseUnits("600", 6));
  });

  it("happy path: swapToUsdc 50 USYC → 50 USDC for BULL regime", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());

    const amount = ethers.parseUnits("50", 6);
    await usyc.connect(operator).approve(await router.getAddress(), amount);

    await expect(router.connect(operator).swapToUsdc(amount, amount, "BULL regime"))
      .to.emit(router, "SwapToUsdc")
      .withArgs(amount, amount, amount, operator.address, "BULL regime");

    expect(await router.totalSwappedToUsdc()).to.equal(amount);
    const lastBullAt = await router.lastBullAt();
    expect(lastBullAt).to.be.greaterThan(0);
  });

  it("slippage protection: minOut higher than actual reverts", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());

    const amount = ethers.parseUnits("100", 6);
    const minOutTooHigh = ethers.parseUnits("110", 6);
    await usdc.connect(operator).approve(await router.getAddress(), amount);

    await expect(router.connect(operator).swapToUsyc(amount, minOutTooHigh, "RISK_OFF"))
      .to.be.revertedWith("slippage");
  });

  it("pause blocks swaps, unpause restores", async function () {
    await router.connect(admin).setUsycToken(await usyc.getAddress());
    await router.connect(admin).setAdapter(await adapter.getAddress());

    await router.connect(admin).pause();
    const amount = ethers.parseUnits("10", 6);
    await usdc.connect(operator).approve(await router.getAddress(), amount);
    await expect(router.connect(operator).swapToUsyc(amount, amount, "RISK_OFF"))
      .to.be.reverted;

    await router.connect(admin).unpause();
    await expect(router.connect(operator).swapToUsyc(amount, amount, "RISK_OFF"))
      .to.emit(router, "SwapToUsyc");
  });

  it("admin can rotate adapter and emits AdapterUpdated", async function () {
    const Adapter = await ethers.getContractFactory("MockOneToOneAdapter");
    const adapter2 = await Adapter.deploy();
    await expect(router.connect(admin).setAdapter(await adapter2.getAddress()))
      .to.emit(router, "AdapterUpdated")
      .withArgs(ethers.ZeroAddress, await adapter2.getAddress());
  });

  it("admin can set USYC token and emits UsycTokenUpdated", async function () {
    await expect(router.connect(admin).setUsycToken(await usyc.getAddress()))
      .to.emit(router, "UsycTokenUpdated")
      .withArgs(ethers.ZeroAddress, await usyc.getAddress());
  });

  it("rescue lets admin withdraw stuck tokens", async function () {
    await usdc.mint(await router.getAddress(), ethers.parseUnits("7", 6));
    expect(await usdc.balanceOf(await router.getAddress())).to.equal(ethers.parseUnits("7", 6));
    await router.connect(admin).rescue(await usdc.getAddress(), admin.address, ethers.parseUnits("7", 6));
    expect(await usdc.balanceOf(admin.address)).to.equal(ethers.parseUnits("7", 6));
  });
});
