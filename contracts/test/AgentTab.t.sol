// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AgentTab} from "../AgentTab.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Handler for invariant testing
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabHandler is Test {
    AgentTab public agentTab;
    MockERC20 public usdc;

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address public payer   = makeAddr("handlerPayer");
    address public provider = makeAddr("handlerProvider");
    address public agent   = makeAddr("handlerAgent");

    // ghost variables
    uint256 public ghostTotalCharged;
    uint256 public tabId;
    bool    public tabOpened;

    constructor(AgentTab _agentTab, MockERC20 _usdc) {
        agentTab = _agentTab;
        usdc     = _usdc;
    }

    /// @dev Open a fresh tab if none open yet
    function openTabOnce(uint256 deposit) external {
        if (tabOpened) return;
        deposit = bound(deposit, 1e6, 500e6); // 1–500 USDC

        usdc.mint(payer, deposit);
        vm.startPrank(payer);
        usdc.approve(address(agentTab), deposit);
        tabId = agentTab.openTab(
            provider,
            agent,
            deposit,
            10e6,   // maxPerCharge = 10 USDC
            50e6,   // dailyCap     = 50 USDC
            0,      // no expiry
            "inv-tab"
        );
        vm.stopPrank();
        tabOpened = true;
    }

    /// @dev Attempt a charge; succeeds only when all conditions hold
    function chargeTab(uint256 amount) external {
        if (!tabOpened) return;

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        if (!tab.open || tab.paused) return;

        // bound to something that could succeed: [1, min(maxPerCharge, balance)]
        uint256 maxCharge = tab.maxPerCharge < tab.balance ? tab.maxPerCharge : tab.balance;
        if (maxCharge == 0) return;

        // also respect daily cap headroom
        uint256 today = block.timestamp / 1 days;
        uint256 spent = (today == tab.dayIndex) ? tab.spentToday : 0;
        uint256 remaining = tab.dailyCap > spent ? tab.dailyCap - spent : 0;
        maxCharge = maxCharge < remaining ? maxCharge : remaining;
        if (maxCharge == 0) return;

        amount = bound(amount, 1, maxCharge);

        vm.prank(provider);
        agentTab.charge(tabId, amount, bytes32(0));
        ghostTotalCharged += amount;
    }

    /// @dev Top up the tab occasionally
    function topUpTab(uint256 amount) external {
        if (!tabOpened) return;
        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        if (!tab.open) return;

        amount = bound(amount, 1e6, 100e6);
        usdc.mint(payer, amount);
        vm.startPrank(payer);
        usdc.approve(address(agentTab), amount);
        agentTab.topUp(tabId, amount);
        vm.stopPrank();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabTest is Test {
    // ── Constants ────────────────────────────────────────────────────────────
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    // ── Actors ───────────────────────────────────────────────────────────────
    address internal payer    = makeAddr("payer");
    address internal provider = makeAddr("provider");
    address internal agent    = makeAddr("agent");
    address internal stranger = makeAddr("stranger");

    // ── Contracts ────────────────────────────────────────────────────────────
    AgentTab  internal agentTab;
    MockERC20 internal usdc;

    // ── Tab parameters ───────────────────────────────────────────────────────
    uint256 internal constant DEPOSIT       = 1_000e6;  // 1 000 USDC
    uint256 internal constant MAX_PER_CHARGE =   50e6;  //    50 USDC
    uint256 internal constant DAILY_CAP      =  200e6;  //   200 USDC
    uint256 internal constant NO_EXPIRY      =       0;

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // 1. Deploy a mock ERC-20 and etch its code onto the hardcoded USDC address
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockERC20(USDC_ADDR);

        // 2. Deploy the contract under test
        agentTab = new AgentTab();

        // 3. Seed the payer with enough USDC for all tests
        usdc.mint(payer, 10_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: open a default tab and return its id
    // ─────────────────────────────────────────────────────────────────────────
    function _openDefaultTab() internal returns (uint256 tabId) {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        tabId = agentTab.openTab(
            provider,
            agent,
            DEPOSIT,
            MAX_PER_CHARGE,
            DAILY_CAP,
            NO_EXPIRY,
            "test-tab"
        );
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DEPLOYMENT (openTab) validation
    // ─────────────────────────────────────────────────────────────────────────

    function test_OpenTab_ZeroDeposit_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), 1e6);
        vm.expectRevert(AgentTab.InvalidAmount.selector);
        agentTab.openTab(provider, agent, 0, MAX_PER_CHARGE, DAILY_CAP, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_ZeroProvider_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.ZeroAddress.selector);
        agentTab.openTab(address(0), agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_ZeroAgent_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.ZeroAddress.selector);
        agentTab.openTab(provider, address(0), DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_MaxPerChargeGtDailyCap_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        // maxPerCharge (300) > dailyCap (200) → InvalidLimits
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.openTab(provider, agent, DEPOSIT, 300e6, 200e6, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_MaxPerChargeZero_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.openTab(provider, agent, DEPOSIT, 0, DAILY_CAP, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_DailyCapZero_Reverts() public {
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.openTab(provider, agent, DEPOSIT, MAX_PER_CHARGE, 0, NO_EXPIRY, "");
        vm.stopPrank();
    }

    function test_OpenTab_SetsStateCorrectly() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        uint256 tabId = agentTab.openTab(
            provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, expiry, "my-tab"
        );
        vm.stopPrank();

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.payer,        payer,          "payer");
        assertEq(tab.provider,     provider,       "provider");
        assertEq(tab.agent,        agent,          "agent");
        assertEq(tab.balance,      DEPOSIT,        "balance");
        assertEq(tab.maxPerCharge, MAX_PER_CHARGE, "maxPerCharge");
        assertEq(tab.dailyCap,     DAILY_CAP,      "dailyCap");
        assertEq(tab.expiry,       expiry,         "expiry");
        assertEq(tab.totalCharged, 0,              "totalCharged");
        assertEq(tab.chargeCount,  0,              "chargeCount");
        assertFalse(tab.paused,                    "paused");
        assertTrue(tab.open,                       "open");
        assertEq(tab.label,        "my-tab",       "label");
    }

    function test_OpenTab_PullsDepositFromPayer() public {
        uint256 payerBefore    = usdc.balanceOf(payer);
        uint256 contractBefore = usdc.balanceOf(address(agentTab));

        _openDefaultTab();

        assertEq(usdc.balanceOf(payer),             payerBefore    - DEPOSIT, "payer balance");
        assertEq(usdc.balanceOf(address(agentTab)),  contractBefore + DEPOSIT, "contract balance");
    }

    function test_OpenTab_EmitsTabOpened() public {
        uint256 expiry = block.timestamp + 1 days;

        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);

        // tabId will be 0 (first tab)
        vm.expectEmit(true, true, true, true, address(agentTab));
        emit AgentTab.TabOpened(0, payer, provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, expiry, "em-tab");
        agentTab.openTab(provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, expiry, "em-tab");
        vm.stopPrank();
    }

    function test_OpenTab_IncreasesTabCount() public {
        assertEq(agentTab.tabCount(), 0);
        _openDefaultTab();
        assertEq(agentTab.tabCount(), 1);
    }

    function test_OpenTab_PastExpiry_Reverts() public {
        // expiry = block.timestamp (not in the future) → InvalidLimits
        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.openTab(provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, block.timestamp, "");
        vm.stopPrank();
    }

    function test_OpenTab_PastExpiry_StrictlyPast_Reverts() public {
        // expiry already in the past
        uint256 pastExpiry = block.timestamp > 1 ? block.timestamp - 1 : 0;
        if (pastExpiry == 0) return; // skip if timestamp is 0 (unreachable in practice)

        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.openTab(provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, pastExpiry, "");
        vm.stopPrank();
    }

    function test_OpenTab_TabsByPayerAndProvider() public {
        uint256 tabId = _openDefaultTab();
        uint256[] memory byPayer    = agentTab.tabsByPayer(payer);
        uint256[] memory byProvider = agentTab.tabsByProvider(provider);
        assertEq(byPayer.length, 1);
        assertEq(byPayer[0],     tabId);
        assertEq(byProvider.length, 1);
        assertEq(byProvider[0],    tabId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. HAPPY PATH: open → charge → close with exact 6-decimal balance checks
    // ─────────────────────────────────────────────────────────────────────────

    function test_HappyPath_OpenChargeClose_ExactBalances() public {
        // ── Open ──
        uint256 payerStart    = usdc.balanceOf(payer);
        uint256 contractStart = usdc.balanceOf(address(agentTab));

        uint256 tabId = _openDefaultTab();

        // Deposit pulled from payer
        assertEq(usdc.balanceOf(payer),             payerStart    - DEPOSIT, "post-open payer");
        assertEq(usdc.balanceOf(address(agentTab)),  contractStart + DEPOSIT, "post-open contract");

        // ── Charge ──
        uint256 chargeAmt      = 30e6; // 30 USDC
        uint256 providerBefore = usdc.balanceOf(provider);

        vm.prank(provider);
        agentTab.charge(tabId, chargeAmt, bytes32("job1"));

        // Charge transferred to provider
        assertEq(usdc.balanceOf(provider),          providerBefore + chargeAmt,     "post-charge provider");
        assertEq(usdc.balanceOf(address(agentTab)), contractStart  + DEPOSIT - chargeAmt, "post-charge contract");

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.balance,      DEPOSIT - chargeAmt, "tab balance after charge");
        assertEq(tab.totalCharged, chargeAmt,           "totalCharged after charge");
        assertEq(tab.chargeCount,  1,                   "chargeCount after charge");
        assertEq(tab.spentToday,   chargeAmt,           "spentToday after charge");

        // ── Close ──
        uint256 expectedRefund = DEPOSIT - chargeAmt;
        uint256 payerBeforeClose = usdc.balanceOf(payer);

        vm.prank(payer);
        agentTab.closeTab(tabId);

        // Remainder refunded to payer
        assertEq(usdc.balanceOf(payer),            payerBeforeClose + expectedRefund, "post-close payer");
        assertEq(usdc.balanceOf(address(agentTab)), 0,                                "post-close contract");

        AgentTab.Tab memory closedTab = agentTab.getTab(tabId);
        assertFalse(closedTab.open,          "tab.open after close");
        assertEq(closedTab.balance, 0,       "tab.balance after close");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CHARGE — validation
    // ─────────────────────────────────────────────────────────────────────────

    function test_Charge_AboveMaxPerCharge_Reverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(provider);
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.charge(tabId, MAX_PER_CHARGE + 1, bytes32("job1"));
    }

    function test_Charge_AboveBalance_Reverts() public {
        // Open a tab with small deposit: 10 USDC, maxPerCharge = 10 USDC, dailyCap = 10 USDC
        uint256 smallDeposit = 10e6;
        usdc.mint(payer, smallDeposit);

        vm.startPrank(payer);
        usdc.approve(address(agentTab), smallDeposit);
        uint256 tabId = agentTab.openTab(provider, agent, smallDeposit, 10e6, 10e6, NO_EXPIRY, "small");
        vm.stopPrank();

        // Try to charge more than balance (balance=10, charge=11 but maxPerCharge=10 → InvalidLimits first)
        // Instead drain it first then charge
        vm.prank(provider);
        agentTab.charge(tabId, 10e6, bytes32("drain"));

        // Refill with a top-up and a fresh daily period
        skip(1 days + 1);
        usdc.mint(payer, 5e6);
        vm.startPrank(payer);
        usdc.approve(address(agentTab), 5e6);
        agentTab.topUp(tabId, 5e6); // balance = 5e6; maxPerCharge = 10e6; dailyCap = 10e6
        vm.stopPrank();

        // Now try to charge 8e6 (> balance of 5e6, ≤ maxPerCharge of 10e6) → InvalidAmount
        vm.prank(provider);
        vm.expectRevert(AgentTab.InvalidAmount.selector);
        agentTab.charge(tabId, 8e6, bytes32("over"));
    }

    function test_Charge_ZeroAmount_Reverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(provider);
        vm.expectRevert(AgentTab.InvalidAmount.selector);
        agentTab.charge(tabId, 0, bytes32("job"));
    }

    function test_Charge_AfterExpiry_Reverts() public {
        uint256 expiry = block.timestamp + 1 hours;

        vm.startPrank(payer);
        usdc.approve(address(agentTab), DEPOSIT);
        uint256 tabId = agentTab.openTab(
            provider, agent, DEPOSIT, MAX_PER_CHARGE, DAILY_CAP, expiry, "exp-tab"
        );
        vm.stopPrank();

        // Warp past expiry
        vm.warp(expiry + 1);

        vm.prank(provider);
        vm.expectRevert(AgentTab.TabExpired.selector);
        agentTab.charge(tabId, 10e6, bytes32("job"));
    }

    function test_Charge_WhenPaused_Reverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.setPaused(tabId, true);

        vm.prank(provider);
        vm.expectRevert(AgentTab.TabIsPaused.selector);
        agentTab.charge(tabId, 10e6, bytes32("job"));
    }

    function test_Charge_OnClosedTab_Reverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.closeTab(tabId);

        vm.prank(provider);
        vm.expectRevert(AgentTab.TabNotOpen.selector);
        agentTab.charge(tabId, 10e6, bytes32("job"));
    }

    function test_Charge_EmitsCharged() public {
        uint256 tabId    = _openDefaultTab();
        bytes32 jobRef   = bytes32("job-abc");
        uint256 amount   = 25e6;
        uint256 expected = DEPOSIT - amount;

        vm.prank(provider);
        vm.expectEmit(true, true, true, true, address(agentTab));
        emit AgentTab.Charged(tabId, provider, amount, jobRef, expected);
        agentTab.charge(tabId, amount, jobRef);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. DAILY CAP
    // ─────────────────────────────────────────────────────────────────────────

    function test_DailyCap_SecondChargeExceedsCap_Reverts() public {
        // dailyCap = 200 USDC, maxPerCharge = 50 USDC
        uint256 tabId = _openDefaultTab();

        // Charge 4 × 50 USDC = 200 USDC (exactly fills daily cap)
        vm.startPrank(provider);
        agentTab.charge(tabId, 50e6, bytes32("c1"));
        agentTab.charge(tabId, 50e6, bytes32("c2"));
        agentTab.charge(tabId, 50e6, bytes32("c3"));
        agentTab.charge(tabId, 50e6, bytes32("c4"));
        // Now spentToday = 200 == dailyCap; one more USDC would exceed it
        vm.expectRevert(AgentTab.DailyCapExceeded.selector);
        agentTab.charge(tabId, 1, bytes32("c5"));
        vm.stopPrank();
    }

    function test_DailyCap_ResetsAfterOneDay() public {
        uint256 tabId = _openDefaultTab();

        // Fill daily cap
        vm.startPrank(provider);
        agentTab.charge(tabId, 50e6, bytes32("c1"));
        agentTab.charge(tabId, 50e6, bytes32("c2"));
        agentTab.charge(tabId, 50e6, bytes32("c3"));
        agentTab.charge(tabId, 50e6, bytes32("c4"));

        // Confirm still blocked
        vm.expectRevert(AgentTab.DailyCapExceeded.selector);
        agentTab.charge(tabId, 1e6, bytes32("blocked"));
        vm.stopPrank();

        // Advance exactly 1 day
        skip(1 days);

        // Same amount that was blocked now succeeds
        vm.prank(provider);
        agentTab.charge(tabId, 1e6, bytes32("after-reset"));

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.spentToday, 1e6, "spentToday after reset");
    }

    function test_DailyCap_SpentTodayAccumulatesCorrectly() public {
        uint256 tabId = _openDefaultTab();

        vm.startPrank(provider);
        agentTab.charge(tabId, 20e6, bytes32("a"));
        agentTab.charge(tabId, 30e6, bytes32("b"));
        vm.stopPrank();

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.spentToday, 50e6, "accumulated spentToday");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. ONLY PROVIDER can charge
    // ─────────────────────────────────────────────────────────────────────────

    function test_Charge_ByPayer_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(payer);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.charge(tabId, 10e6, bytes32("j"));
    }

    function test_Charge_ByAgent_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(agent);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.charge(tabId, 10e6, bytes32("j"));
    }

    function test_Charge_ByStranger_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotProvider.selector);
        agentTab.charge(tabId, 10e6, bytes32("j"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. setPaused — agent and payer allowed; others not
    // ─────────────────────────────────────────────────────────────────────────

    function test_SetPaused_ByAgent_Works() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(agent);
        agentTab.setPaused(tabId, true);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertTrue(tab.paused, "paused by agent");
    }

    function test_SetPaused_ByPayer_Works() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.setPaused(tabId, true);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertTrue(tab.paused, "paused by payer");
    }

    function test_SetPaused_Unpauses() public {
        uint256 tabId = _openDefaultTab();

        // Agent pauses
        vm.prank(agent);
        agentTab.setPaused(tabId, true);

        // Payer (not agent) can unpause
        vm.prank(payer);
        agentTab.setPaused(tabId, false);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertFalse(tab.paused, "unpaused by payer");
    }

    function test_SetPaused_AgentCannotUnpause_Reverts() public {
        uint256 tabId = _openDefaultTab();

        // Payer pauses
        vm.prank(payer);
        agentTab.setPaused(tabId, true);

        // Agent attempts to unpause → must revert with NotPayer
        vm.prank(agent);
        vm.expectRevert(AgentTab.NotPayer.selector);
        agentTab.setPaused(tabId, false);
    }

    function test_SetPaused_PayerCanUnpause() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(agent);
        agentTab.setPaused(tabId, true);

        vm.prank(payer);
        agentTab.setPaused(tabId, false);

        assertFalse(agentTab.getTab(tabId).paused, "payer successfully unpaused");
    }

    function test_SetPaused_EmitsTabPaused() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(agent);
        vm.expectEmit(true, false, true, true, address(agentTab));
        emit AgentTab.TabPaused(tabId, true, agent);
        agentTab.setPaused(tabId, true);
    }

    function test_SetPaused_ByStranger_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotPayerOrAgent.selector);
        agentTab.setPaused(tabId, true);
    }

    function test_SetPaused_ByProvider_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(provider);
        vm.expectRevert(AgentTab.NotPayerOrAgent.selector);
        agentTab.setPaused(tabId, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Agent CANNOT call closeTab / topUp / updateLimits
    // ─────────────────────────────────────────────────────────────────────────

    function test_Agent_CannotCloseTab_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(agent);
        vm.expectRevert(AgentTab.NotPayerOrProvider.selector);
        agentTab.closeTab(tabId);
    }

    function test_Agent_CannotTopUp_Reverts() public {
        uint256 tabId = _openDefaultTab();
        usdc.mint(agent, 100e6);
        vm.startPrank(agent);
        usdc.approve(address(agentTab), 100e6);
        vm.expectRevert(AgentTab.NotPayer.selector);
        agentTab.topUp(tabId, 100e6);
        vm.stopPrank();
    }

    function test_Agent_CannotUpdateLimits_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(agent);
        vm.expectRevert(AgentTab.NotPayer.selector);
        agentTab.updateLimits(tabId, MAX_PER_CHARGE, DAILY_CAP);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. closeTab — exact refund, tab.open = false, subsequent charge reverts
    // ─────────────────────────────────────────────────────────────────────────

    function test_CloseTab_RefundsExactRemainder() public {
        uint256 tabId    = _openDefaultTab();
        uint256 charge1  = 40e6;

        vm.prank(provider);
        agentTab.charge(tabId, charge1, bytes32("j"));

        uint256 expectedRefund = DEPOSIT - charge1;
        uint256 payerBefore    = usdc.balanceOf(payer);

        vm.prank(payer);
        agentTab.closeTab(tabId);

        assertEq(usdc.balanceOf(payer), payerBefore + expectedRefund, "refund amount");
    }

    function test_CloseTab_SetsOpenFalse() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.closeTab(tabId);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertFalse(tab.open, "tab.open after close");
        assertEq(tab.balance,  0, "tab.balance after close");
    }

    function test_CloseTab_SubsequentChargeReverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.closeTab(tabId);

        vm.prank(provider);
        vm.expectRevert(AgentTab.TabNotOpen.selector);
        agentTab.charge(tabId, 10e6, bytes32("j"));
    }

    function test_CloseTab_ByProvider_Works() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(provider);
        agentTab.closeTab(tabId);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertFalse(tab.open, "provider can close");
    }

    function test_CloseTab_ByStranger_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotPayerOrProvider.selector);
        agentTab.closeTab(tabId);
    }

    function test_CloseTab_AlreadyClosed_Reverts() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(payer);
        agentTab.closeTab(tabId);

        vm.prank(payer);
        vm.expectRevert(AgentTab.TabNotOpen.selector);
        agentTab.closeTab(tabId);
    }

    function test_CloseTab_EmitsTabClosed() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(provider);
        vm.expectEmit(true, true, false, true, address(agentTab));
        emit AgentTab.TabClosed(tabId, provider, DEPOSIT);
        agentTab.closeTab(tabId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. topUp
    // ─────────────────────────────────────────────────────────────────────────

    function test_TopUp_ByNonPayer_Reverts() public {
        uint256 tabId = _openDefaultTab();
        usdc.mint(stranger, 100e6);
        vm.startPrank(stranger);
        usdc.approve(address(agentTab), 100e6);
        vm.expectRevert(AgentTab.NotPayer.selector);
        agentTab.topUp(tabId, 100e6);
        vm.stopPrank();
    }

    function test_TopUp_ZeroAmount_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(payer);
        vm.expectRevert(AgentTab.InvalidAmount.selector);
        agentTab.topUp(tabId, 0);
    }

    function test_TopUp_IncreaseBalance() public {
        uint256 tabId     = _openDefaultTab();
        uint256 topUpAmt  = 500e6;
        usdc.mint(payer, topUpAmt);

        vm.startPrank(payer);
        usdc.approve(address(agentTab), topUpAmt);
        agentTab.topUp(tabId, topUpAmt);
        vm.stopPrank();

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.balance, DEPOSIT + topUpAmt, "balance after topUp");
    }

    function test_TopUp_EmitsTabToppedUp() public {
        uint256 tabId    = _openDefaultTab();
        uint256 topUpAmt = 200e6;
        usdc.mint(payer, topUpAmt);

        vm.startPrank(payer);
        usdc.approve(address(agentTab), topUpAmt);
        vm.expectEmit(true, true, false, true, address(agentTab));
        emit AgentTab.TabToppedUp(tabId, payer, topUpAmt, DEPOSIT + topUpAmt);
        agentTab.topUp(tabId, topUpAmt);
        vm.stopPrank();
    }

    function test_TopUp_OnClosedTab_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(payer);
        agentTab.closeTab(tabId);

        usdc.mint(payer, 100e6);
        vm.startPrank(payer);
        usdc.approve(address(agentTab), 100e6);
        vm.expectRevert(AgentTab.TabNotOpen.selector);
        agentTab.topUp(tabId, 100e6);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. updateLimits
    // ─────────────────────────────────────────────────────────────────────────

    function test_UpdateLimits_ByNonPayer_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(stranger);
        vm.expectRevert(AgentTab.NotPayer.selector);
        agentTab.updateLimits(tabId, MAX_PER_CHARGE, DAILY_CAP);
    }

    function test_UpdateLimits_InvalidLimits_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(payer);
        // maxPerCharge > dailyCap → InvalidLimits
        vm.expectRevert(AgentTab.InvalidLimits.selector);
        agentTab.updateLimits(tabId, 300e6, 100e6);
    }

    function test_UpdateLimits_ByPayer_Works() public {
        uint256 tabId      = _openDefaultTab();
        uint256 newMax     = 25e6;
        uint256 newCap     = 100e6;

        vm.prank(payer);
        agentTab.updateLimits(tabId, newMax, newCap);

        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        assertEq(tab.maxPerCharge, newMax, "updated maxPerCharge");
        assertEq(tab.dailyCap,     newCap, "updated dailyCap");
    }

    function test_UpdateLimits_EmitsLimitsUpdated() public {
        uint256 tabId  = _openDefaultTab();
        uint256 newMax = 20e6;
        uint256 newCap = 80e6;

        vm.prank(payer);
        vm.expectEmit(true, false, false, true, address(agentTab));
        emit AgentTab.LimitsUpdated(tabId, newMax, newCap);
        agentTab.updateLimits(tabId, newMax, newCap);
    }

    function test_UpdateLimits_OnClosedTab_Reverts() public {
        uint256 tabId = _openDefaultTab();
        vm.prank(payer);
        agentTab.closeTab(tabId);

        vm.prank(payer);
        vm.expectRevert(AgentTab.TabNotOpen.selector);
        agentTab.updateLimits(tabId, MAX_PER_CHARGE, DAILY_CAP);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. remainingToday view
    // ─────────────────────────────────────────────────────────────────────────

    function test_RemainingToday_BeforeAnyCharge() public {
        uint256 tabId = _openDefaultTab();
        assertEq(agentTab.remainingToday(tabId), DAILY_CAP, "full cap remaining");
    }

    function test_RemainingToday_AfterCharge() public {
        uint256 tabId  = _openDefaultTab();
        uint256 charge1 = 30e6;

        vm.prank(provider);
        agentTab.charge(tabId, charge1, bytes32("j"));

        assertEq(agentTab.remainingToday(tabId), DAILY_CAP - charge1, "remaining after charge");
    }

    function test_RemainingToday_ResetsAfterDay() public {
        uint256 tabId = _openDefaultTab();

        vm.prank(provider);
        agentTab.charge(tabId, 50e6, bytes32("j"));

        skip(1 days);

        assertEq(agentTab.remainingToday(tabId), DAILY_CAP, "full cap after day skip");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. FUZZ — charge arithmetic (balance never negative, spentToday ≤ dailyCap)
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_Charge_BalanceNeverNegative(uint256 amount) public {
        uint256 tabId = _openDefaultTab();

        // Bound to valid range: [1, min(maxPerCharge, dailyCap, balance)]
        uint256 cap = MAX_PER_CHARGE < DAILY_CAP ? MAX_PER_CHARGE : DAILY_CAP;
        cap = cap < DEPOSIT ? cap : DEPOSIT;
        amount = bound(amount, 1, cap);

        uint256 balBefore = agentTab.getTab(tabId).balance;

        vm.prank(provider);
        agentTab.charge(tabId, amount, bytes32("fuzz"));

        uint256 balAfter = agentTab.getTab(tabId).balance;
        assertEq(balAfter, balBefore - amount, "balance decreased by amount");
        // Implicit: no underflow (would revert on uint256 underflow in unchecked math, but OZ uses checked math via SafeERC20 pull)
    }

    function testFuzz_Charge_SpentTodayNeverExceedsDailyCap(uint256 a, uint256 b) public {
        // Open with known parameters
        uint256 tabId = _openDefaultTab();

        uint256 cap = MAX_PER_CHARGE < DAILY_CAP ? MAX_PER_CHARGE : DAILY_CAP;
        a = bound(a, 1, cap);
        b = bound(b, 1, cap);

        vm.startPrank(provider);
        agentTab.charge(tabId, a, bytes32("fa"));

        // Second charge only if it won't exceed daily cap
        AgentTab.Tab memory tab = agentTab.getTab(tabId);
        if (tab.spentToday + b <= tab.dailyCap && b <= tab.balance) {
            agentTab.charge(tabId, b, bytes32("fb"));
        }
        vm.stopPrank();

        tab = agentTab.getTab(tabId);
        assertLe(tab.spentToday, tab.dailyCap, "spentToday never exceeds dailyCap");
    }

    function testFuzz_OpenTab_LimitsValidation(
        uint256 maxPerCharge,
        uint256 dailyCap,
        uint256 deposit
    ) public {
        deposit     = bound(deposit, 1, type(uint128).max);
        maxPerCharge = bound(maxPerCharge, 1, type(uint128).max);
        dailyCap    = bound(dailyCap, 1, type(uint128).max);

        // Only expect success when maxPerCharge <= dailyCap
        usdc.mint(payer, deposit);

        vm.startPrank(payer);
        usdc.approve(address(agentTab), deposit);

        if (maxPerCharge > dailyCap) {
            vm.expectRevert(AgentTab.InvalidLimits.selector);
            agentTab.openTab(provider, agent, deposit, maxPerCharge, dailyCap, 0, "fuzz");
        } else {
            // should succeed
            uint256 tabId = agentTab.openTab(provider, agent, deposit, maxPerCharge, dailyCap, 0, "fuzz");
            AgentTab.Tab memory tab = agentTab.getTab(tabId);
            assertEq(tab.maxPerCharge, maxPerCharge, "maxPerCharge stored");
            assertLe(tab.maxPerCharge, tab.dailyCap,  "maxPerCharge <= dailyCap invariant");
        }
        vm.stopPrank();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract (totalCharged == sum of all successful charge amounts)
// ─────────────────────────────────────────────────────────────────────────────
contract AgentTabInvariantTest is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    AgentTab        internal agentTab;
    MockERC20       internal usdc;
    AgentTabHandler internal handler;

    function setUp() public {
        // Etch mock ERC-20 at hardcoded USDC address
        MockERC20 mock = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockERC20(USDC_ADDR);

        agentTab = new AgentTab();
        handler  = new AgentTabHandler(agentTab, usdc);

        // Only let the fuzzer drive through the handler
        targetContract(address(handler));
    }

    /// @dev INVARIANT: tab.totalCharged == ghost running sum of all successful charges
    function invariant_TotalChargedEqualsGhostSum() public view {
        if (!handler.tabOpened()) return; // no tab yet, nothing to check

        AgentTab.Tab memory tab = agentTab.getTab(handler.tabId());
        assertEq(
            tab.totalCharged,
            handler.ghostTotalCharged(),
            "totalCharged must equal sum of all successful charges"
        );
    }

    /// @dev INVARIANT: contract USDC balance >= sum of open tab balances (at least the handler's tab)
    function invariant_ContractBalanceCoversTabBalance() public view {
        if (!handler.tabOpened()) return;

        AgentTab.Tab memory tab = agentTab.getTab(handler.tabId());
        if (tab.open) {
            assertGe(
                usdc.balanceOf(address(agentTab)),
                tab.balance,
                "contract USDC balance must cover tab balance"
            );
        }
    }

    /// @dev INVARIANT: spentToday never exceeds dailyCap (within the same day)
    function invariant_SpentTodayNeverExceedsDailyCap() public view {
        if (!handler.tabOpened()) return;

        AgentTab.Tab memory tab = agentTab.getTab(handler.tabId());
        // Only meaningful for the current day
        if (block.timestamp / 1 days == tab.dayIndex) {
            assertLe(
                tab.spentToday,
                tab.dailyCap,
                "spentToday must never exceed dailyCap"
            );
        }
    }
}
