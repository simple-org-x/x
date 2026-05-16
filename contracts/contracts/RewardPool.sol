// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title RewardPool
 * @notice Holds entry-fee deposits for a match and pays out winners
 *         once a server signer (holder of `SIGNER_ROLE`) signs the
 *         match outcome via EIP-712 typed data.
 *
 * @dev Lifecycle:
 *      1. ADMIN_ROLE calls `createMatch` with a unique `matchId`, an
 *         entry token (use `address(0)` for the chain native token),
 *         the per-player `entryFee`, and a player cap.
 *      2. Players call `deposit(matchId)` (sending native value or
 *         after `approve` for ERC-20) until the cap is reached.
 *      3. The off-chain match runner produces a (winners, shares)
 *         payout, signs it with a key whose address holds
 *         `SIGNER_ROLE`, and any caller submits `settle`.
 *      4. Winners pull their funds with `withdraw(matchId)`.
 *
 *      Pull-based payout deliberately prevents a malicious winner
 *      from griefing the settlement transaction by reverting on a
 *      forced transfer.
 *
 *      Sum of `shares` MUST equal the pool exactly. Dust caused by
 *      non-divisible pools should be handled off-chain (e.g. award
 *      the remainder to rank #1) before signing. As a safety net,
 *      `adminSweep(matchId, to)` lets `ADMIN_ROLE` recover any
 *      residual balance after `SWEEP_DELAY` has passed since
 *      settlement (e.g. if a winner permanently loses their key).
 *
 * @dev This contract handles money flow only. It MUST NOT and DOES
 *      NOT alter any in-game stats; the brief's anti pay-to-win
 *      invariant is enforced by keeping all gameplay-affecting
 *      state off-chain.
 */
contract RewardPool is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    /// @notice EIP-712 typeHash for the (matchId, winners, shares) settlement payload.
    bytes32 public constant SETTLEMENT_TYPEHASH =
        keccak256("Settlement(bytes32 matchId,address[] winners,uint256[] shares)");

    /// @notice Delay after settlement before ADMIN_ROLE may sweep unclaimed dust.
    uint256 public constant SWEEP_DELAY = 30 days;

    struct Match {
        address token;        // address(0) means native asset
        uint256 entryFee;
        uint32 maxPlayers;
        uint32 deposits;
        uint256 pool;
        bool created;
        bool settled;
        uint64 settledAt;
    }

    /// @notice matchId -> match metadata.
    mapping(bytes32 => Match) private _matches;

    /// @notice (matchId, recipient) -> withdrawable balance.
    mapping(bytes32 => mapping(address => uint256)) public withdrawable;

    /// @notice (matchId, player) -> true if the player already deposited.
    mapping(bytes32 => mapping(address => bool)) public hasDeposited;

    event MatchCreated(
        bytes32 indexed matchId,
        address indexed token,
        uint256 entryFee,
        uint32 maxPlayers
    );
    event Deposited(bytes32 indexed matchId, address indexed player, uint256 amount);
    event Settled(bytes32 indexed matchId, address[] winners, uint256[] shares);
    event Withdrawn(bytes32 indexed matchId, address indexed recipient, uint256 amount);
    event Swept(bytes32 indexed matchId, address indexed to, uint256 amount);

    error MatchAlreadyExists();
    error MatchNotFound();
    error MatchAlreadySettled();
    error MatchNotSettled();
    error MatchFull();
    error AlreadyDeposited();
    error WrongFee();
    error NativeNotAccepted();
    error ZeroAddress();
    error ZeroEntryFee();
    error ZeroMaxPlayers();
    error LengthMismatch();
    error EmptyWinners();
    error ShareSumMismatch();
    error InvalidSigner();
    error NothingToWithdraw();
    error SweepTooEarly();

    constructor(address admin, address signer) EIP712("CryptoArenaSurvivors.RewardPool", "1") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        if (signer != address(0)) {
            _grantRole(SIGNER_ROLE, signer);
        }
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /// @notice Register a new match. ADMIN_ROLE only.
    function createMatch(
        bytes32 matchId,
        address token,
        uint256 entryFee,
        uint32 maxPlayers
    ) external onlyRole(ADMIN_ROLE) {
        if (matchId == bytes32(0)) revert MatchNotFound();
        if (entryFee == 0) revert ZeroEntryFee();
        if (maxPlayers == 0) revert ZeroMaxPlayers();
        Match storage m = _matches[matchId];
        if (m.created) revert MatchAlreadyExists();

        m.token = token;
        m.entryFee = entryFee;
        m.maxPlayers = maxPlayers;
        m.created = true;

        emit MatchCreated(matchId, token, entryFee, maxPlayers);
    }

    /**
     * @notice Deposit the entry fee for `matchId`.
     * @dev   For native-asset matches, `msg.value` MUST equal the fee.
     *        For ERC-20 matches, the caller MUST have approved the
     *        contract for at least `entryFee` and `msg.value` MUST be
     *        zero.
     */
    function deposit(bytes32 matchId) external payable nonReentrant {
        Match storage m = _matches[matchId];
        if (!m.created) revert MatchNotFound();
        if (m.settled) revert MatchAlreadySettled();
        if (m.deposits >= m.maxPlayers) revert MatchFull();
        if (hasDeposited[matchId][msg.sender]) revert AlreadyDeposited();

        if (m.token == address(0)) {
            if (msg.value != m.entryFee) revert WrongFee();
        } else {
            if (msg.value != 0) revert NativeNotAccepted();
            IERC20(m.token).safeTransferFrom(msg.sender, address(this), m.entryFee);
        }

        unchecked {
            m.deposits += 1;
            m.pool += m.entryFee;
        }
        hasDeposited[matchId][msg.sender] = true;

        emit Deposited(matchId, msg.sender, m.entryFee);
    }

    /**
     * @notice Settle a match by consuming an EIP-712 signature from a
     *         SIGNER_ROLE holder over (matchId, winners, shares).
     *         Anyone may call. Idempotent: a second call reverts.
     */
    function settle(
        bytes32 matchId,
        address[] calldata winners,
        uint256[] calldata shares,
        bytes calldata serverSignature
    ) external nonReentrant {
        Match storage m = _matches[matchId];
        if (!m.created) revert MatchNotFound();
        if (m.settled) revert MatchAlreadySettled();
        if (winners.length == 0) revert EmptyWinners();
        if (winners.length != shares.length) revert LengthMismatch();

        uint256 sum = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            sum += shares[i];
        }
        if (sum != m.pool) revert ShareSumMismatch();

        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                matchId,
                keccak256(abi.encodePacked(winners)),
                keccak256(abi.encodePacked(shares))
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, serverSignature);
        if (!hasRole(SIGNER_ROLE, recovered)) revert InvalidSigner();

        m.settled = true;
        m.settledAt = uint64(block.timestamp);

        for (uint256 i = 0; i < winners.length; i++) {
            withdrawable[matchId][winners[i]] += shares[i];
        }

        emit Settled(matchId, winners, shares);
    }

    /// @notice Pull a winner's payout for `matchId`.
    function withdraw(bytes32 matchId) external nonReentrant {
        uint256 amount = withdrawable[matchId][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[matchId][msg.sender] = 0;

        Match storage m = _matches[matchId];
        if (m.token == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            require(ok, "RewardPool: native transfer failed");
        } else {
            IERC20(m.token).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(matchId, msg.sender, amount);
    }

    /**
     * @notice Recover any residual balance of a settled match to `to`.
     *         Callable only by ADMIN_ROLE and only after `SWEEP_DELAY`
     *         has elapsed since settlement. Intended for permanently
     *         lost-key dust, not as a discretionary clawback.
     */
    function adminSweep(bytes32 matchId, address to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Match storage m = _matches[matchId];
        if (!m.created) revert MatchNotFound();
        if (!m.settled) revert MatchNotSettled();
        if (block.timestamp < uint256(m.settledAt) + SWEEP_DELAY) revert SweepTooEarly();

        uint256 amount;
        if (m.token == address(0)) {
            amount = address(this).balance;
            if (amount == 0) revert NothingToWithdraw();
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "RewardPool: native sweep failed");
        } else {
            amount = IERC20(m.token).balanceOf(address(this));
            if (amount == 0) revert NothingToWithdraw();
            IERC20(m.token).safeTransfer(to, amount);
        }

        emit Swept(matchId, to, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns the EIP-712 domain separator for this contract.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns the (matchId, winners, shares) digest a signer should sign.
    function settlementDigest(
        bytes32 matchId,
        address[] calldata winners,
        uint256[] calldata shares
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_TYPEHASH,
                matchId,
                keccak256(abi.encodePacked(winners)),
                keccak256(abi.encodePacked(shares))
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function getMatch(bytes32 matchId)
        external
        view
        returns (
            address token,
            uint256 entryFee,
            uint32 maxPlayers,
            uint32 deposits,
            uint256 pool,
            bool settled,
            uint64 settledAt
        )
    {
        Match storage m = _matches[matchId];
        if (!m.created) revert MatchNotFound();
        return (m.token, m.entryFee, m.maxPlayers, m.deposits, m.pool, m.settled, m.settledAt);
    }
}
