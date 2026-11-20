-- Let applicants correct and resubmit only applications that were rejected.
-- Pending and approved applications remain immutable to the applicant.

drop policy if exists driver_applications_resubmit_rejected on public.driver_applications;
create policy driver_applications_resubmit_rejected
on public.driver_applications
for update to authenticated
using (
  user_id = (select auth.uid())
  and status = 'rejected'
  and (select private.drive_role()) = 'passenger'::public.drive_role
)
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and (select private.drive_role()) = 'passenger'::public.drive_role
);

drop policy if exists vehicle_owner_applications_resubmit_rejected on public.vehicle_owner_applications;
create policy vehicle_owner_applications_resubmit_rejected
on public.vehicle_owner_applications
for update to authenticated
using (
  user_id = (select auth.uid())
  and status = 'rejected'
  and (select private.drive_role()) = 'passenger'::public.drive_role
)
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and (select private.drive_role()) = 'passenger'::public.drive_role
);