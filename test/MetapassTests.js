const { expect } = require("chai");
const { waffle, network } = require("hardhat");
const { loadFixture } = waffle;

const WHITELIST = require("../scripts/whitelist.json");

const COLLECTION_NAME = process.env.COLLECTION_NAME;
const TOKEN_NAME = process.env.TOKEN_NAME;
const METADATA_URI = process.env.METADATA_URI;
const DAO_ADDRESS = process.env.DAO_ADDRESS;
const MINT_PRICE = ethers.utils.parseEther(process.env.MINT_PRICE);
const METAPASS_SUPPLY = 100;
const BULK_BUY_LIMIT = process.env.BULK_BUY_LIMIT;
const MAX_NFTS_PER_WALLET = process.env.MAX_NFTS_PER_WALLET;
const MAX_NFTS_PER_WALLET_PRESALE = process.env.MAX_NFTS_PER_WALLET_PRESALE;
const PRESALE_START = Math.round(new Date().getTime() / 1000);
const OFFICIAL_SALE_START = PRESALE_START + 7200;

describe("Metapass Tests", () => {
  async function deployContract() {
    const accounts = await ethers.getSigners();
    const Metapass = await ethers.getContractFactory("MetapassTest");

    const metapassDeployment = await Metapass.deploy(
      COLLECTION_NAME,
      TOKEN_NAME,
      METADATA_URI,
      DAO_ADDRESS,
      MINT_PRICE,
      METAPASS_SUPPLY,
      BULK_BUY_LIMIT,
      MAX_NFTS_PER_WALLET,
      MAX_NFTS_PER_WALLET_PRESALE,
      PRESALE_START,
      OFFICIAL_SALE_START
    );

    const whitelistAddresses = [];
    for (let i = 1; i <= 50; i++) {
      whitelistAddresses.push(accounts[i].address);
    }

    return { metapassDeployment, whitelistAddresses };
  }

  it("Should initialize properly with correct configuration and whitelist addresses", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    expect(await metapassDeployment.name()).to.equal(COLLECTION_NAME);
    expect(await metapassDeployment.symbol()).to.equal(TOKEN_NAME);

    expect(await metapassDeployment.isInPresaleWhitelist(whitelistAddresses[0])).to.be.true;
    expect(await metapassDeployment.isInPresaleWhitelist(whitelistAddresses[49])).to.be.true;
    expect(await metapassDeployment.isInPresaleWhitelist(accounts[0].address)).to.be.false;
  });

  it("Should generate random unique tokens", async () => {
    const { metapassDeployment } = await loadFixture(deployContract);

    let uniquesCount = 10;
    let generatedUniquesCount = await metapassDeployment.generatedUniquesCount();

    expect(uniquesCount).to.equal(generatedUniquesCount);
  });

  it("Non whitelisted addresses should not mint during presale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await expect(
      metapassDeployment.connect(accounts[0]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).revertedWith("Not in presale list");
  });

  it("Only whitelisted addresses should mint during presale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await expect(
      metapassDeployment.connect(accounts[0]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).revertedWith("Not in presale list");

    await expect(
      metapassDeployment.connect(accounts[1]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await expect(
      metapassDeployment.connect(accounts[1]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).revertedWith("Presale mint limit exceeded");
  });

  it("Max 1 NFT can be minted during presale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await expect(
      metapassDeployment.connect(accounts[1]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await expect(
      metapassDeployment.connect(accounts[1]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).revertedWith("Presale mint limit exceeded");
  });

  it("Only owner can mint reserved tokens during presale, up to the limit", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await expect(
      metapassDeployment.connect(accounts[0]).functions["reserveMint(uint256)"](50)
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await expect(
      metapassDeployment.connect(accounts[1]).functions["reserveMint(uint256)"](1)
    ).revertedWith("Ownable: caller is not the owner");

    await expect(
      metapassDeployment.connect(accounts[0]).functions["reserveMint(uint256)"](1)
    ).revertedWith("Mint limit exceeded");
  });

  it("Owner cannot mint reserved tokens during official sale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    await expect(
      metapassDeployment.connect(accounts[0]).functions["reserveMint(uint256)"](1)
    ).revertedWith("Presale not started/already finished");
  });

  it("Max 5 NFTs for non-whitelisted wallet can be minted during official sale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    await expect(
      metapassDeployment.connect(accounts[51]).functions["bulkBuy(uint256)"](5, {
        value: MINT_PRICE.mul(5),
      })
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await expect(
      metapassDeployment.connect(accounts[51]).functions["bulkBuy(uint256)"](1, {
        value: MINT_PRICE.mul(1),
      })
    ).revertedWith("Mint limit exceeded");
  });

  it("Max 6 NFTs for whitelisted wallet can be minted during presale and official sale", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await expect(
      metapassDeployment.connect(accounts[1]).functions["presaleMint()"]({
        value: MINT_PRICE,
      })
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    await expect(
      metapassDeployment.connect(accounts[1]).functions["bulkBuy(uint256)"](5, {
        value: MINT_PRICE.mul(5),
      })
    ).to.be.emit(metapassDeployment, "TokenMinted");

    await expect(
      metapassDeployment.connect(accounts[1]).functions["bulkBuy(uint256)"](1, {
        value: MINT_PRICE.mul(1),
      })
    ).revertedWith("Mint limit exceeded");
  });

  it("Bulk buy should mint max 5 NFTs in one call", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    await expect(
      metapassDeployment.connect(accounts[51]).functions["bulkBuy(uint256)"]((BULK_BUY_LIMIT + 1), {
        value: MINT_PRICE.mul((BULK_BUY_LIMIT + 1)),
      })
    ).revertedWith("Cannot bulk buy more than the preset limit");
  });

  it("Should not be able to bulk buy if max total supply is reached", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    for (let i = 0; i < (METAPASS_SUPPLY / BULK_BUY_LIMIT); i++) {
      await metapassDeployment.connect(accounts[50 + i]).functions["bulkBuy(uint256)"](BULK_BUY_LIMIT, {
        value: MINT_PRICE.mul(BULK_BUY_LIMIT),
      })
    }

    await expect(
      metapassDeployment.connect(accounts[75]).functions["bulkBuy(uint256)"](1, {
        value: MINT_PRICE.mul(1),
      })
    ).revertedWith("Total supply reached");

  });

  it("Should not be able to single mint if max total supply is reached", async () => {
    const { metapassDeployment, whitelistAddresses } = await loadFixture(deployContract);
    const accounts = await ethers.getSigners();

    await metapassDeployment.addToPresaleList(whitelistAddresses);

    await ethers.provider.send('evm_setNextBlockTimestamp', [OFFICIAL_SALE_START]); 
    await ethers.provider.send('evm_mine');

    for (let i = 0; i < (METAPASS_SUPPLY); i++) {
      await metapassDeployment.connect(accounts[i]).functions["mint()"]({
        value: MINT_PRICE,
      })
    }

    await expect(
      metapassDeployment.connect(accounts[101]).functions["mint()"]({
        value: MINT_PRICE,
      })
    ).revertedWith("Total supply reached");

  });
});
