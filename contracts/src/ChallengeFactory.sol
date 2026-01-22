// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./BantahPoints.sol";
import "./ChallengeEscrow.sol";

/**
 * @title ChallengeFactory
 * @dev Creates and manages challenges with ERC20 token stakes
 * Handles both admin-created and P2P challenges
 * Separates stakes (USDC/USDT/ETH) from rewards (BantahPoints)
 */
contract ChallengeFactory is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;
    
    // Enums
    enum ChallengeType { GROUP, P2P }
    enum ChallengeStatus { CREATED, ACTIVE, RESOLVED, CLAIMED, CANCELLED }
    
    // Structs
    struct Challenge {
        uint256 id;
        ChallengeType challengeType;
        address creator;              // Admin or User A
        address participant;          // null for admin, User B for P2P
        address paymentToken;         // USDC, USDT, ETH, etc.
        uint256 stakeAmount;          // Per side in wei (the actual stake)
        uint256 pointsReward;         // BantahPoints given to winner
        ChallengeStatus status;
        address winner;               // null until resolved
        uint256 createdAt;
        uint256 resolvedAt;
        string metadataURI;           // IPFS hash or JSON
    }
    
    struct GroupChallengeParticipant {
        address user;
        bool side;                    // true = YES, false = NO
        uint256 stakeAmount;
        bool claimed;
    }
    
    // State variables
    BantahPoints public pointsToken;
    ChallengeEscrow public stakeEscrow;
    address public admin;              // Authorized to sign resolutions
    address public platformFeeRecipient;  // Where platform fees go
    uint256 public nextChallengeId = 1;
    uint256 public platformFeePercentage = 10;  // 0.1% = 10 basis points (10/10000)
    
    // Mappings
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => GroupChallengeParticipant[]) public groupChallengeParticipants;
    mapping(uint256 => uint256) public p2pChallengeAmounts;
    mapping(address => bool) public verifiedTokens;  // Optional: featured/verified creator coins
    mapping(address => bool) public blacklistedTokens;  // Scam tokens
    mapping(address => uint256) public platformFeeBalance;  // token => amount
    
    // Events
    event ChallengeCreatedGroup(
        uint256 indexed challengeId,
        address indexed creator,
        address indexed paymentToken,
        uint256 stakeAmount,
        uint256 pointsReward
    );
    
    event ChallengeCreatedP2P(
        uint256 indexed challengeId,
        address indexed creator,
        address indexed participant,
        address paymentToken,
        uint256 stakeAmount,
        uint256 pointsReward
    );
    
    event ChallengeResolved(
        uint256 indexed challengeId,
        address indexed winner,
        address indexed paymentToken,
        uint256 stakeAmount,
        uint256 pointsAwarded
    );
    
    event StakeClaimed(
        uint256 indexed challengeId,
        address indexed user,
        address indexed paymentToken,
        uint256 amount
    );
    
    event PaymentTokenToggled(address indexed token, bool enabled);
    event AdminUpdated(address indexed newAdmin);
    event PlatformFeeRecipientUpdated(address indexed newRecipient);
    event PlatformFeePercentageUpdated(uint256 newPercentage);
    event PlatformFeeCollected(address indexed token, uint256 amount);
    event PlatformFeeWithdrawn(address indexed token, uint256 amount, address indexed recipient);
    event TokenVerified(address indexed token, bool verified);
    event TokenBlacklisted(address indexed token, bool blacklisted);
    
    // Constructor
    constructor(
        address _pointsToken,
        address _stakeEscrow,
        address _admin,
        address _platformFeeRecipient
    ) Ownable(msg.sender) {
        require(_pointsToken != address(0), "Invalid points token");
        require(_stakeEscrow != address(0), "Invalid escrow");
        require(_admin != address(0), "Invalid admin");
        require(_platformFeeRecipient != address(0), "Invalid fee recipient");
        
        pointsToken = BantahPoints(_pointsToken);
        stakeEscrow = ChallengeEscrow(_stakeEscrow);
        admin = _admin;
        platformFeeRecipient = _platformFeeRecipient;
    }
    
    /**
     * @dev Create a group challenge (betting pool)
     * Users choose a side and stake payment tokens
     * Winner receives stake from losers + BantahPoints reward
     */
    function createGroupChallenge(
        address paymentToken,
        uint256 stakeAmount,
        uint256 pointsReward,
        string calldata metadataURI
    ) external onlyOwner nonReentrant returns (uint256) {
        require(paymentToken != address(0), "Invalid payment token");
        require(!blacklistedTokens[paymentToken], "Token is blacklisted");
        require(stakeAmount > 0, "Stake must be > 0");
        require(pointsReward > 0, "Points reward must be > 0");
        
        uint256 challengeId = nextChallengeId++;
        
        Challenge storage newChallenge = challenges[challengeId];
        newChallenge.id = challengeId;
        newChallenge.challengeType = ChallengeType.GROUP;
        newChallenge.creator = msg.sender;
        newChallenge.paymentToken = paymentToken;
        newChallenge.stakeAmount = stakeAmount;
        newChallenge.pointsReward = pointsReward;
        newChallenge.status = ChallengeStatus.CREATED;
        newChallenge.createdAt = block.timestamp;
        newChallenge.metadataURI = metadataURI;
        
        emit ChallengeCreatedGroup(
            challengeId,
            msg.sender,
            paymentToken,
            stakeAmount,
            pointsReward
        );
        
        return challengeId;
    }
    
    /**
     * @dev Create a P2P challenge between two users or open challenge
     * User A (caller) stakes paymentToken
     * If participant = address(0): Open challenge (anyone can accept)
     * If participant != address(0): Direct P2P (only participant can accept)
     */
    function createP2PChallenge(
        address participant,
        address paymentToken,
        uint256 stakeAmount,
        uint256 pointsReward,
        string calldata metadataURI
    ) external nonReentrant returns (uint256) {
        // For direct P2P: participant must be specified and not creator
        // For open challenge: participant can be address(0)
        if (participant != address(0)) {
            require(participant != msg.sender, "Cannot challenge yourself");
        }
        require(paymentToken != address(0), "Invalid payment token");
        require(!blacklistedTokens[paymentToken], "Token is blacklisted");
        require(stakeAmount > 0, "Stake must be > 0");
        require(pointsReward > 0, "Points reward must be > 0");
        
        // Transfer stake from User A to escrow
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(stakeEscrow), stakeAmount);
        
        uint256 challengeId = nextChallengeId++;
        
        Challenge storage newChallenge = challenges[challengeId];
        newChallenge.id = challengeId;
        newChallenge.challengeType = ChallengeType.P2P;
        newChallenge.creator = msg.sender;
        newChallenge.participant = participant;
        newChallenge.paymentToken = paymentToken;
        newChallenge.stakeAmount = stakeAmount;
        newChallenge.pointsReward = pointsReward;
        newChallenge.status = ChallengeStatus.CREATED;
        newChallenge.createdAt = block.timestamp;
        newChallenge.metadataURI = metadataURI;
        
        // Lock creator's stake in escrow
        stakeEscrow.lockStake(msg.sender, paymentToken, stakeAmount, challengeId);
        
        emit ChallengeCreatedP2P(
            challengeId,
            msg.sender,
            participant,
            paymentToken,
            stakeAmount,
            pointsReward
        );
        
        return challengeId;
    }
    
    /**
     * @dev Accept a P2P challenge (User B stakes matching amount)
     * For direct P2P: msg.sender must be the specified participant
     * For open challenge: msg.sender can be anyone (becomes the participant)
     */
    function acceptP2PChallenge(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.challengeType == ChallengeType.P2P, "Not P2P challenge");
        require(challenge.status == ChallengeStatus.CREATED, "Challenge not open");
        require(msg.sender != challenge.creator, "Creator cannot accept own challenge");
        
        // For direct P2P challenges: verify msg.sender is the specified participant
        if (challenge.participant != address(0)) {
            require(msg.sender == challenge.participant, "Not the specified participant");
        } else {
            // For open challenges: set msg.sender as the participant
            challenge.participant = msg.sender;
        }
        
        // Transfer participant's stake to escrow
        IERC20(challenge.paymentToken).safeTransferFrom(
            msg.sender,
            address(stakeEscrow),
            challenge.stakeAmount
        );
        
        // Lock participant's stake
        stakeEscrow.lockStake(
            msg.sender,
            challenge.paymentToken,
            challenge.stakeAmount,
            challengeId
        );
        
        challenge.status = ChallengeStatus.ACTIVE;
    }
    
    /**
     * @dev Resolve a challenge with admin signature
     * Winner receives:
     * - Loser's stake minus platform fee
     * - BantahPoints reward
     */
    function resolveChallenge(
        uint256 challengeId,
        address winner,
        bytes memory signature
    ) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(
            challenge.status == ChallengeStatus.CREATED ||
            challenge.status == ChallengeStatus.ACTIVE,
            "Invalid status"
        );
        require(winner != address(0), "Invalid winner");
        
        // Verify admin signature
        bytes32 messageHash = keccak256(abi.encodePacked(challengeId, winner));
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessage, signature);
        
        require(signer == admin, "Invalid admin signature");
        
        // Update challenge
        challenge.status = ChallengeStatus.RESOLVED;
        challenge.winner = winner;
        challenge.resolvedAt = block.timestamp;
        
        // Calculate total pot and platform fee
        uint256 totalPot = 0;
        address loser;
        
        if (challenge.challengeType == ChallengeType.P2P) {
            // P2P: Total pot = both stakes (2x stakeAmount)
            totalPot = challenge.stakeAmount * 2;
            loser = winner == challenge.creator ? challenge.participant : challenge.creator;
        } else if (challenge.challengeType == ChallengeType.GROUP) {
            // Group: Total pot = sum of all losing stakes
            GroupChallengeParticipant[] storage participants = groupChallengeParticipants[challengeId];
            for (uint256 i = 0; i < participants.length; i++) {
                if (participants[i].user != winner) {
                    totalPot += participants[i].stakeAmount;
                }
            }
        }
        
        // Calculate platform fee (0.1% = 10 basis points)
        uint256 platformFee = (totalPot * platformFeePercentage) / 10000;
        uint256 winnerAmount = totalPot - platformFee;
        
        // Record platform fee
        if (platformFee > 0) {
            platformFeeBalance[challenge.paymentToken] += platformFee;
            emit PlatformFeeCollected(challenge.paymentToken, platformFee);
        }
        
        // Transfer winner's payout from escrow
        stakeEscrow.transferStake(
            loser != address(0) ? loser : address(this),
            winner,
            challenge.paymentToken,
            winnerAmount,
            challengeId
        );
        
        // Award BantahPoints to winner
        pointsToken.awardPoints(
            winner,
            challenge.pointsReward,
            challengeId,
            "Challenge victory"
        );
        
        emit ChallengeResolved(
            challengeId,
            winner,
            challenge.paymentToken,
            challenge.stakeAmount,
            challenge.pointsReward
        );
    }
    
    /**
     * @dev Claim stakes after challenge resolution
     * Winners receive stake payout + already received points
     */
    function claimStake(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.RESOLVED, "Challenge not resolved");
        require(challenge.winner == msg.sender, "Only winner can claim");
        require(challenge.winner != address(0), "No winner set");
        
        // Escrow handles actual transfer
        address[] memory winners = new address[](1);
        winners[0] = msg.sender;
        
        challenge.status = ChallengeStatus.CLAIMED;
        
        emit StakeClaimed(
            challengeId,
            msg.sender,
            challenge.paymentToken,
            challenge.stakeAmount
        );
    }
    
    /**
     * @dev Add a token to verified/featured list (optional, for UI highlighting)
     */
    function verifyToken(address token, bool verified) external onlyOwner {
        require(token != address(0), "Invalid token");
        verifiedTokens[token] = verified;
        emit TokenVerified(token, verified);
    }
    
    /**
     * @dev Blacklist a malicious token to prevent usage
     */
    function blacklistToken(address token, bool blacklisted) external onlyOwner {
        require(token != address(0), "Invalid token");
        blacklistedTokens[token] = blacklisted;
        emit TokenBlacklisted(token, blacklisted);
    }
    
    /**
     * @dev Check if token is verified
     */
    function isTokenVerified(address token) external view returns (bool) {
        return verifiedTokens[token];
    }
    
    /**
     * @dev Check if token is blacklisted
     */
    function isTokenBlacklisted(address token) external view returns (bool) {
        return blacklistedTokens[token];
    }
    
    /**
     * @dev Update admin address
     */
    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
        emit AdminUpdated(newAdmin);
    }
    
    /**
     * @dev Update platform fee recipient
     */
    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        platformFeeRecipient = newRecipient;
        emit PlatformFeeRecipientUpdated(newRecipient);
    }
    
    /**
     * @dev Update platform fee percentage (in basis points, 10 = 0.1%)
     */
    function setPlatformFeePercentage(uint256 newPercentage) external onlyOwner {
        require(newPercentage <= 10000, "Fee too high");  // Max 100%
        platformFeePercentage = newPercentage;
        emit PlatformFeePercentageUpdated(newPercentage);
    }
    
    /**
     * @dev Get accumulated platform fees for a token
     */
    function getPlatformFeeBalance(address token) external view returns (uint256) {
        return platformFeeBalance[token];
    }
    
    /**
     * @dev Withdraw accumulated platform fees
     */
    function withdrawPlatformFees(address token) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 amount = platformFeeBalance[token];
        require(amount > 0, "No fees to withdraw");
        
        platformFeeBalance[token] = 0;
        IERC20(token).safeTransfer(platformFeeRecipient, amount);
        
        emit PlatformFeeWithdrawn(token, amount, platformFeeRecipient);
    }
    
    /**
     * @dev Get challenge details
     */
    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return challenges[challengeId];
    }
}
