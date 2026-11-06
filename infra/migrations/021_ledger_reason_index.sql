-- Pebolim payouts sum the ledger by reason (the match id ends it); without this each one reads every row.
CREATE INDEX IF NOT EXISTS currency_ledger_reason_idx ON currency_ledger(reason);
