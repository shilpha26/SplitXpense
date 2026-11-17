-- "Who had what": lets everyone in a group open the item-by-item breakdown of a bill.
--
-- Run this once in the Supabase SQL editor. It only ADDS an empty, optional column to `expenses`;
-- existing rows and existing behaviour are untouched.
--
-- Until it is run, the app works exactly as before: the split still happens and the amounts are saved,
-- but the "Who had what" link on an expense will not appear, because the details have nowhere to be saved.

alter table public.expenses
    add column if not exists bill_items jsonb;

-- Make the API pick up the new column straight away
notify pgrst, 'reload schema';

-- Check: should return one row with data_type = jsonb
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'expenses' and column_name = 'bill_items';

-- To undo (removes the saved breakdowns, nothing else):
--   alter table public.expenses drop column if exists bill_items;
