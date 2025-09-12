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

(define-constant MIN_PROJECT_SIZE u1000) ;; Minimum 1000 square meters
(define-constant INSURANCE_RATE u10) ;; 10% insurance rate
(define-constant CREDITS_PER_TON u1000000) ;; 1 million micro-credits per ton CO2

;; data vars
(define-data-var contract-admin principal CONTRACT_OWNER)
(define-data-var next-project-id uint u1)
(define-data-var total-credits-minted uint u0)
(define-data-var total-insurance-pool uint u0)

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