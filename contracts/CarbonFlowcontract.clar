;; title: CarbonFlow - Ecosystem Carbon Credit Tokenization
;; version: 1.0.0
;; summary: Tokenize real-world carbon sequestration activities with satellite verification
;; description: A comprehensive smart contract system for registering land projects,
;;              oracle-verified carbon credit minting, fractionalized trading, and
;;              insurance coverage for reversal risks.

;; traits
(define-trait oracle-trait
  (
    (verify-sequestration (uint uint) (response uint uint))
    (report-reversal (uint uint) (response bool uint))
  )
)

;; token definitions
(define-fungible-token carbon-credit)

;; constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_PROJECT_NOT_FOUND (err u101))
(define-constant ERR_PROJECT_ALREADY_EXISTS (err u102))
(define-constant ERR_INSUFFICIENT_CREDITS (err u103))
(define-constant ERR_INVALID_AMOUNT (err u104))
(define-constant ERR_PROJECT_NOT_ACTIVE (err u105))
(define-constant ERR_ORACLE_NOT_AUTHORIZED (err u106))
(define-constant ERR_INSUFFICIENT_INSURANCE (err u107))
(define-constant ERR_REVERSAL_ALREADY_CLAIMED (err u108))
(define-constant ERR_INVALID_COORDINATES (err u109))
(define-constant ERR_TRANSFER_FAILED (err u110))
(define-constant ERR_CONTRACT_PAUSED (err u111))
(define-constant ERR_REENTRANCY (err u112))
(define-constant ERR_OVERFLOW (err u113))
(define-constant ERR_UNDERFLOW (err u114))
(define-constant ERR_RATE_LIMITED (err u115))
(define-constant ERR_MAX_PROJECTS_EXCEEDED (err u116))
(define-constant ERR_BLACKLISTED (err u117))
(define-constant ERR_INVALID_INPUT (err u118))

;; Security enhancements constants
(define-constant EMERGENCY_WITHDRAWAL_DELAY u1008) ;; ~1 week in blocks
(define-constant OWNERSHIP_TRANSFER_DELAY u144) ;; ~1 day in blocks
(define-constant CIRCUIT_BREAKER_THRESHOLD u1000000000000) ;; 1M STX emergency threshold

(define-constant ERR_EMERGENCY_ACTIVE (err u119))
(define-constant ERR_TRANSFER_NOT_INITIATED (err u120))
(define-constant ERR_TRANSFER_DELAY_ACTIVE (err u121))
(define-constant ERR_EMERGENCY_NOT_ACTIVE (err u122))
(define-constant ERR_TIMELOCK_ACTIVE (err u123))
(define-constant ERR_CIRCUIT_BREAKER (err u124))
(define-constant ERR_INVALID_TIMELOCK (err u125))

(define-constant MIN_PROJECT_SIZE u1000) ;; Minimum 1000 square meters
(define-constant INSURANCE_RATE u10) ;; 10% insurance rate
(define-constant CREDITS_PER_TON u1000000) ;; 1 million micro-credits per ton CO2
(define-constant MAX_PROJECTS_PER_USER u50) ;; Maximum projects per user
(define-constant MAX_CARBON_TONS u1000000) ;; Maximum tons per verification
(define-constant RATE_LIMIT_WINDOW u10) ;; Rate limit window in blocks
(define-constant MAX_ACTIONS_PER_WINDOW u5) ;; Max actions per rate limit window
(define-constant MAX_INSURANCE_AMOUNT u100000000000) ;; Maximum insurance amount

;; data vars
(define-data-var contract-admin principal CONTRACT_OWNER)
(define-data-var next-project-id uint u1)
(define-data-var total-credits-minted uint u0)
(define-data-var total-insurance-pool uint u0)
(define-data-var contract-paused bool false)
(define-data-var reentrancy-lock bool false)

;; Security enhancement data vars
(define-data-var emergency-mode bool false)
(define-data-var pending-admin principal CONTRACT_OWNER)
(define-data-var admin-transfer-time uint u0)
(define-data-var emergency-withdrawal-time uint u0)
(define-data-var circuit-breaker-active bool false)
(define-data-var last-emergency-check uint u0)

;; data maps
(define-map projects
  uint
  {
    owner: principal,
    lat-min: int,
    lat-max: int,
    lon-min: int,
    lon-max: int,
    area: uint, ;; in square meters
    project-type: (string-ascii 50),
    status: (string-ascii 20), ;; "active", "paused", "terminated"
    credits-minted: uint,
    last-verification: uint, ;; block height
    insurance-covered: uint
  }
)

(define-map authorized-oracles principal bool)

(define-map project-credits
  { project-id: uint, owner: principal }
  uint
)

(define-map insurance-pool
  uint ;; project-id
  {
    total-stx: uint,
    coverage-amount: uint,
    contributors: (list 100 principal),
    reversal-claimed: bool
  }
)

(define-map reversal-events
  uint ;; project-id
  {
    block-height: uint,
    credits-lost: uint,
    verified-by: principal,
    compensation-paid: uint
  }
)

(define-map user-balances principal uint)

;; Security maps
(define-map rate-limit
  principal
  { last-action: uint, action-count: uint }
)

(define-map blacklist
  principal
  bool
)

(define-map user-project-count
  principal
  uint
)

;; Security enhancement maps
(define-map timelocks
  (string-ascii 32) ;; operation-id
  {
    initiated-at: uint,
    delay-blocks: uint,
    authorized-by: principal
  }
)

(define-map emergency-actions
  (string-ascii 32) ;; action-id
  {
    executed: bool,
    execution-time: uint,
    authorized-by: principal
  }
)

;; Security helper functions

;; Check reentrancy protection
(define-private (check-reentrancy)
  (if (var-get reentrancy-lock)
    ERR_REENTRANCY
    (begin
      (var-set reentrancy-lock true)
      (ok true)
    )
  )
)

;; Release reentrancy lock
(define-private (release-reentrancy)
  (var-set reentrancy-lock false)
)

;; Check if contract is paused
(define-private (check-not-paused)
  (if (var-get contract-paused)
    ERR_CONTRACT_PAUSED
    (ok true)
  )
)

;; Check rate limiting
(define-private (check-rate-limit (user principal))
  (let 
    (
      (current-block stacks-block-height)
      (rate-data (default-to { last-action: u0, action-count: u0 } (map-get? rate-limit user)))
    )
    (if (or 
          (is-eq (get last-action rate-data) u0)
          (> (- current-block (get last-action rate-data)) RATE_LIMIT_WINDOW))
      (begin
        (map-set rate-limit user { last-action: current-block, action-count: u1 })
        (ok true)
      )
      (if (< (get action-count rate-data) MAX_ACTIONS_PER_WINDOW)
        (begin
          (map-set rate-limit user { 
            last-action: (get last-action rate-data), 
            action-count: (+ (get action-count rate-data) u1) 
          })
          (ok true)
        )
        ERR_RATE_LIMITED
      )
    )
  )
)

;; Check if user is blacklisted
(define-private (check-blacklist (user principal))
  (if (default-to false (map-get? blacklist user))
    ERR_BLACKLISTED
    (ok true)
  )
)

;; Check user project limit
(define-private (check-project-limit (user principal))
  (let ((count (default-to u0 (map-get? user-project-count user))))
    (if (< count MAX_PROJECTS_PER_USER)
      (ok true)
      ERR_MAX_PROJECTS_EXCEEDED
    )
  )
)

;; Safe math - addition with overflow check
(define-private (safe-add (a uint) (b uint))
  (let ((result (+ a b)))
    (if (< result a)
      ERR_OVERFLOW
      (ok result)
    )
  )
)

;; Safe math - subtraction with underflow check
(define-private (safe-sub (a uint) (b uint))
  (if (< a b)
    ERR_UNDERFLOW
    (ok (- a b))
  )
)

;; Safe math - multiplication with overflow check
(define-private (safe-mul (a uint) (b uint))
  (if (or (is-eq a u0) (is-eq b u0))
    (ok u0)
    (let ((result (* a b)))
      (if (< (/ result a) b)
        ERR_OVERFLOW
        (ok result)
      )
    )
  )
)

;; Validate amount bounds
(define-private (validate-amount (amount uint) (max-amount uint))
  (if (and (> amount u0) (<= amount max-amount))
    (ok true)
    ERR_INVALID_INPUT
  )
)

;; Update user project count
(define-private (update-user-project-count (user principal) (increment bool))
  (let ((current-count (default-to u0 (map-get? user-project-count user))))
    (if increment
      (map-set user-project-count user (+ current-count u1))
      (map-set user-project-count user (if (> current-count u0) (- current-count u1) u0))
    )
  )
)

;; public functions

;; SECURITY ENHANCEMENT FUNCTIONS

;; Initiate admin transfer (two-step process)
(define-public (initiate-admin-transfer (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (asserts! (not (is-eq new-admin (var-get contract-admin))) ERR_INVALID_INPUT)
    (var-set pending-admin new-admin)
    (var-set admin-transfer-time stacks-block-height)
    (print { event: "admin-transfer-initiated", new-admin: new-admin, execution-block: (+ stacks-block-height OWNERSHIP_TRANSFER_DELAY) })
    (ok true)
  )
)

;; Complete admin transfer (after timelock)
(define-public (complete-admin-transfer)
  (let ((transfer-time (var-get admin-transfer-time)))
    (asserts! (> transfer-time u0) ERR_TRANSFER_NOT_INITIATED)
    (asserts! (>= stacks-block-height (+ transfer-time OWNERSHIP_TRANSFER_DELAY)) ERR_TRANSFER_DELAY_ACTIVE)
    (asserts! (is-eq tx-sender (var-get pending-admin)) ERR_UNAUTHORIZED)
    (var-set contract-admin (var-get pending-admin))
    (var-set admin-transfer-time u0)
    (print { event: "admin-transfer-completed", new-admin: (var-get contract-admin) })
    (ok true)
  )
)

;; Activate emergency mode (admin only)
(define-public (activate-emergency-mode)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (asserts! (not (var-get emergency-mode)) ERR_EMERGENCY_ACTIVE)
    (var-set emergency-mode true)
    (var-set contract-paused true)
    (var-set emergency-withdrawal-time stacks-block-height)
    (print { event: "emergency-mode-activated", block: stacks-block-height })
    (ok true)
  )
)

;; Deactivate emergency mode (admin only)
(define-public (deactivate-emergency-mode)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (asserts! (var-get emergency-mode) ERR_EMERGENCY_NOT_ACTIVE)
    (var-set emergency-mode false)
    (var-set contract-paused false)
    (print { event: "emergency-mode-deactivated", block: stacks-block-height })
    (ok true)
  )
)

;; Emergency withdrawal (only after delay in emergency mode)
(define-public (emergency-withdraw (amount uint) (recipient principal))
  (let ((withdrawal-time (var-get emergency-withdrawal-time)))
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (asserts! (var-get emergency-mode) ERR_EMERGENCY_NOT_ACTIVE)
    (asserts! (>= stacks-block-height (+ withdrawal-time EMERGENCY_WITHDRAWAL_DELAY)) ERR_TIMELOCK_ACTIVE)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (print { event: "emergency-withdrawal", amount: amount, recipient: recipient })
    (ok true)
  )
)

;; Activate circuit breaker if threshold exceeded
(define-public (check-circuit-breaker)
  (let ((pool-value (var-get total-insurance-pool)))
    (if (and (>= pool-value CIRCUIT_BREAKER_THRESHOLD) (not (var-get circuit-breaker-active)))
      (begin
        (var-set circuit-breaker-active true)
        (var-set contract-paused true)
        (print { event: "circuit-breaker-activated", pool-value: pool-value })
        (ok true)
      )
      (ok false)
    )
  )
)

;; Reset circuit breaker (admin only)
(define-public (reset-circuit-breaker)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (asserts! (var-get circuit-breaker-active) ERR_INVALID_INPUT)
    (var-set circuit-breaker-active false)
    (var-set contract-paused false)
    (print { event: "circuit-breaker-reset" })
    (ok true)
  )
)

;; Batch register multiple projects (gas optimization)
(define-public (batch-register-projects (projects-data (list 10 {
    lat-min: int,
    lat-max: int,
    lon-min: int,
    lon-max: int,
    area: uint,
    project-type: (string-ascii 50)
  })))
  (begin
    (try! (check-not-paused))
    (try! (check-reentrancy))
    (try! (check-blacklist tx-sender))
    (let ((result (fold batch-register-helper projects-data (ok (list)))))
      (release-reentrancy)
      result
    )
  )
)

;; Helper for batch registration
(define-private (batch-register-helper 
  (project-data {
    lat-min: int,
    lat-max: int,
    lon-min: int,
    lon-max: int,
    area: uint,
    project-type: (string-ascii 50)
  })
  (acc (response (list 10 uint) uint)))
  (match acc
    success-list
      (match (register-project-internal 
               (get lat-min project-data)
               (get lat-max project-data)
               (get lon-min project-data)
               (get lon-max project-data)
               (get area project-data)
               (get project-type project-data))
        project-id (ok (unwrap! (as-max-len? (append success-list project-id) u10) ERR_INVALID_AMOUNT))
        error (err error)
      )
    error (err error)
  )
)

;; Internal project registration (for batch operations)
(define-private (register-project-internal (lat-min int) (lat-max int) (lon-min int) (lon-max int) 
                                           (area uint) (project-type (string-ascii 50)))
  (let ((project-id (var-get next-project-id)))
    (asserts! (and (< lat-min lat-max) (< lon-min lon-max)) ERR_INVALID_COORDINATES)
    (asserts! (>= area MIN_PROJECT_SIZE) ERR_INVALID_AMOUNT)
    (asserts! (validate-coordinates lat-min lat-max lon-min lon-max) ERR_INVALID_COORDINATES)
    
    (map-set projects project-id {
      owner: tx-sender,
      lat-min: lat-min,
      lat-max: lat-max,
      lon-min: lon-min,
      lon-max: lon-max,
      area: area,
      project-type: project-type,
      status: "active",
      credits-minted: u0,
      last-verification: stacks-block-height,
      insurance-covered: u0
    })
    
    (map-set project-credits { project-id: project-id, owner: tx-sender } u0)
    (var-set next-project-id (unwrap! (safe-add project-id u1) ERR_OVERFLOW))
    (update-user-project-count tx-sender true)
    (ok project-id)
  )
)

;; Register a new carbon sequestration project
(define-public (register-project (lat-min int) (lat-max int) (lon-min int) (lon-max int) 
                                (area uint) (project-type (string-ascii 50)))
  (let (
    (project-id (var-get next-project-id))
  )
    ;; Security checks
    (try! (check-not-paused))
    (try! (check-reentrancy))
    (try! (check-rate-limit tx-sender))
    (try! (check-blacklist tx-sender))
    (try! (check-project-limit tx-sender))
    
    ;; Validate coordinates and area
    (asserts! (and (< lat-min lat-max) (< lon-min lon-max)) ERR_INVALID_COORDINATES)
    (asserts! (>= area MIN_PROJECT_SIZE) ERR_INVALID_AMOUNT)
    (asserts! (validate-coordinates lat-min lat-max lon-min lon-max) ERR_INVALID_COORDINATES)
    
    ;; Create project entry
    (map-set projects project-id {
      owner: tx-sender,
      lat-min: lat-min,
      lat-max: lat-max,
      lon-min: lon-min,
      lon-max: lon-max,
      area: area,
      project-type: project-type,
      status: "active",
      credits-minted: u0,
      last-verification: stacks-block-height,
      insurance-covered: u0
    })
    
    ;; Initialize project credits for owner
    (map-set project-credits { project-id: project-id, owner: tx-sender } u0)
    
    ;; Increment project counter
    (var-set next-project-id (unwrap! (safe-add project-id u1) ERR_OVERFLOW))
    
    ;; Update user project count
    (update-user-project-count tx-sender true)
    
    (print { event: "project-registered", project-id: project-id, owner: tx-sender })
    
    (release-reentrancy)
    (ok project-id)
  )
)

;; Oracle function to verify sequestration and mint credits
(define-public (verify-and-mint (project-id uint) (carbon-tons uint))
  (let (
    (project (unwrap! (map-get? projects project-id) ERR_PROJECT_NOT_FOUND))
    (credits-to-mint (unwrap! (safe-mul carbon-tons CREDITS_PER_TON) ERR_OVERFLOW))
    (new-credits-minted (unwrap! (safe-add (get credits-minted project) credits-to-mint) ERR_OVERFLOW))
    (owner-balance (default-to u0 (map-get? user-balances (get owner project))))
    (new-owner-balance (unwrap! (safe-add owner-balance credits-to-mint) ERR_OVERFLOW))
    (project-owner-credits (default-to u0 (map-get? project-credits { project-id: project-id, owner: (get owner project) })))
    (new-project-credits (unwrap! (safe-add project-owner-credits credits-to-mint) ERR_OVERFLOW))
    (new-total-minted (unwrap! (safe-add (var-get total-credits-minted) credits-to-mint) ERR_OVERFLOW))
  )
    ;; Security checks
    (try! (check-not-paused))
    (try! (check-reentrancy))
    (try! (check-blacklist tx-sender))
    (try! (check-blacklist (get owner project)))
    
    ;; Check oracle authorization
    (asserts! (default-to false (map-get? authorized-oracles tx-sender)) ERR_ORACLE_NOT_AUTHORIZED)
    
    ;; Check project is active
    (asserts! (is-eq (get status project) "active") ERR_PROJECT_NOT_ACTIVE)
    (asserts! (> carbon-tons u0) ERR_INVALID_AMOUNT)
    (asserts! (<= carbon-tons MAX_CARBON_TONS) ERR_INVALID_AMOUNT)
    
    ;; Mint carbon credits
    (try! (ft-mint? carbon-credit credits-to-mint (get owner project)))
    
    ;; Update project data
    (map-set projects project-id (merge project {
      credits-minted: new-credits-minted,
      last-verification: stacks-block-height
    }))
    
    ;; Update user balance
    (map-set user-balances (get owner project) new-owner-balance)
    
    ;; Update project credits
    (map-set project-credits { project-id: project-id, owner: (get owner project) } new-project-credits)
    
    ;; Update total minted
    (var-set total-credits-minted new-total-minted)
    
    (print { event: "credits-minted", project-id: project-id, amount: credits-to-mint, tons: carbon-tons })
    
    (release-reentrancy)
    (ok credits-to-mint)
  )
)

;; Transfer carbon credits between users
(define-public (transfer-credits (amount uint) (recipient principal))
  (let (
    (sender-balance (default-to u0 (map-get? user-balances tx-sender)))
    (new-sender-balance (unwrap! (safe-sub sender-balance amount) ERR_UNDERFLOW))
    (recipient-balance (default-to u0 (map-get? user-balances recipient)))
    (new-recipient-balance (unwrap! (safe-add recipient-balance amount) ERR_OVERFLOW))
  )
    ;; Security checks
    (try! (check-not-paused))
    (try! (check-reentrancy))
    (try! (check-rate-limit tx-sender))
    (try! (check-blacklist tx-sender))
    (try! (check-blacklist recipient))
    
    (asserts! (>= sender-balance amount) ERR_INSUFFICIENT_CREDITS)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer fungible tokens
    (try! (ft-transfer? carbon-credit amount tx-sender recipient))
    
    ;; Update balances
    (map-set user-balances tx-sender new-sender-balance)
    (map-set user-balances recipient new-recipient-balance)
    
    (print { event: "credits-transferred", from: tx-sender, to: recipient, amount: amount })
    
    (release-reentrancy)
    (ok true)
  )
)

;; Contribute to insurance pool for a project
(define-public (contribute-to-insurance (project-id uint) (stx-amount uint))
  (let (
    (project (unwrap! (map-get? projects project-id) ERR_PROJECT_NOT_FOUND))
    (current-pool (default-to 
      { total-stx: u0, coverage-amount: u0, contributors: (list), reversal-claimed: false }
      (map-get? insurance-pool project-id)))
    (coverage-increase (unwrap! (safe-mul stx-amount INSURANCE_RATE) ERR_OVERFLOW))
    (new-total-stx (unwrap! (safe-add (get total-stx current-pool) stx-amount) ERR_OVERFLOW))
    (new-coverage-amount (unwrap! (safe-add (get coverage-amount current-pool) coverage-increase) ERR_OVERFLOW))
    (new-insurance-covered (unwrap! (safe-add (get insurance-covered project) coverage-increase) ERR_OVERFLOW))
    (new-total-insurance (unwrap! (safe-add (var-get total-insurance-pool) stx-amount) ERR_OVERFLOW))
  )
    ;; Security checks
    (try! (check-not-paused))
    (try! (check-reentrancy))
    (try! (check-rate-limit tx-sender))
    (try! (check-blacklist tx-sender))
    (try! (validate-amount stx-amount MAX_INSURANCE_AMOUNT))
    
    (asserts! (> stx-amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer STX to contract
    (try! (stx-transfer? stx-amount tx-sender (as-contract tx-sender)))
    
    ;; Update insurance pool
    (map-set insurance-pool project-id {
      total-stx: new-total-stx,
      coverage-amount: new-coverage-amount,
      contributors: (unwrap! (as-max-len? (append (get contributors current-pool) tx-sender) u100) ERR_INVALID_AMOUNT),
      reversal-claimed: (get reversal-claimed current-pool)
    })
    
    ;; Update project insurance coverage
    (map-set projects project-id (merge project {
      insurance-covered: new-insurance-covered
    }))
    
    ;; Update total insurance pool
    (var-set total-insurance-pool new-total-insurance)
    
    (print { event: "insurance-contribution", project-id: project-id, contributor: tx-sender, amount: stx-amount })
    
    (release-reentrancy)
    (ok true)
  )
)

;; Report and handle carbon reversal (forest fire, deforestation, etc.)
(define-public (report-reversal (project-id uint) (carbon-tons-lost uint))
  (let (
    (project (unwrap! (map-get? projects project-id) ERR_PROJECT_NOT_FOUND))
    (pool (unwrap! (map-get? insurance-pool project-id) ERR_INSUFFICIENT_INSURANCE))
    (credits-lost (* carbon-tons-lost CREDITS_PER_TON))
    (compensation-amount (/ (* credits-lost (get coverage-amount pool)) (get credits-minted project)))
  )
    ;; Check oracle authorization
    (asserts! (default-to false (map-get? authorized-oracles tx-sender)) ERR_ORACLE_NOT_AUTHORIZED)
    
    ;; Check reversal not already claimed
    (asserts! (not (get reversal-claimed pool)) ERR_REVERSAL_ALREADY_CLAIMED)
    
    ;; Check sufficient insurance coverage
    (asserts! (>= (get coverage-amount pool) compensation-amount) ERR_INSUFFICIENT_INSURANCE)
    
    ;; Burn credits from circulation (if possible)
    (and (>= (ft-get-balance carbon-credit (get owner project)) credits-lost)
         (try! (ft-burn? carbon-credit credits-lost (get owner project))))
    
    ;; Mark reversal as claimed
    (map-set insurance-pool project-id (merge pool { reversal-claimed: true }))
    
    ;; Record reversal event
    (map-set reversal-events project-id {
      block-height: stacks-block-height,
      credits-lost: credits-lost,
      verified-by: tx-sender,
      compensation-paid: compensation-amount
    })
    
    ;; Pay compensation from insurance pool
    (and (> compensation-amount u0)
         (try! (as-contract (stx-transfer? compensation-amount tx-sender (get owner project)))))
    
    (print { 
      event: "reversal-reported", 
      project-id: project-id, 
      credits-lost: credits-lost, 
      compensation: compensation-amount 
    })
    (ok compensation-amount)
  )
)

;; Pause or resume project
(define-public (update-project-status (project-id uint) (new-status (string-ascii 20)))
  (let (
    (project (unwrap! (map-get? projects project-id) ERR_PROJECT_NOT_FOUND))
  )
    ;; Only project owner or admin can update status
    (asserts! (or (is-eq tx-sender (get owner project)) 
                  (is-eq tx-sender (var-get contract-admin))) ERR_UNAUTHORIZED)
    
    ;; Update project status
    (map-set projects project-id (merge project { status: new-status }))
    
    (print { event: "project-status-updated", project-id: project-id, status: new-status })
    (ok true)
  )
)

;; Admin function to authorize oracles
(define-public (authorize-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (map-set authorized-oracles oracle true)
    (print { event: "oracle-authorized", oracle: oracle })
    (ok true)
  )
)

;; Admin function to revoke oracle authorization
(define-public (revoke-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (map-delete authorized-oracles oracle)
    (print { event: "oracle-revoked", oracle: oracle })
    (ok true)
  )
)

;; Admin function to pause contract
(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (var-set contract-paused true)
    (print { event: "contract-paused" })
    (ok true)
  )
)

;; Admin function to unpause contract
(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (var-set contract-paused false)
    (print { event: "contract-unpaused" })
    (ok true)
  )
)

;; Admin function to blacklist user
(define-public (blacklist-user (user principal) (blacklisted bool))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) ERR_UNAUTHORIZED)
    (map-set blacklist user blacklisted)
    (print { event: "user-blacklisted", user: user, blacklisted: blacklisted })
    (ok true)
  )
)


;; read only functions

;; Get project details
(define-read-only (get-project (project-id uint))
  (map-get? projects project-id)
)

;; Get user's carbon credit balance
(define-read-only (get-user-balance (user principal))
  (default-to u0 (map-get? user-balances user))
)

;; Get project credits for specific owner
(define-read-only (get-project-credits (project-id uint) (owner principal))
  (default-to u0 (map-get? project-credits { project-id: project-id, owner: owner }))
)

;; Get insurance pool details
(define-read-only (get-insurance-pool (project-id uint))
  (map-get? insurance-pool project-id)
)

;; Get reversal event details
(define-read-only (get-reversal-event (project-id uint))
  (map-get? reversal-events project-id)
)

;; Check if oracle is authorized
(define-read-only (is-oracle-authorized (oracle principal))
  (default-to false (map-get? authorized-oracles oracle))
)

;; Get total credits minted
(define-read-only (get-total-credits-minted)
  (var-get total-credits-minted)
)

;; Get total insurance pool value
(define-read-only (get-total-insurance-pool)
  (var-get total-insurance-pool)
)

;; Get next project ID
(define-read-only (get-next-project-id)
  (var-get next-project-id)
)

;; Get contract statistics
(define-read-only (get-contract-stats)
  {
    total-projects: (- (var-get next-project-id) u1),
    total-credits-minted: (var-get total-credits-minted),
    total-insurance-pool: (var-get total-insurance-pool),
    contract-admin: (var-get contract-admin)
  }
)

;; NEW SECURITY READ-ONLY FUNCTIONS

;; Check if contract is paused
(define-read-only (is-contract-paused)
  (ok (var-get contract-paused))
)

;; Check if reentrancy lock is active
(define-read-only (is-reentrancy-locked)
  (ok (var-get reentrancy-lock))
)

;; Check if user is blacklisted
(define-read-only (is-user-blacklisted (user principal))
  (ok (default-to false (map-get? blacklist user)))
)

;; Get user project count
(define-read-only (get-user-project-count (user principal))
  (ok (default-to u0 (map-get? user-project-count user)))
)

;; Get rate limit info for user
(define-read-only (get-rate-limit-info (user principal))
  (ok (default-to { last-action: u0, action-count: u0 } (map-get? rate-limit user)))
)

;; Get security status
(define-read-only (get-security-status)
  {
    contract-paused: (var-get contract-paused),
    reentrancy-locked: (var-get reentrancy-lock),
    max-projects-per-user: MAX_PROJECTS_PER_USER,
    max-carbon-tons: MAX_CARBON_TONS,
    rate-limit-window: RATE_LIMIT_WINDOW,
    max-actions-per-window: MAX_ACTIONS_PER_WINDOW,
    emergency-mode: (var-get emergency-mode),
    circuit-breaker-active: (var-get circuit-breaker-active)
  }
)

;; Get admin transfer status
(define-read-only (get-admin-transfer-status)
  (ok {
    current-admin: (var-get contract-admin),
    pending-admin: (var-get pending-admin),
    transfer-initiated-at: (var-get admin-transfer-time),
    transfer-ready: (and 
      (> (var-get admin-transfer-time) u0)
      (>= stacks-block-height (+ (var-get admin-transfer-time) OWNERSHIP_TRANSFER_DELAY))
    )
  })
)

;; Get emergency status
(define-read-only (get-emergency-status)
  (ok {
    emergency-mode: (var-get emergency-mode),
    emergency-withdrawal-time: (var-get emergency-withdrawal-time),
    withdrawal-ready: (and
      (var-get emergency-mode)
      (>= stacks-block-height (+ (var-get emergency-withdrawal-time) EMERGENCY_WITHDRAWAL_DELAY))
    ),
    circuit-breaker-active: (var-get circuit-breaker-active)
  })
)

;; private functions

;; Calculate insurance premium based on project risk factors
(define-private (calculate-insurance-premium (project-id uint) (base-amount uint))
  (let (
    (project (unwrap! (map-get? projects project-id) u0))
    (risk-multiplier (if (is-eq (get project-type project) "forest") u12 u8)) ;; Higher risk for forests
  )
    (/ (* base-amount risk-multiplier) u10)
  )
)

;; Validate geographic coordinates
(define-private (validate-coordinates (lat-min int) (lat-max int) (lon-min int) (lon-max int))
  (and
    (and (>= lat-min -90000000) (<= lat-max 90000000))   ;; Valid latitude range (scaled by 1M)
    (and (>= lon-min -180000000) (<= lon-max 180000000)) ;; Valid longitude range (scaled by 1M)
    (< lat-min lat-max)
    (< lon-min lon-max)
  )
)

;; Calculate area from coordinates (simplified)
(define-private (calculate-area (lat-min int) (lat-max int) (lon-min int) (lon-max int))
  (let (
    (lat-diff (to-uint (- lat-max lat-min)))
    (lon-diff (to-uint (- lon-max lon-min)))
  )
    ;; Simplified area calculation (not accounting for Earth's curvature)
    (/ (* lat-diff lon-diff) u1000000) ;; Convert to approximate square meters
  )
)