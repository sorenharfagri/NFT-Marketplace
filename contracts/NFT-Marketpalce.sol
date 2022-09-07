// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./Token/IERC721.sol";
import "./Token/IERC721Receiver.sol";
import "./Utils/Ownable.sol";

contract NftMarketplace is Ownable, IERC721Receiver {
    mapping(uint256 => Listing) nftsToSell;
    mapping(address => mapping(uint256 => Listing)) listings;

    event NewListing(address indexed tokenContract, Listing listing);
    event Delisted(address indexed tokenContract, Listing listing);
    event TokenBuyed(address indexed tokenContract, Listing listing);

    uint8 public _saleFeeFraction = 20;

    struct Listing {
        address seller;
        address tokenContract;
        uint256 tokenId;
        uint256 price;
    }


    function listNft(
        address tokenContract,
        uint256 tokenId,
        uint256 price
    ) public {
        require(
            (_isAllTokenApproved(tokenContract, msg.sender) ||
                _isTokenApproved(tokenContract, tokenId)),
            "Token not approved"
        );

        require(
            _isTokenOwner(tokenContract, tokenId, msg.sender),
            "You are not token owner"
        );

        require(price > 0, "Price must be > 0");

        listings[tokenContract][tokenId] = Listing(
            msg.sender,
            tokenContract,
            tokenId,
            price
        );

        IERC721(tokenContract).safeTransferFrom(msg.sender, address(this), tokenId);

        emit NewListing(tokenContract, listings[tokenContract][tokenId]);
    }

    function buyNft(address tokenContract, uint256 tokenId) public payable {
        require(
            _listingExists(tokenContract, tokenId),
            "Listing doesnt exists"
        );

        Listing memory listing = listings[tokenContract][tokenId];

        require(msg.value >= listing.price, "Value not enough");
        require(listing.seller != msg.sender, "You cant buy your own token");

        delete listings[tokenContract][tokenId];

        IERC721(listing.tokenContract).safeTransferFrom(
            address(this),
            msg.sender,
            listing.tokenId
        );

        uint256 _saleFee = _calculateSaleFee(listing.price);

        address payable listingOwner = payable(listing.seller);
        
        listingOwner.transfer(listing.price - _saleFee);

        emit TokenBuyed(tokenContract, listing);
    }

    function delistNft(address tokenContract, uint256 tokenId) public {
        require(
            _listingExists(tokenContract, tokenId),
            "Listing doesnt exists"
        );

        Listing memory listingToDelete = listings[tokenContract][tokenId];

         require(
            listingToDelete.seller == msg.sender,
            "You are not token seller"
        );

        delete listings[tokenContract][tokenId];

        IERC721(listingToDelete.tokenContract).transferFrom(
            address(this),
            msg.sender,
            listingToDelete.tokenId
        );

        emit Delisted(tokenContract, listingToDelete);
    }

    function _listingExists(address tokenContract, uint256 tokenId)
        public
        view
        returns (bool)
    {
        return listings[tokenContract][tokenId].price > 0;
    }

    function _isTokenApproved(address erc721address, uint256 tokenId)
        private
        view
        returns (bool)
    {
        IERC721 nftContract = IERC721(erc721address);
        try nftContract.getApproved(tokenId) returns (address tokenOperator) {
            return tokenOperator == address(this);
        } catch {
            return false;
        }
    }

    function _isAllTokenApproved(address erc721address, address owner)
        private
        view
        returns (bool)
    {
        return IERC721(erc721address).isApprovedForAll(owner, address(this));
    }

    function _isTokenOwner(
        address erc721address,
        uint256 tokenId,
        address wallet
    ) private view returns (bool) {
        IERC721 _erc721 = IERC721(erc721address);
        try _erc721.ownerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner == wallet;
        } catch {
            return false;
        }
    }

    function getListing(address tokenContract, uint256 tokenId)
        public
        view
        returns (Listing memory)
    {
        return listings[tokenContract][tokenId];
    }

    function _calculateSaleFee(uint256 value)
        public
        view
        returns (uint256 _saleFee)
    {
        uint256 _baseFractions = 1000 + _saleFeeFraction;

        _saleFee = (value * _saleFeeFraction) / _baseFractions;
    }

    function setSaleFee(uint8 fee) external onlyOwner {
        require(fee <= 50, "Sale fee cannot be more 5%");

        _saleFeeFraction = fee;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
