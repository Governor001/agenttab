// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AgentTab is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidAmount();
    error InvalidLimits();
    error NotPayer();
    error NotProvider();
    error NotPayerOrAgent();
    error NotPayerOrProvider();
    error TabNotOpen();
    error TabIsPaused();
    error TabExpired();
    error DailyCapExceeded();

    address public constant USDC = 0x3600000000000000000000000000000000000000;
    IERC20 private constant USDC_TOKEN = IERC20(USDC);

    struct Tab {
        address payer;
        address agent;
        address provider;
        uint256 balance;
        uint256 maxPerCharge;
        uint256 dailyCap;
        uint256 spentToday;
        uint256 dayIndex;
        uint256 expiry;
        uint256 totalCharged;
        uint256 chargeCount;
        bool paused;
        bool open;
        string label;
    }

    mapping(uint256 => Tab) public tabs;
    uint256 public tabCount;
    mapping(address => uint256[]) private _tabsByPayer;
    mapping(address => uint256[]) private _tabsByProvider;

    event TabOpened(
        uint256 indexed tabId,
        address indexed payer,
        address indexed provider,
        address agent,
        uint256 deposit,
        uint256 maxPerCharge,
        uint256 dailyCap,
        uint256 expiry,
        string label
    );
    event TabToppedUp(uint256 indexed tabId, address indexed payer, uint256 amount, uint256 newBalance);
    event Charged(
        uint256 indexed tabId,
        address indexed provider,
        uint256 amount,
        bytes32 indexed jobRef,
        uint256 balanceAfter
    );
    event TabPaused(uint256 indexed tabId, bool paused, address indexed by);
    event LimitsUpdated(uint256 indexed tabId, uint256 maxPerCharge, uint256 dailyCap);
    event TabClosed(uint256 indexed tabId, address indexed by, uint256 refund);

    function openTab(
        address provider,
        address agent,
        uint256 deposit,
        uint256 maxPerCharge,
        uint256 dailyCap,
        uint256 expiry,
        string calldata label
    ) external returns (uint256 tabId) {
        if (provider == address(0) || agent == address(0)) revert ZeroAddress();
        if (deposit == 0) revert InvalidAmount();
        if (maxPerCharge == 0 || dailyCap == 0 || maxPerCharge > dailyCap) revert InvalidLimits();
        if (expiry != 0 && expiry <= block.timestamp) revert InvalidLimits();

        USDC_TOKEN.safeTransferFrom(msg.sender, address(this), deposit);

        tabId = tabCount;
        tabCount++;

        tabs[tabId] = Tab({
            payer: msg.sender,
            agent: agent,
            provider: provider,
            balance: deposit,
            maxPerCharge: maxPerCharge,
            dailyCap: dailyCap,
            spentToday: 0,
            dayIndex: block.timestamp / 1 days,
            expiry: expiry,
            totalCharged: 0,
            chargeCount: 0,
            paused: false,
            open: true,
            label: label
        });

        _tabsByPayer[msg.sender].push(tabId);
        _tabsByProvider[provider].push(tabId);

        emit TabOpened(tabId, msg.sender, provider, agent, deposit, maxPerCharge, dailyCap, expiry, label);
    }

    function topUp(uint256 tabId, uint256 amount) external {
        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.payer) revert NotPayer();
        if (!tab.open) revert TabNotOpen();
        if (amount == 0) revert InvalidAmount();

        USDC_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        tab.balance += amount;

        emit TabToppedUp(tabId, msg.sender, amount, tab.balance);
    }

    function charge(uint256 tabId, uint256 amount, bytes32 jobRef) external nonReentrant {
        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.provider) revert NotProvider();
        if (!tab.open) revert TabNotOpen();
        if (tab.paused) revert TabIsPaused();
        if (tab.expiry != 0 && block.timestamp > tab.expiry) revert TabExpired();
        if (amount == 0) revert InvalidAmount();
        if (amount > tab.maxPerCharge) revert InvalidLimits();
        if (amount > tab.balance) revert InvalidAmount();

        uint256 today = block.timestamp / 1 days;
        if (today != tab.dayIndex) {
            tab.spentToday = 0;
            tab.dayIndex = today;
        }

        if (tab.spentToday + amount > tab.dailyCap) revert DailyCapExceeded();

        tab.balance -= amount;
        tab.spentToday += amount;
        tab.totalCharged += amount;
        tab.chargeCount++;

        USDC_TOKEN.safeTransfer(tab.provider, amount);

        emit Charged(tabId, tab.provider, amount, jobRef, tab.balance);
    }

    function setPaused(uint256 tabId, bool paused) external {
        Tab storage tab = tabs[tabId];

        if (!tab.open) revert TabNotOpen();

        if (paused) {
            // Both payer and agent may pause
            if (msg.sender != tab.payer && msg.sender != tab.agent) revert NotPayerOrAgent();
        } else {
            // Only payer may unpause
            if (msg.sender != tab.payer) revert NotPayer();
        }

        tab.paused = paused;

        emit TabPaused(tabId, paused, msg.sender);
    }

    function updateLimits(uint256 tabId, uint256 maxPerCharge, uint256 dailyCap) external {
        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.payer) revert NotPayer();
        if (!tab.open) revert TabNotOpen();
        if (maxPerCharge == 0 || dailyCap == 0 || maxPerCharge > dailyCap) revert InvalidLimits();

        tab.maxPerCharge = maxPerCharge;
        tab.dailyCap = dailyCap;

        emit LimitsUpdated(tabId, maxPerCharge, dailyCap);
    }

    function closeTab(uint256 tabId) external nonReentrant {
        Tab storage tab = tabs[tabId];

        if (msg.sender != tab.payer && msg.sender != tab.provider) revert NotPayerOrProvider();
        if (!tab.open) revert TabNotOpen();

        tab.open = false;
        uint256 refund = tab.balance;
        tab.balance = 0;

        if (refund > 0) {
            USDC_TOKEN.safeTransfer(tab.payer, refund);
        }

        emit TabClosed(tabId, msg.sender, refund);
    }

    function getTab(uint256 tabId) external view returns (Tab memory) {
        return tabs[tabId];
    }

    function tabsByPayer(address payer) external view returns (uint256[] memory) {
        return _tabsByPayer[payer];
    }

    function tabsByProvider(address provider) external view returns (uint256[] memory) {
        return _tabsByProvider[provider];
    }

    function remainingToday(uint256 tabId) external view returns (uint256) {
        Tab storage tab = tabs[tabId];

        if (block.timestamp / 1 days != tab.dayIndex) {
            return tab.dailyCap;
        }

        if (tab.dailyCap > tab.spentToday) {
            return tab.dailyCap - tab.spentToday;
        }

        return 0;
    }
}
