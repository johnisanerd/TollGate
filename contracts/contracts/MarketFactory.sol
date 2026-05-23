// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable}       from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable}      from "@openzeppelin/contracts/utils/Pausable.sol";
import {CopyTradeMarket} from "./CopyTradeMarket.sol";

/// @title  MarketFactory
/// @notice Deploys and tracks CopyTradeMarket instances. One market per
///         (operator, baseSymbol, quoteToken) triple — duplicates are blocked.
contract MarketFactory is Ownable, Pausable {

    struct MarketInfo {
        address market;
        address operator;
        IERC20  quoteToken;
        string  baseSymbol;
        uint64  createdAt;
    }

    /// @dev key = keccak256(operator || baseSymbol || quoteToken)
    mapping(bytes32 => address) public marketByKey;
    address[] public allMarkets;

    /// @notice Hard caps on what newly-created markets can configure. Defence in
    ///         depth above CopyTradeMarket's own bounds.
    uint16  public maxPerformanceFeeBps;
    uint16  public maxKillThresholdBps;
    uint16  public minKillThresholdBps;
    uint256 public minStakeFloor;
    uint256 public maxStakeCeiling;

    event MarketDeployed(
        address indexed market,
        address indexed operator,
        IERC20  indexed quoteToken,
        string  baseSymbol,
        uint16  performanceFeeBps,
        uint16  killThresholdBps,
        uint256 minStake,
        uint256 maxStake
    );

    event PolicyUpdated(
        uint16 maxPerformanceFeeBps,
        uint16 maxKillThresholdBps,
        uint16 minKillThresholdBps,
        uint256 minStakeFloor,
        uint256 maxStakeCeiling
    );

    error MarketAlreadyExists(bytes32 key, address existing);
    error PolicyViolation(string field);
    error ZeroAddress();
    error EmptyBaseSymbol();

    constructor(address owner_) Ownable(owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        maxPerformanceFeeBps = 2_000;        // 20%
        maxKillThresholdBps  = 5_000;        // 50%
        minKillThresholdBps  = 500;          // 5%
        minStakeFloor        = 1_000_000;     // $1 USDC (6 decimals)
        maxStakeCeiling      = 1_000_000_000; // $1,000 USDC default ceiling
    }

    // ── Owner: update policy ───────────────────────────────────────────────────

    function setPolicy(
        uint16  maxPerformanceFeeBps_,
        uint16  maxKillThresholdBps_,
        uint16  minKillThresholdBps_,
        uint256 minStakeFloor_,
        uint256 maxStakeCeiling_
    ) external onlyOwner {
        if (maxPerformanceFeeBps_ > 2_000) revert PolicyViolation("perfFee");
        if (maxKillThresholdBps_  > 5_000 || minKillThresholdBps_ < 100 || minKillThresholdBps_ > maxKillThresholdBps_) {
            revert PolicyViolation("killBounds");
        }
        if (minStakeFloor_ == 0 || maxStakeCeiling_ < minStakeFloor_) revert PolicyViolation("stakeBounds");

        maxPerformanceFeeBps = maxPerformanceFeeBps_;
        maxKillThresholdBps  = maxKillThresholdBps_;
        minKillThresholdBps  = minKillThresholdBps_;
        minStakeFloor        = minStakeFloor_;
        maxStakeCeiling      = maxStakeCeiling_;

        emit PolicyUpdated(maxPerformanceFeeBps_, maxKillThresholdBps_, minKillThresholdBps_, minStakeFloor_, maxStakeCeiling_);
    }

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    // ── Permissionless market creation ─────────────────────────────────────────

    function createMarket(
        address operator,
        IERC20  quoteToken,
        string calldata baseSymbol,
        uint16  performanceFeeBps,
        uint16  killThresholdBps,
        uint256 minStake,
        uint256 maxStake
    ) external whenNotPaused returns (address market) {
        if (operator == address(0) || address(quoteToken) == address(0)) revert ZeroAddress();
        if (bytes(baseSymbol).length == 0 || bytes(baseSymbol).length > 32) revert EmptyBaseSymbol();
        if (performanceFeeBps > maxPerformanceFeeBps) revert PolicyViolation("perfFee");
        if (killThresholdBps  < minKillThresholdBps || killThresholdBps > maxKillThresholdBps) revert PolicyViolation("killBounds");
        if (minStake < minStakeFloor)   revert PolicyViolation("minStake");
        if (maxStake > maxStakeCeiling) revert PolicyViolation("maxStake");

        bytes32 key = keccak256(abi.encodePacked(operator, baseSymbol, address(quoteToken)));
        address existing = marketByKey[key];
        if (existing != address(0)) revert MarketAlreadyExists(key, existing);

        CopyTradeMarket m = new CopyTradeMarket(
            owner(),
            operator,
            quoteToken,
            baseSymbol,
            performanceFeeBps,
            killThresholdBps,
            minStake,
            maxStake
        );

        market = address(m);
        marketByKey[key] = market;
        allMarkets.push(market);

        emit MarketDeployed(market, operator, quoteToken, baseSymbol, performanceFeeBps, killThresholdBps, minStake, maxStake);
    }

    // ── Views ──────────────────────────────────────────────────────────────────

    function marketCount() external view returns (uint256) { return allMarkets.length; }

    function getMarketsPaged(uint256 start, uint256 count)
        external
        view
        returns (MarketInfo[] memory page)
    {
        uint256 len = allMarkets.length;
        if (start >= len) return new MarketInfo[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        page = new MarketInfo[](end - start);
        for (uint256 i = start; i < end; i++) {
            address m = allMarkets[i];
            CopyTradeMarket market = CopyTradeMarket(m);
            page[i - start] = MarketInfo({
                market:     m,
                operator:   market.operator(),
                quoteToken: market.quoteToken(),
                baseSymbol: market.baseSymbol(),
                createdAt:  0
            });
        }
    }

    function marketFor(address operator, string calldata baseSymbol, IERC20 quoteToken)
        external
        view
        returns (address)
    {
        return marketByKey[keccak256(abi.encodePacked(operator, baseSymbol, address(quoteToken)))];
    }
}
