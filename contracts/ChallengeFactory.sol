// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./BantahPoints.sol";

/**
 * @title ChallengeFactory
 * @dev Main contract for creating, joining, and resolving challenges on Base Testnet Sepolia
 * Supports both admin-created challenges and P2P challenges
 */
contract ChallengeFactory is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    
    // Enums
    enum ChallengeType { ADMIN, P2P }
    enum ChallengeStatus { CREATED, ACTIVE, RESOLVED, CLAIMED, CANCELLED }
    
    // Structs
    struct Challenge {
        uint256 id;
        ChallengeType challengeType;
        address creator;           // Admin or User A
        address participant;       // null for admin, User B for P2P
        uint256 stakeAmount;      // Per side in wei
        address paymentToken;     // USDC or USDT address
        ChallengeStatus status;
        address winner;           // null until resolved
        uint256 createdAt;
        uint256 resolvedAt;
        string metadataURI;       // IPFS hash or JSON
    }
    
    struct AdminChallengeParticipant {
        address user;
        bool side;                // true = YES, false = NO
        uint256 stakeAmount;
        bool claimed;
    }
    
    // State variables
    BantahPoints public pointsToken;
    address public admin;         // Authorized to sign resolutions
    uint256 public nextChallengeId = 1;
    
    // Mappings
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => mapping(address => AdminChallengeParticipant)) public adminParticipants;
    mapping(uint256 => address[]) public yesParticipants;
    mapping(uint256 => address[]) public noParticipants;
    mapping(address => uint256) public userLockedStakes;
    
    // Fee tracking
    uint256 public platformFeePercentage = 1; // 0.1% (in basis points: 1/1000)
    uint256 public totalFeesCollected;
    
    // Events
    event ChallengeCreated(
        uint256 indexed challengeId,
        ChallengeType challengeType,
        address indexed creator,
        uint256 stakeAmount,
        address paymentToken,
        string metadataURI
    );
    
    event ChallengeAccepted(
        uint256 indexed challengeId,
        address indexed participant
    );
    
    event UserJoinedAdminChallenge(
        uint256 indexed challengeId,
        address indexed user,
        bool side,
        uint256 stakeAmount
    );
    
    event ChallengeResolved(
        uint256 indexed challengeId,
        address indexed winner,
        uint256 prizeAmount,
        uint256 pointsAwarded
    );
    
    event PayoutClaimed(
        uint256 indexed challengeId,
        address indexed user,
        uint256 amount
    );
    
    event AdminUpdated(address indexed newAdmin);
    
    event OpenChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        uint256 stakeAmount,
        address paymentToken,
        string metadataURI
    );
    
    event OpenChallengeAccepted(
        uint256 indexed challengeId,
        address indexed acceptor
    );
    
    // Constructor
    constructor(address _pointsToken, address _admin) {
        require(_pointsToken != address(0), "Invalid points token");
        require(_admin != address(0), "Invalid admin");
        pointsToken = BantahPoints(_pointsToken);
        admin = _admin;
    }
    
    /**
     * @dev Create an admin-created challenge (betting pool)
     */
    function createAdminChallenge(
        uint256 stakeAmount,
        address paymentToken,
        string memory metadataURI
    ) external onlyOwner returns (uint256) {
        require(stakeAmount > 0, "Stake must be > 0");
        require(paymentToken != address(0), "Invalid token");
        require(bytes(metadataURI).length > 0, "Invalid metadata");
        
        uint256 challengeId = nextChallengeId++;
        
        challenges[challengeId] = Challenge({
            id: challengeId,
            challengeType: ChallengeType.ADMIN,
            creator: msg.sender,
            participant: address(0),
            stakeAmount: stakeAmount,
            paymentToken: paymentToken,
            status: ChallengeStatus.CREATED,
            winner: address(0),
            createdAt: block.timestamp,
            resolvedAt: 0,
            metadataURI: metadataURI
        });
        
        emit ChallengeCreated(
            challengeId,
            ChallengeType.ADMIN,
            msg.sender,
            stakeAmount,
            paymentToken,
            metadataURI
        );
        
        return challengeId;
    }
    
    /**
     * @dev Create a P2P challenge between two users
     */
    function createP2PChallenge(
        address opponent,
        uint256 stakeAmount,
        address paymentToken,
        string memory metadataURI
    ) external nonReentrant returns (uint256) {
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot challenge yourself");
        require(stakeAmount > 0, "Stake must be > 0");
        require(paymentToken != address(0), "Invalid token");
        
        // Transfer stake from challenger
        require(
            IERC20(paymentToken).transferFrom(msg.sender, address(this), stakeAmount),
            "Stake transfer failed"
        );
        
        uint256 challengeId = nextChallengeId++;
        
        challenges[challengeId] = Challenge({
            id: challengeId,
            challengeType: ChallengeType.P2P,
            creator: msg.sender,
            participant: opponent,
            stakeAmount: stakeAmount,
            paymentToken: paymentToken,
            status: ChallengeStatus.CREATED,
            winner: address(0),
            createdAt: block.timestamp,
            resolvedAt: 0,
            metadataURI: metadataURI
        });
        
        userLockedStakes[msg.sender] += stakeAmount;
        
        emit ChallengeCreated(
            challengeId,
            ChallengeType.P2P,
            msg.sender,
            stakeAmount,
            paymentToken,
            metadataURI
        );
        
        return challengeId;
    }
    
    /**
     * @dev Accept a P2P challenge (deposit stake as opponent)
     */
    function acceptP2PChallenge(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.CREATED, "Invalid status");
        require(msg.sender == challenge.participant, "Not the acceptor");
        require(challenge.challengeType == ChallengeType.P2P, "Not a P2P challenge");
        
        // Transfer stake from acceptor
        require(
            IERC20(challenge.paymentToken).transferFrom(
                msg.sender,
                address(this),
                challenge.stakeAmount
            ),
            "Stake transfer failed"
        );
        
        challenge.status = ChallengeStatus.ACTIVE;
        userLockedStakes[msg.sender] += challenge.stakeAmount;
        
        emit ChallengeAccepted(challengeId, msg.sender);
    }
    
    /**
     * @dev Create an open P2P challenge (anyone can join as opponent)
     * Challenge is fully on-chain from creation
     * First acceptor becomes the opponent
     */
    function createOpenP2PChallenge(
        uint256 stakeAmount,
        address paymentToken,
        string memory metadataURI
    ) external nonReentrant returns (uint256) {
        require(stakeAmount > 0, "Stake must be > 0");
        require(paymentToken != address(0), "Invalid token");
        
        // Transfer stake from challenger
        require(
            IERC20(paymentToken).transferFrom(msg.sender, address(this), stakeAmount),
            "Stake transfer failed"
        );
        
        uint256 challengeId = nextChallengeId++;
        
        challenges[challengeId] = Challenge({
            id: challengeId,
            challengeType: ChallengeType.P2P,
            creator: msg.sender,
            participant: address(0),  // Open (no opponent yet)
            stakeAmount: stakeAmount,
            paymentToken: paymentToken,
            status: ChallengeStatus.CREATED,
            winner: address(0),
            createdAt: block.timestamp,
            resolvedAt: 0,
            metadataURI: metadataURI
        });
        
        userLockedStakes[msg.sender] += stakeAmount;
        
        emit OpenChallengeCreated(
            challengeId,
            msg.sender,
            stakeAmount,
            paymentToken,
            metadataURI
        );
        
        return challengeId;
    }
    
    /**
     * @dev Accept an open P2P challenge (first user to join becomes opponent)
     * This activates the challenge on-chain with both stakes in escrow
     */
    function joinOpenP2PChallenge(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.CREATED, "Challenge not open");
        require(challenge.challengeType == ChallengeType.P2P, "Not a P2P challenge");
        require(challenge.participant == address(0), "Challenge already accepted");
        require(msg.sender != challenge.creator, "Cannot accept own challenge");
        
        // Transfer stake from acceptor
        require(
            IERC20(challenge.paymentToken).transferFrom(
                msg.sender,
                address(this),
                challenge.stakeAmount
            ),
            "Stake transfer failed"
        );
        
        // Set acceptor as participant and activate challenge
        challenge.participant = msg.sender;
        challenge.status = ChallengeStatus.ACTIVE;
        userLockedStakes[msg.sender] += challenge.stakeAmount;
        
        emit OpenChallengeAccepted(challengeId, msg.sender);
    }
    
    /**
     * @dev Join an admin challenge (YES or NO side)
     */
    function joinAdminChallenge(
        uint256 challengeId,
        bool side
    ) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.CREATED || challenge.status == ChallengeStatus.ACTIVE, "Invalid status");
        require(challenge.challengeType == ChallengeType.ADMIN, "Not an admin challenge");
        
        // Transfer stake
        require(
            IERC20(challenge.paymentToken).transferFrom(
                msg.sender,
                address(this),
                challenge.stakeAmount
            ),
            "Stake transfer failed"
        );
        
        // Record participant
        adminParticipants[challengeId][msg.sender] = AdminChallengeParticipant({
            user: msg.sender,
            side: side,
            stakeAmount: challenge.stakeAmount,
            claimed: false
        });
        
        // Track side
        if (side) {
            yesParticipants[challengeId].push(msg.sender);
        } else {
            noParticipants[challengeId].push(msg.sender);
        }
        
        challenge.status = ChallengeStatus.ACTIVE;
        userLockedStakes[msg.sender] += challenge.stakeAmount;
        
        emit UserJoinedAdminChallenge(challengeId, msg.sender, side, challenge.stakeAmount);
    }
    
    /**
     * @dev Resolve a challenge (only admin)
     * Requires signed message from admin
     */
    function resolveChallenge(
        uint256 challengeId,
        address winner,
        uint256 pointsAwarded,
        bytes memory signature
    ) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.ACTIVE || challenge.status == ChallengeStatus.CREATED, "Invalid status");
        require(winner != address(0), "Invalid winner");
        
        // Verify admin signature
        bytes32 messageHash = keccak256(abi.encodePacked(challengeId, winner, pointsAwarded));
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessage, signature);
        
        require(signer == admin, "Invalid admin signature");
        
        // Mark as resolved
        challenge.status = ChallengeStatus.RESOLVED;
        challenge.winner = winner;
        challenge.resolvedAt = block.timestamp;
        
        // Calculate payout
        uint256 totalStake = 0;
        if (challenge.challengeType == ChallengeType.P2P) {
            totalStake = challenge.stakeAmount * 2;
        } else {
            totalStake = challenge.stakeAmount * (yesParticipants[challengeId].length + noParticipants[challengeId].length);
        }
        
        uint256 platformFee = (totalStake * platformFeePercentage) / 1000; // 0.1% fee
        uint256 prizeAmount = totalStake - platformFee;
        totalFeesCollected += platformFee;
        
        // Award points to winner
        pointsToken.awardPoints(winner, pointsAwarded, challengeId, "challenge_win");
        
        emit ChallengeResolved(challengeId, winner, prizeAmount, pointsAwarded);
    }
    
    /**
     * @dev Claim payout after challenge resolved
     */
    function claimPayout(uint256 challengeId) external nonReentrant {
        Challenge storage challenge = challenges[challengeId];
        
        require(challenge.status == ChallengeStatus.RESOLVED, "Challenge not resolved");
        require(msg.sender == challenge.winner, "Not the winner");
        
        // Calculate payout
        uint256 totalStake = 0;
        if (challenge.challengeType == ChallengeType.P2P) {
            totalStake = challenge.stakeAmount * 2;
        } else {
            totalStake = challenge.stakeAmount * (yesParticipants[challengeId].length + noParticipants[challengeId].length);
        }
        
        uint256 platformFee = (totalStake * platformFeePercentage) / 1000; // 0.1% fee
        uint256 payout = totalStake - platformFee;
        
        // Update status to claimed
        challenge.status = ChallengeStatus.CLAIMED;
        
        // Remove locked stakes
        userLockedStakes[msg.sender] = userLockedStakes[msg.sender] > payout 
            ? userLockedStakes[msg.sender] - payout 
            : 0;
        
        // Transfer payout
        require(
            IERC20(challenge.paymentToken).transfer(msg.sender, payout),
            "Payout transfer failed"
        );
        
        emit PayoutClaimed(challengeId, msg.sender, payout);
    }
    
    /**
     * @dev Get challenge details
     */
    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return challenges[challengeId];
    }
    
    /**
     * @dev Get YES side participants for admin challenge
     */
    function getYesParticipants(uint256 challengeId) external view returns (address[] memory) {
        return yesParticipants[challengeId];
    }
    
    /**
     * @dev Get NO side participants for admin challenge
     */
    function getNoParticipants(uint256 challengeId) external view returns (address[] memory) {
        return noParticipants[challengeId];
    }
    
    /**
     * @dev Get user's locked stakes
     */
    function getUserLockedStakes(address user) external view returns (uint256) {
        return userLockedStakes[user];
    }
    
    /**
     * @dev Set admin address
     */
    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
        emit AdminUpdated(newAdmin);
    }
    
    /**
     * @dev Set platform fee percentage (in basis points: 1 = 0.1%)
     * Max 50 basis points (5%)
     */
    function setPlatformFee(uint256 basisPoints) external onlyOwner {
        require(basisPoints <= 50, "Fee too high"); // Max 5%
        platformFeePercentage = basisPoints;
    }
    
    /**
     * @dev Withdraw collected fees
     */
    function withdrawFees(address token) external onlyOwner nonReentrant {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No fees to withdraw");
        
        IERC20(token).transfer(msg.sender, balance);
        totalFeesCollected = 0;
    }
}
