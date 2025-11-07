-- Migration: Create cancellation tables used by /api/cancellations
USE plv_book_exchange;

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  initiator_id INT NOT NULL,
  other_party_id INT NOT NULL,
  reason ENUM('changed_mind','found_alternative','condition_mismatch','arrangement_issue','personal_reason','other') NOT NULL,
  description TEXT,
  refund_type ENUM('full','partial','none') NOT NULL DEFAULT 'full',
  refund_amount INT NULL,
  status ENUM('pending','consented','rejected','expired','processed') DEFAULT 'pending',
  other_confirmed TINYINT(1) DEFAULT 0,
  other_response_date TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancel_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_cancel_initiator FOREIGN KEY (initiator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cancel_other FOREIGN KEY (other_party_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cancel_txn ON cancellation_requests(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cancel_status ON cancellation_requests(status);

CREATE TABLE IF NOT EXISTS cancellation_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cancellation_id INT NOT NULL,
  action ENUM('initiated','consented','rejected','system') NOT NULL,
  actor_id INT,
  details TEXT,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancelhist_cancel FOREIGN KEY (cancellation_id) REFERENCES cancellation_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_cancelhist_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);