-- Prevent the same bKash/Nagad transaction ID from being reused on
-- multiple DRIVE payment records.
create unique index if not exists payments_provider_reference_unique
on public.payments (lower(method), provider_reference)
where provider_reference is not null;
