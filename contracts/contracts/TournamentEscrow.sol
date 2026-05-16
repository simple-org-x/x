// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title TournamentEscrow
 * @notice Holds entry fees for a scheduled tournament and pays out
 *         winners proportionally to a fixed prize-share schedule
 *         once a SIGNER_ROLE address signs the final ranking.
 *
 * @dev    `prizeShares` is a fixed-precision distribution where the
 *         basis is the sum of all share values (typically 100 for
 *         percentages). Payouts are pull-based via `claim` to avoid
 *         griefing the finalisation transaction.
 */
contract TournamentEscrow is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    /// @notice EIP-712 typeHash for the (tournamentId, winners) finalisation payload.
    bytes32 public constant FINALIZATION_TYPEHASH =
        keccak256("Finalization(bytes32 tournamentId,address[] winners)");

    struct Tournament {
        address token;        // address(0) means native asset
        uint256 entryFee;
        uint64 startTime;
        bool created;
        bool finalized;
        uint256 pool;
        uint32 entrants;
        uint256 sharesTotal;
    }

    /// @notice tournamentId -> tournament metadata.
    mapping(bytes32 => Tournament) private _tournaments;

    /// @notice tournamentId -> prize-share schedule (rank -> share weight).
    mapping(bytes32 => uint256[]) private _prizeShares;

    /// @notice (tournamentId, recipient) -> withdrawable balance.
    mapping(bytes32 => mapping(address => uint256)) public withdrawable;

    /// @notice (tournamentId, player) -> true if the player entered.
    mapping(bytes32 => mapping(address => bool)) public hasEntered;

    event TournamentCreated(
        bytes32 indexed tournamentId,
        address indexed token,
        uint256 entryFee,
        uint64 startTime,
        uint256[] prizeShares
    );
    event Entered(bytes32 indexed tournamentId, address indexed player, uint256 amount);
    event Finalized(bytes32 indexed tournamentId, address[] winners, uint256[] payouts);
    event Claimed(bytes32 indexed tournamentId, address indexed recipient, uint256 amount);

    error TournamentAlreadyExists();
    error TournamentNotFound();
    error TournamentAlreadyFinalized();
    error TournamentNotStarted();
    error TournamentAlreadyStarted();
    error AlreadyEntered();
    error EmptyPrizeShares();
    error EmptyWinners();
    error WinnersExceedShares();
    error WrongFee();
    error NativeNotAccepted();
    error ZeroAddress();
    error ZeroEntryFee();
    error InvalidStartTime();
    error InvalidSigner();
    error NothingToClaim();

    constructor(address admin, address signer) EIP712("CryptoArenaSurvivors.TournamentEscrow", "1") {
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

    /// @notice Schedule a new tournament. ADMIN_ROLE only.
    function createTournament(
        bytes32 tournamentId,
        address token,
        uint256 entryFee,
        uint64 startTime,
        uint256[] calldata shares
    ) external onlyRole(ADMIN_ROLE) {
        if (tournamentId == bytes32(0)) revert TournamentNotFound();
        if (entryFee == 0) revert ZeroEntryFee();
        if (startTime <= block.timestamp) revert InvalidStartTime();
        if (shares.length == 0) revert EmptyPrizeShares();

        Tournament storage t = _tournaments[tournamentId];
        if (t.created) revert TournamentAlreadyExists();

        uint256 sharesTotal;
        for (uint256 i = 0; i < shares.length; i++) {
            sharesTotal += shares[i];
        }
        if (sharesTotal == 0) revert EmptyPrizeShares();

        t.token = token;
        t.entryFee = entryFee;
        t.startTime = startTime;
        t.created = true;
        t.sharesTotal = sharesTotal;

        // Copy calldata into storage explicitly.
        uint256[] storage stored = _prizeShares[tournamentId];
        for (uint256 i = 0; i < shares.length; i++) {
            stored.push(shares[i]);
        }

        emit TournamentCreated(tournamentId, token, entryFee, startTime, shares);
    }

    /// @notice Enter the tournament before `startTime`.
    function enter(bytes32 tournamentId) external payable nonReentrant {
        Tournament storage t = _tournaments[tournamentId];
        if (!t.created) revert TournamentNotFound();
        if (t.finalized) revert TournamentAlreadyFinalized();
        if (block.timestamp >= t.startTime) revert TournamentAlreadyStarted();
        if (hasEntered[tournamentId][msg.sender]) revert AlreadyEntered();

        if (t.token == address(0)) {
            if (msg.value != t.entryFee) revert WrongFee();
        } else {
            if (msg.value != 0) revert NativeNotAccepted();
            IERC20(t.token).safeTransferFrom(msg.sender, address(this), t.entryFee);
        }

        unchecked {
            t.entrants += 1;
            t.pool += t.entryFee;
        }
        hasEntered[tournamentId][msg.sender] = true;

        emit Entered(tournamentId, msg.sender, t.entryFee);
    }

    /**
     * @notice Finalise the tournament with an EIP-712-signed list of
     *         winners (rank-ordered). Winners share the pool by the
     *         configured `prizeShares` weights. Anyone may submit.
     */
    function finalize(
        bytes32 tournamentId,
        address[] calldata winners,
        bytes calldata serverSignature
    ) external nonReentrant {
        Tournament storage t = _tournaments[tournamentId];
        if (!t.created) revert TournamentNotFound();
        if (t.finalized) revert TournamentAlreadyFinalized();
        if (block.timestamp < t.startTime) revert TournamentNotStarted();
        if (winners.length == 0) revert EmptyWinners();

        uint256[] storage shares = _prizeShares[tournamentId];
        if (winners.length > shares.length) revert WinnersExceedShares();

        bytes32 structHash = keccak256(
            abi.encode(
                FINALIZATION_TYPEHASH,
                tournamentId,
                keccak256(abi.encodePacked(winners))
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, serverSignature);
        if (!hasRole(SIGNER_ROLE, recovered)) revert InvalidSigner();

        t.finalized = true;

        // Compute the prize-share denominator: only the share weights
        // for ranks that have winners count, so a tournament with
        // empty seats still pays out the full pool.
        uint256 weightSum;
        for (uint256 i = 0; i < winners.length; i++) {
            weightSum += shares[i];
        }
        require(weightSum > 0, "TournamentEscrow: zero weight");

        uint256 pool = t.pool;
        uint256[] memory payouts = new uint256[](winners.length);
        uint256 distributed;
        for (uint256 i = 0; i < winners.length; i++) {
            // Rounding goes to the last-ranked winner so the
            // top-of-podium share matches the configured weight
            // exactly, while sum(payouts) still equals pool.
            uint256 amount = i == winners.length - 1
                ? pool - distributed
                : (pool * shares[i]) / weightSum;
            payouts[i] = amount;
            withdrawable[tournamentId][winners[i]] += amount;
            distributed += amount;
        }

        emit Finalized(tournamentId, winners, payouts);
    }

    /// @notice Pull a winner's payout for `tournamentId`.
    function claim(bytes32 tournamentId) external nonReentrant {
        uint256 amount = withdrawable[tournamentId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        withdrawable[tournamentId][msg.sender] = 0;

        Tournament storage t = _tournaments[tournamentId];
        if (t.token == address(0)) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            require(ok, "TournamentEscrow: native transfer failed");
        } else {
            IERC20(t.token).safeTransfer(msg.sender, amount);
        }

        emit Claimed(tournamentId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns the EIP-712 domain separator for this contract.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns the digest a signer should sign for finalisation.
    function finalizationDigest(bytes32 tournamentId, address[] calldata winners)
        external
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                FINALIZATION_TYPEHASH,
                tournamentId,
                keccak256(abi.encodePacked(winners))
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function getTournament(bytes32 tournamentId)
        external
        view
        returns (
            address token,
            uint256 entryFee,
            uint64 startTime,
            uint256 pool,
            uint32 entrants,
            bool finalized
        )
    {
        Tournament storage t = _tournaments[tournamentId];
        if (!t.created) revert TournamentNotFound();
        return (t.token, t.entryFee, t.startTime, t.pool, t.entrants, t.finalized);
    }

    function prizeShares(bytes32 tournamentId) external view returns (uint256[] memory) {
        if (!_tournaments[tournamentId].created) revert TournamentNotFound();
        return _prizeShares[tournamentId];
    }
}
