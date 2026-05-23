// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl}    from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable}         from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard}  from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20}           from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}        from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal swap adapter interface — implemented by whatever DEX or
///         direct Circle USYC mint/burn surface is available on the deploy chain.
///         The router never assumes a specific DEX; it just calls swap().
interface IUsycAdapter {
    function swap(IERC20 fromToken, IERC20 toToken, uint256 amountIn, uint256 minOut, address recipient)
        external
        returns (uint256 amountOut);
}

/// @title  UsycRouter
/// @notice On-RISK_OFF: swap USDC → USYC (yield-bearing T-bills).
///         On-BULL:     swap USYC → USDC (deploy back into ArcMind strategies).
///
/// Security:
///   * AccessControl — DEFAULT_ADMIN_ROLE (set adapter / pause), ROUTER_OPERATOR_ROLE
///     (call swaps from agent or treasury).
///   * Pausable + ReentrancyGuard.
///   * SafeERC20 + forceApprove for non-standard tokens.
///   * CEI ordering: state updated BEFORE external call to adapter.
///   * No fabricated swap. If adapter or USYC token is unset, the swap function
///     reverts with AdapterNotConfigured — never silently keeps USDC and emits
///     a fake "swap" event.
contract UsycRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROUTER_OPERATOR_ROLE = keccak256("ROUTER_OPERATOR_ROLE");

    IERC20  public immutable usdc;
    IERC20  public usyc;
    IUsycAdapter public adapter;

    uint256 public totalSwappedToUsyc;
    uint256 public totalSwappedToUsdc;
    uint64  public lastRiskOffAt;
    uint64  public lastBullAt;

    event SwapToUsyc(uint256 usdcIn, uint256 usycOut, uint256 minOut, address indexed caller, string reason);
    event SwapToUsdc(uint256 usycIn, uint256 usdcOut, uint256 minOut, address indexed caller, string reason);
    event AdapterUpdated(address indexed previous, address indexed current);
    event UsycTokenUpdated(address indexed previous, address indexed current);

    error AdapterNotConfigured();
    error UsycTokenNotSet();
    error ZeroAmount();
    error SlippageTooHigh(uint256 received, uint256 minOut);

    constructor(address admin, IERC20 _usdc) {
        require(address(_usdc) != address(0), "zero_usdc");
        usdc = _usdc;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ROUTER_OPERATOR_ROLE, admin);
    }

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause();   }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function setUsycToken(IERC20 token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit UsycTokenUpdated(address(usyc), address(token));
        usyc = token;
    }

    function setAdapter(IUsycAdapter newAdapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit AdapterUpdated(address(adapter), address(newAdapter));
        adapter = newAdapter;
    }

    /// @notice RISK_OFF route: pull USDC from caller, forward to adapter, send USYC back.
    function swapToUsyc(uint256 amountIn, uint256 minOut, string calldata reason)
        external
        whenNotPaused
        nonReentrant
        onlyRole(ROUTER_OPERATOR_ROLE)
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (address(usyc)    == address(0)) revert UsycTokenNotSet();
        if (address(adapter) == address(0)) revert AdapterNotConfigured();

        // Effects
        unchecked { totalSwappedToUsyc += amountIn; }
        lastRiskOffAt = uint64(block.timestamp);

        // Interactions
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);
        usdc.forceApprove(address(adapter), amountIn);
        amountOut = adapter.swap(usdc, usyc, amountIn, minOut, msg.sender);
        if (amountOut < minOut) revert SlippageTooHigh(amountOut, minOut);

        emit SwapToUsyc(amountIn, amountOut, minOut, msg.sender, reason);
    }

    /// @notice BULL route: USYC → USDC.
    function swapToUsdc(uint256 amountIn, uint256 minOut, string calldata reason)
        external
        whenNotPaused
        nonReentrant
        onlyRole(ROUTER_OPERATOR_ROLE)
        returns (uint256 amountOut)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (address(usyc)    == address(0)) revert UsycTokenNotSet();
        if (address(adapter) == address(0)) revert AdapterNotConfigured();

        // Effects
        unchecked { totalSwappedToUsdc += amountIn; }
        lastBullAt = uint64(block.timestamp);

        // Interactions
        usyc.safeTransferFrom(msg.sender, address(this), amountIn);
        usyc.forceApprove(address(adapter), amountIn);
        amountOut = adapter.swap(usyc, usdc, amountIn, minOut, msg.sender);
        if (amountOut < minOut) revert SlippageTooHigh(amountOut, minOut);

        emit SwapToUsdc(amountIn, amountOut, minOut, msg.sender, reason);
    }

    /// @notice Admin escape hatch for stuck tokens.
    function rescue(IERC20 token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        token.safeTransfer(to, amount);
    }
}

/// @notice Bare-bones adapter used in tests + as a reference implementation.
///         A real deployment wraps a Uniswap/Curve pool or Circle USYC mint/burn.
contract MockOneToOneAdapter is IUsycAdapter {
    using SafeERC20 for IERC20;

    function swap(IERC20 fromToken, IERC20 toToken, uint256 amountIn, uint256 minOut, address recipient)
        external
        override
        returns (uint256 amountOut)
    {
        fromToken.safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn;
        require(amountOut >= minOut, "slippage");
        toToken.safeTransfer(recipient, amountOut);
    }
}
