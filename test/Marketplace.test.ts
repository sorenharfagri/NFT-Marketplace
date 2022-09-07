import { ethers } from "hardhat";
import { expect } from "chai"

import { NftMarketplace, NftToken } from "../typechain-types";

describe("NFT Marketplace", () => {


    let adminAcc: any
    let acc2: any
    let acc3: any

    let marketplace: NftMarketplace
    let token: NftToken

    const tokenName = "NEKACOIN"
    const tokenSymbol = "NEKA"

    const nftTokenId_1 = 1

    beforeEach(async () => {

        [adminAcc, acc2, acc3] = await ethers.getSigners()

        const marketplaceFactory = await ethers.getContractFactory("NftMarketplace", adminAcc)
        const nftTokenFactory = await ethers.getContractFactory("NftToken", adminAcc)

        marketplace = await marketplaceFactory.deploy() // tx send

        token = await nftTokenFactory.deploy(tokenName, tokenSymbol) // tx send

        // wait for confirmation
        await marketplace.deployed()
        await token.deployed()

        await token.connect(adminAcc).safeMint(adminAcc.address)
        await token.connect(adminAcc).safeMint(adminAcc.address)
    })

    it("Only owner can set sale fee", async () => {

        const initialSaleFee = await marketplace._saleFeeFraction()
        const newSaleFee = initialSaleFee + 1

        const setSaleFeeTx = await marketplace.connect(adminAcc).setSaleFee(newSaleFee)

        await setSaleFeeTx.wait()

        const saleFee = await marketplace._saleFeeFraction()

        expect(saleFee).to.equal(newSaleFee)

        const setSaleFeeTxOtherAccTx = marketplace.connect(acc2).setSaleFee(newSaleFee)
        await expect(setSaleFeeTxOtherAccTx).to.be.revertedWith("Ownable: caller is not the owner")

    })

    it("Owner cannot set sale fee more than 5%", async () => {

        const newSaleFee = 51

        const setSaleFeeTx = marketplace.connect(adminAcc).setSaleFee(newSaleFee)

        await expect(setSaleFeeTx).to.be.revertedWith("Sale fee cannot be more 5%")

    })

    it("User can list nft", async () => {

        const sellerAcc = acc2

        const price = ethers.utils.parseEther("1")
        const tokenToSellId = nftTokenId_1

        await transferNftTo(tokenToSellId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, tokenToSellId, price)
        await listNftTx.wait()

        const listing = await marketplace.getListing(token.address, tokenToSellId)

        await expect(listNftTx).to.emit(marketplace, "NewListing").withArgs(token.address, listing)

        const tokenOwner = await token.ownerOf(tokenToSellId)

        expect(tokenOwner).equal(marketplace.address)
        expect(listing.seller).to.equal(sellerAcc.address)
        expect(listing.tokenContract).to.equal(token.address)
        expect(listing.tokenId).to.equal(tokenToSellId)
        expect(listing.price).to.equal(price)

    })

    it("User can list with setApprovalForAll approve", async () => {
        const sellerAcc = acc2
        const price = ethers.utils.parseEther("1")
        const tokenToSellId = nftTokenId_1

        await transferNftTo(tokenToSellId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, tokenToSellId, price)
        await listNftTx.wait()
    })

    it("User can list with single token approve", async () => {

        const sellerAcc = acc2
        const price = ethers.utils.parseEther("1")
        const tokenToSellId = nftTokenId_1

        await transferNftTo(tokenToSellId, sellerAcc.address)
        await approveTokenToMarketplace(sellerAcc, tokenToSellId)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, tokenToSellId, price)
        await listNftTx.wait()
    })

    it("User cannot list nft with zero price", async () => {

        const listingCreatorAcc = acc2
        const price = ethers.utils.parseEther("0")
        const tokenToSellId = nftTokenId_1

        await transferNftTo(tokenToSellId, listingCreatorAcc.address)
        await approveAllTokensToMarketplace(listingCreatorAcc)

        const listNftTx = marketplace.connect(listingCreatorAcc).listNft(token.address, tokenToSellId, price)

        await expect(listNftTx).to.be.revertedWith("Price must be > 0")
    })

    it("User cannot list nft without approve", async () => {

        const listingCreatorAcc = acc2
        const price = ethers.utils.parseEther("1")
        const tokenToSellId = nftTokenId_1

        await transferNftTo(tokenToSellId, listingCreatorAcc.address)

        const listNftTx = marketplace.connect(listingCreatorAcc).listNft(token.address, tokenToSellId, price)

        await expect(listNftTx).to.be.revertedWith("Token not approved")
    })

    it("Only token owner can list nft", async () => {

        const listingCreatorAcc = adminAcc
        const fakeBuyerAcc = acc2
        const price = ethers.utils.parseEther("1")
        const tokenToSellId = nftTokenId_1

        await approveAllTokensToMarketplace(listingCreatorAcc)
        await approveAllTokensToMarketplace(fakeBuyerAcc)

        const listNftTx = marketplace.connect(fakeBuyerAcc).listNft(token.address, tokenToSellId, price)

        await expect(listNftTx).to.be.revertedWith("You are not token owner")
    })

    it("User can buy listed nft", async () => {

        const sellerAcc = acc2
        const buyerAcc = acc3
        const listedTokenId = nftTokenId_1

        const tokenPrice = ethers.utils.parseEther("1")

        await transferNftTo(listedTokenId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, listedTokenId, tokenPrice)
        await listNftTx.wait()

        const listing = await marketplace.getListing(token.address, listedTokenId)

        const buyNftTx = await marketplace.connect(buyerAcc).buyNft(token.address, listedTokenId, { value: tokenPrice })
        await buyNftTx.wait()

        const saleComission = await marketplace._calculateSaleFee(tokenPrice)

        // check eth transfer to seller, and comission to marketplace
        await expect(buyNftTx).to.changeEtherBalances([marketplace, sellerAcc], [saleComission, tokenPrice.sub(saleComission)])

        await expect(buyNftTx).to.emit(marketplace, "TokenBuyed").withArgs(token.address, listing)

        const newTokenOwner = await token.ownerOf(listedTokenId)
        expect(newTokenOwner).to.equal(buyerAcc.address)

        const listingExists = await marketplace._listingExists(token.address, listedTokenId)
        expect(listingExists).to.equal(false)
    })

    it("User cannot buy token that doesnt listed", async () => {

        const buyerAcc = acc3
        const listedTokenId = nftTokenId_1

        const buyNftTx = marketplace.connect(buyerAcc).buyNft(token.address, listedTokenId)

        await expect(buyNftTx).to.be.revertedWith("Listing doesnt exists")

    })

    it("User cannot buy his own token", async () => {

        const sellerAcc = acc2
        const listedTokenId = nftTokenId_1

        const tokenPrice = ethers.utils.parseEther("1")

        await transferNftTo(listedTokenId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, listedTokenId, tokenPrice)
        await listNftTx.wait()

        const buyNftTx = marketplace.connect(sellerAcc).buyNft(token.address, listedTokenId, { value: tokenPrice })
        await expect(buyNftTx).to.be.revertedWith("You cant buy your own token")

    })

    it("User cannot buy if tx value < listing price", async () => {

        const sellerAcc = acc2
        const buyerAcc = acc3
        const listedTokenId = nftTokenId_1

        const tokenPrice = ethers.utils.parseEther("1")

        await transferNftTo(listedTokenId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, listedTokenId, tokenPrice)
        await listNftTx.wait()

        const buyNftTx = marketplace.connect(buyerAcc).buyNft(token.address, listedTokenId, { value: 1000 })
        await expect(buyNftTx).to.be.revertedWith("Value not enough")
    })

    it("User can delist nft", async () => {

        const sellerAcc = acc2
        const listedTokenId = nftTokenId_1

        const tokenPrice = ethers.utils.parseEther("1")

        await transferNftTo(listedTokenId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, listedTokenId, tokenPrice)
        await listNftTx.wait()

        const listing = await marketplace.getListing(token.address, listedTokenId)


        const delistNft = await marketplace.connect(sellerAcc).delistNft(token.address, listedTokenId)
        await delistNft.wait()

        await expect(delistNft).to.emit(marketplace, "Delisted").withArgs(token.address, listing)

        const listingExists = await marketplace._listingExists(token.address, listedTokenId)
        expect(listingExists).to.equal(false)

        const newTokenOwner = await token.ownerOf(listedTokenId)
        expect(newTokenOwner).to.equal(sellerAcc.address)
    })

    it("User cannot delist non existent listing", async () => {
        const delistTx = marketplace.connect(acc2).delistNft(token.address, 1)

        await expect(delistTx).to.be.revertedWith("Listing doesnt exists")
    })

    it("Only listing owner can delist", async () => {

        const sellerAcc = acc2
        const fakeAcc = acc3

        const listedTokenId = nftTokenId_1

        const tokenPrice = ethers.utils.parseEther("1")

        await transferNftTo(listedTokenId, sellerAcc.address)
        await approveAllTokensToMarketplace(sellerAcc)

        const listNftTx = await marketplace.connect(sellerAcc).listNft(token.address, listedTokenId, tokenPrice)
        await listNftTx.wait()

        const delistTx = marketplace.connect(fakeAcc).delistNft(token.address, listedTokenId)
        await expect(delistTx).to.be.revertedWith("You are not token seller")
    })



    async function approveAllTokensToMarketplace(ownerAcc: any) {
        const approveTx = await token.connect(ownerAcc).setApprovalForAll(marketplace.address, true)
        return await approveTx.wait()
    }

    async function approveTokenToMarketplace(ownerAcc: any, tokenId: number) {
        const approveTx = await token.connect(ownerAcc).approve(marketplace.address, tokenId)
        return await approveTx.wait()
    }

    async function transferNftTo(nftId: number, to: string) {
        const transferTx = await token.connect(adminAcc)["safeTransferFrom(address,address,uint256)"](adminAcc.address, to, nftId)
        return await transferTx.wait()
    }
})