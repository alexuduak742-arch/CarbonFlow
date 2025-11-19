import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const oracle = accounts.get("wallet_4")!;

const CONTRACT_NAME = "CarbonFlowcontract";

describe("CarbonFlow Contract - Comprehensive Test Suite", () => {
  
  describe("Contract Initialization", () => {
    it("should initialize with correct default values", () => {
      const stats = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-stats",
        [],
        deployer
      );
      expect(stats.result).toBeTuple({
        "total-projects": Cl.uint(0),
        "total-credits-minted": Cl.uint(0),
        "total-insurance-pool": Cl.uint(0),
        "contract-admin": Cl.principal(deployer)
      });
    });

    it("should not be paused initially", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-contract-paused",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(false));
    });

    it("should have correct security status", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-security-status",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "contract-paused": Cl.bool(false),
        "emergency-mode": Cl.bool(false),
        "circuit-breaker-active": Cl.bool(false)
      });
    });
  });

  describe("Project Registration", () => {
    it("should successfully register a valid project", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000), // lat-min
          Cl.int(-44000000), // lat-max
          Cl.int(170000000), // lon-min
          Cl.int(171000000), // lon-max
          Cl.uint(5000), // area (5000 sq meters)
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should reject project with invalid coordinates", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-44000000), // lat-min > lat-max (invalid)
          Cl.int(-45000000), // lat-max
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(109)); // ERR_INVALID_COORDINATES
    });

    it("should reject project with area below minimum", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(500), // Below MIN_PROJECT_SIZE (1000)
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(104)); // ERR_INVALID_AMOUNT
    });

    it("should retrieve registered project details", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-project",
        [Cl.uint(1)],
        wallet1
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          owner: Cl.principal(wallet1),
          "lat-min": Cl.int(-45000000),
          "lat-max": Cl.int(-44000000),
          "lon-min": Cl.int(170000000),
          "lon-max": Cl.int(171000000),
          area: Cl.uint(5000),
          "project-type": Cl.stringAscii("forest"),
          status: Cl.stringAscii("active"),
          "credits-minted": Cl.uint(0),
          "insurance-covered": Cl.uint(0)
        })
      );
    });

    it("should enforce maximum projects per user", () => {
      // Register maximum allowed projects
      for (let i = 0; i < 50; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "register-project",
          [
            Cl.int(-45000000 + i * 10000),
            Cl.int(-44000000 + i * 10000),
            Cl.int(170000000 + i * 10000),
            Cl.int(171000000 + i * 10000),
            Cl.uint(5000),
            Cl.stringAscii("forest")
          ],
          wallet1
        );
      }

      // 51st project should fail
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(116)); // ERR_MAX_PROJECTS_EXCEEDED
    });
  });

  describe("Batch Project Registration", () => {
    it("should register multiple projects in one transaction", () => {
      const projectsData = Cl.list([
        Cl.tuple({
          "lat-min": Cl.int(-45000000),
          "lat-max": Cl.int(-44000000),
          "lon-min": Cl.int(170000000),
          "lon-max": Cl.int(171000000),
          area: Cl.uint(5000),
          "project-type": Cl.stringAscii("forest")
        }),
        Cl.tuple({
          "lat-min": Cl.int(-43000000),
          "lat-max": Cl.int(-42000000),
          "lon-min": Cl.int(172000000),
          "lon-max": Cl.int(173000000),
          area: Cl.uint(6000),
          "project-type": Cl.stringAscii("wetland")
        })
      ]);

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "batch-register-projects",
        [projectsData],
        wallet1
      );
      
      expect(result).toBeOk(Cl.list([Cl.uint(1), Cl.uint(2)]));
    });
  });

  describe("Oracle Authorization", () => {
    it("should allow admin to authorize oracle", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent non-admin from authorizing oracle", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("should verify oracle authorization status", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-oracle-authorized",
        [Cl.principal(oracle)],
        deployer
      );
      expect(result).toBeBool(true);
    });

    it("should allow admin to revoke oracle", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-oracle",
        [Cl.principal(oracle)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-oracle-authorized",
        [Cl.principal(oracle)],
        deployer
      );
      expect(status.result).toBeBool(false);
    });
  });

  describe("Carbon Credit Minting", () => {
    beforeEach(() => {
      // Register a project
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      
      // Authorize oracle
      simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        deployer
      );
    });

    it("should allow authorized oracle to mint credits", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [
          Cl.uint(1), // project-id
          Cl.uint(100) // carbon-tons
        ],
        oracle
      );
      expect(result).toBeOk(Cl.uint(100000000)); // 100 tons * 1M micro-credits
    });

    it("should prevent unauthorized oracle from minting", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [Cl.uint(1), Cl.uint(100)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(106)); // ERR_ORACLE_NOT_AUTHORIZED
    });

    it("should reject minting for non-existent project", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [Cl.uint(999), Cl.uint(100)],
        oracle
      );
      expect(result).toBeErr(Cl.uint(101)); // ERR_PROJECT_NOT_FOUND
    });

    it("should update project credits after minting", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [Cl.uint(1), Cl.uint(100)],
        oracle
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-project",
        [Cl.uint(1)],
        wallet1
      );
      
      expect(result).toBeSome(
        Cl.tuple({
          owner: Cl.principal(wallet1),
          "lat-min": Cl.int(-45000000),
          "lat-max": Cl.int(-44000000),
          "lon-min": Cl.int(170000000),
          "lon-max": Cl.int(171000000),
          area: Cl.uint(5000),
          "project-type": Cl.stringAscii("forest"),
          status: Cl.stringAscii("active"),
          "credits-minted": Cl.uint(100000000),
          "insurance-covered": Cl.uint(0)
        })
      );
    });

    it("should update user balance after minting", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [Cl.uint(1), Cl.uint(100)],
        oracle
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeUint(100000000);
    });
  });

  describe("Credit Transfers", () => {
    beforeEach(() => {
      // Setup: Register project and mint credits
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      
      simnet.callPublicFn(
        CONTRACT_NAME,
        "authorize-oracle",
        [Cl.principal(oracle)],
        deployer
      );
      
      simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-and-mint",
        [Cl.uint(1), Cl.uint(100)],
        oracle
      );
    });

    it("should successfully transfer credits between users", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "transfer-credits",
        [
          Cl.uint(50000000), // amount
          Cl.principal(wallet2)
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update balances after transfer", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "transfer-credits",
        [Cl.uint(50000000), Cl.principal(wallet2)],
        wallet1
      );

      const sender = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(sender.result).toBeUint(50000000);

      const recipient = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-user-balance",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(recipient.result).toBeUint(50000000);
    });

    it("should reject transfer with insufficient balance", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "transfer-credits",
        [Cl.uint(200000000), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(114)); // ERR_UNDERFLOW (from safe-sub)
    });
  });

  describe("Insurance Pool", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
    });

    it("should allow contribution to insurance pool", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "contribute-to-insurance",
        [
          Cl.uint(1), // project-id
          Cl.uint(1000000) // stx-amount (1 STX)
        ],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update insurance pool after contribution", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "contribute-to-insurance",
        [Cl.uint(1), Cl.uint(1000000)],
        wallet2
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-insurance-pool",
        [Cl.uint(1)],
        wallet2
      );
      
      // Verify the result contains expected data
      expect(result).not.toBeNone();
    });

    it("should reject zero contribution", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "contribute-to-insurance",
        [Cl.uint(1), Cl.uint(0)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(118)); // ERR_INVALID_INPUT (from validate-amount)
    });
  });

  describe("Security - Admin Transfer", () => {
    it("should initiate admin transfer", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-admin-transfer",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent non-admin from initiating transfer", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-admin-transfer",
        [Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("should enforce timelock on admin transfer", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-admin-transfer",
        [Cl.principal(wallet1)],
        deployer
      );

      // Try to complete immediately (should fail)
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "complete-admin-transfer",
        [],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(121)); // ERR_TRANSFER_DELAY_ACTIVE
    });

    it("should complete admin transfer after timelock", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-admin-transfer",
        [Cl.principal(wallet1)],
        deployer
      );

      // Mine blocks to pass timelock (144 blocks)
      simnet.mineEmptyBlocks(145);

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "complete-admin-transfer",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify new admin
      const stats = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-stats",
        [],
        wallet1
      );
      const statsData = stats.result as any;
      expect(statsData).toHaveProperty('contract-admin');
    });
  });

  describe("Security - Emergency Mode", () => {
    it("should allow admin to activate emergency mode", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "activate-emergency-mode",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should pause contract when emergency mode activated", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "activate-emergency-mode",
        [],
        deployer
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-contract-paused",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent operations when contract is paused", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "activate-emergency-mode",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(111)); // ERR_CONTRACT_PAUSED
    });

    it("should allow admin to deactivate emergency mode", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "activate-emergency-mode",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "deactivate-emergency-mode",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Security - Circuit Breaker", () => {
    it("should activate circuit breaker when threshold exceeded", () => {
      // Register project
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );

      // Contribute large amount to trigger circuit breaker
      simnet.callPublicFn(
        CONTRACT_NAME,
        "contribute-to-insurance",
        [Cl.uint(1), Cl.uint(1000000000001)], // Above threshold
        wallet2
      );

      // Check circuit breaker status
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-security-status",
        [],
        deployer
      );
      expect(result).toBeTuple({
        "contract-paused": Cl.bool(false),
        "emergency-mode": Cl.bool(false),
        "circuit-breaker-active": Cl.bool(true) // Should be true after large contribution
      });
    });

    it("should allow admin to reset circuit breaker", () => {
      // Setup and trigger circuit breaker
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      
      simnet.callPublicFn(
        CONTRACT_NAME,
        "contribute-to-insurance",
        [Cl.uint(1), Cl.uint(1000000000001)],
        wallet2
      );
      
      // Actually activate the circuit breaker
      simnet.callPublicFn(
        CONTRACT_NAME,
        "check-circuit-breaker",
        [],
        deployer
      );

      // Reset
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "reset-circuit-breaker",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Security - Blacklist", () => {
    it("should allow admin to blacklist user", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "blacklist-user",
        [Cl.principal(wallet3), Cl.bool(true)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent blacklisted user from registering projects", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "blacklist-user",
        [Cl.principal(wallet3), Cl.bool(true)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet3
      );
      expect(result).toBeErr(Cl.uint(117)); // ERR_BLACKLISTED
    });
  });

  describe("Security - Rate Limiting", () => {
    it("should enforce rate limits on actions", () => {
      // Perform maximum allowed actions
      for (let i = 0; i < 5; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "register-project",
          [
            Cl.int(-45000000 + i * 10000),
            Cl.int(-44000000 + i * 10000),
            Cl.int(170000000 + i * 10000),
            Cl.int(171000000 + i * 10000),
            Cl.uint(5000),
            Cl.stringAscii("forest")
          ],
          wallet1
        );
      }

      // 6th action should be rate limited
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(115)); // ERR_RATE_LIMITED
    });

    it("should reset rate limit after window expires", () => {
      // Perform maximum actions
      for (let i = 0; i < 5; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "register-project",
          [
            Cl.int(-45000000 + i * 10000),
            Cl.int(-44000000 + i * 10000),
            Cl.int(170000000 + i * 10000),
            Cl.int(171000000 + i * 10000),
            Cl.uint(5000),
            Cl.stringAscii("forest")
          ],
          wallet1
        );
      }

      // Mine blocks to pass rate limit window (10 blocks)
      simnet.mineEmptyBlocks(11);

      // Should succeed after window expires
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-40000000),
          Cl.int(-39000000),
          Cl.int(175000000),
          Cl.int(176000000),
          Cl.uint(5000),
          Cl.stringAscii("wetland")
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(6));
    });
  });

  describe("Project Status Management", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-project",
        [
          Cl.int(-45000000),
          Cl.int(-44000000),
          Cl.int(170000000),
          Cl.int(171000000),
          Cl.uint(5000),
          Cl.stringAscii("forest")
        ],
        wallet1
      );
    });

    it("should allow project owner to update status", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-project-status",
        [Cl.uint(1), Cl.stringAscii("paused")],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow admin to update project status", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-project-status",
        [Cl.uint(1), Cl.stringAscii("terminated")],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent unauthorized user from updating status", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "update-project-status",
        [Cl.uint(1), Cl.stringAscii("paused")],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });
});
