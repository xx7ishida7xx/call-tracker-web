-- ============================================================================
-- call-tracker: ダッシュボードの月次実績（コール数・有効コール数・アポ・成約）
--
-- 変更内容：
--   1. calls に connected（有効架電かどうか）列を追加。
--      架電記録フォームの「有効架電（担当者と話せた）」チェックボックスから
--      これから記録される。過去の通話記録には遡って設定できないため、
--      デフォルトは false（未判定）。
--   2. leads に contracted_at（ステータスが「成約」になった日時）列を追加。
--      ステータスが「成約」に変わったタイミングでトリガーが自動的に記録する。
--      既存データで既に「成約」になっているものは、更新日時(updated_at)を
--      仮の成約日として一度だけ補完する（正確な成約日は分からないため）。
-- ============================================================================

alter table public.calls add column if not exists connected boolean not null default false;
comment on column public.calls.connected is '有効架電（電話がつながり担当者と話せた）かどうか。月次の「有効コール数」集計に使用。';

alter table public.leads add column if not exists contracted_at timestamptz;
comment on column public.leads.contracted_at is 'ステータスが「成約」になった日時。月次の「成約数」集計に使用。トリガーで自動更新。';

-- 既存の「成約」リードは、正確な成約日が分からないため updated_at で一度だけ補完する
update public.leads set contracted_at = updated_at where status = '成約' and contracted_at is null;

create index if not exists leads_contracted_at_idx on public.leads(contracted_at);
create index if not exists calls_connected_idx on public.calls(connected);

-- ----------------------------------------------------------------------------
-- ステータスが「成約」に変わった/離れたタイミングで contracted_at を自動更新
-- ----------------------------------------------------------------------------
create or replace function public.set_contracted_at() returns trigger
language plpgsql as $$
begin
  if new.status = '成約' and (old.status is distinct from '成約') then
    new.contracted_at = now();
  elsif new.status <> '成約' and old.status = '成約' then
    new.contracted_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_set_contracted_at on public.leads;
create trigger leads_set_contracted_at before update on public.leads
  for each row execute function public.set_contracted_at();
