-- Credit purchases, part 1. A new enum value cannot be used in the transaction that adds it,
-- so it gets a migration of its own. `purchase` already exists since the initial schema.
alter type public.credit_reason add value if not exists 'refund';
