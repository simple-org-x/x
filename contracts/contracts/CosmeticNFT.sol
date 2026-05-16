// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title CosmeticNFT
 * @notice ERC-1155 cosmetic items for Crypto Arena Survivors. Each
 *         token id belongs to exactly one of four categories: skin,
 *         emote, kill_animation, visual_effect. Categories are stored
 *         as keccak256(category-name) for cheap on-chain comparisons.
 *
 * @dev    Anti pay-to-win invariant:
 *
 *         "This contract MUST NOT and DOES NOT confer any in-game stat advantage. It exists solely for cosmetic ownership."
 *
 *         The contract surface deliberately avoids any field, event,
 *         function, or role name that suggests stats, damage, hp,
 *         power, or boosts. A meta-test in `CosmeticNFT.test.ts`
 *         enforces this at the ABI level.
 */
contract CosmeticNFT is ERC1155Supply, AccessControl {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    bytes32 public constant CATEGORY_SKIN = keccak256("skin");
    bytes32 public constant CATEGORY_EMOTE = keccak256("emote");
    bytes32 public constant CATEGORY_KILL_ANIMATION = keccak256("kill_animation");
    bytes32 public constant CATEGORY_VISUAL_EFFECT = keccak256("visual_effect");

    /// @notice Category for a given token id (encoded as keccak256(name)).
    /// @dev    The category label is an opaque tag for off-chain
    ///         tooling. The contract itself does NOT interpret it; the
    ///         anti pay-to-win invariant is enforced at the off-chain
    ///         boundary (client + indexer code MUST NOT translate any
    ///         on-chain field, including this category, into in-game
    ///         stat changes). See the contract-level NatSpec above.
    mapping(uint256 => bytes32) public categoryOf;

    /// @notice Optional per-id URI override that takes precedence over the base URI.
    mapping(uint256 => string) private _tokenURIs;

    event CategoryAssigned(uint256 indexed id, bytes32 indexed category);
    event TokenURISet(uint256 indexed id, string uri);
    event BaseURIUpdated(string newBaseURI);

    error UnknownCategory();
    error CategoryAlreadyAssigned();
    error CategoryMismatch();
    error LengthMismatch();
    error ZeroAddress();
    error EmptyBaseURI();

    constructor(string memory baseURI, address admin)
        ERC1155(baseURI)
    {
        if (admin == address(0)) revert ZeroAddress();
        // A blank base URI would make uri(id) return "" for any id
        // without a per-id override, breaking the standard ERC-1155
        // expectation that holders can resolve metadata. The deployer
        // can still set a placeholder ("ipfs://placeholder/") at deploy
        // time and update it later via setBaseURI.
        if (bytes(baseURI).length == 0) revert EmptyBaseURI();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(URI_SETTER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------

    /**
     * @notice Mint `amount` of cosmetic id `id` to `to`. The first
     *         mint of an id locks in its category; subsequent mints
     *         must pass the same category or revert.
     */
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes32 category,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) {
        _assignCategory(id, category);
        _mint(to, id, amount, data);
    }

    /// @notice Batch variant of `mint`. `ids`, `amounts`, `categories` must be the same length.
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes32[] calldata categories,
        bytes calldata data
    ) external onlyRole(MINTER_ROLE) {
        if (ids.length != amounts.length || ids.length != categories.length) {
            revert LengthMismatch();
        }
        for (uint256 i = 0; i < ids.length; i++) {
            _assignCategory(ids[i], categories[i]);
        }
        _mintBatch(to, ids, amounts, data);
    }

    // ---------------------------------------------------------------------
    // URI management
    // ---------------------------------------------------------------------

    /// @notice Update the base URI used when no per-id override is set.
    /// @dev    Reverts on an empty string: callers wanting to "clear"
    ///         the base must instead supply a placeholder. This keeps
    ///         uri(id) from ever returning "" once at least one mint
    ///         has occurred, which would violate the ERC-1155
    ///         expectation that token metadata is always resolvable.
    function setBaseURI(string calldata newBaseURI) external onlyRole(URI_SETTER_ROLE) {
        if (bytes(newBaseURI).length == 0) revert EmptyBaseURI();
        _setURI(newBaseURI);
        emit BaseURIUpdated(newBaseURI);
    }

    /// @notice Set a per-id URI that overrides the base URI when querying `uri(id)`.
    function setTokenURI(uint256 id, string calldata tokenURI_) external onlyRole(URI_SETTER_ROLE) {
        _tokenURIs[id] = tokenURI_;
        emit TokenURISet(id, tokenURI_);
    }

    /// @inheritdoc ERC1155
    function uri(uint256 id) public view override returns (string memory) {
        string memory override_ = _tokenURIs[id];
        if (bytes(override_).length != 0) {
            return override_;
        }
        // Default ERC-1155 behaviour: the base URI is shared and clients
        // substitute the {id} placeholder. We append the literal id for
        // ergonomic off-chain tooling that does not handle {id}.
        string memory base = super.uri(id);
        if (bytes(base).length == 0) {
            return "";
        }
        return string.concat(base, id.toString());
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _assignCategory(uint256 id, bytes32 category) internal {
        if (
            category != CATEGORY_SKIN &&
            category != CATEGORY_EMOTE &&
            category != CATEGORY_KILL_ANIMATION &&
            category != CATEGORY_VISUAL_EFFECT
        ) {
            revert UnknownCategory();
        }
        bytes32 existing = categoryOf[id];
        if (existing == bytes32(0)) {
            categoryOf[id] = category;
            emit CategoryAssigned(id, category);
        } else if (existing != category) {
            revert CategoryMismatch();
        }
    }

    /// @inheritdoc ERC1155Supply
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155Supply) {
        super._update(from, to, ids, values);
    }

    /// @inheritdoc AccessControl
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
