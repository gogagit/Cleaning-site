-- Убирайся!: схема Supabase
-- Выполните файл целиком в Supabase Dashboard -> SQL Editor.

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    name text not null,
    role text not null default 'user' check (role in ('user', 'employee', 'admin')),
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.services (
    id text primary key,
    name text not null,
    rate numeric(10, 2) not null check (rate >= 0),
    minimum numeric(10, 2) not null check (minimum >= 0),
    speed numeric(10, 2) not null check (speed > 0),
    description text not null default '',
    image text not null default 'img/service/house.jpg',
    active boolean not null default true,
    sort_order integer not null default 100,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    number text unique not null,
    user_id uuid references auth.users(id) on delete set null,
    customer jsonb not null default '{}'::jsonb,
    items jsonb not null default '[]'::jsonb,
    total numeric(12, 2) not null check (total >= 0),
    status text not null default 'new'
        check (status in ('new', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled')),
    employee_id uuid references auth.users(id) on delete set null,
    employee_name text not null default '',
    commission_percent numeric(5, 2) not null default 30 check (commission_percent between 0 and 100),
    service_commission numeric(12, 2) not null default 0 check (service_commission >= 0),
    employee_earning numeric(12, 2) not null default 0 check (employee_earning >= 0),
    assigned_at timestamptz,
    scheduled_date date,
    scheduled_time text,
    scheduled_start timestamptz,
    duration_minutes integer not null default 120 check (duration_minutes >= 60),
    created_at timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    name text not null,
    email text not null,
    phone text not null default '',
    message text not null check (char_length(message) >= 10),
    status text not null default 'new' check (status in ('new', 'read', 'answered')),
    replies jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.staff_invites (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    name text not null,
    role text not null default 'employee' check (role = 'employee'),
    status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
    invited_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    accepted_at timestamptz
);

-- Обновление уже существующего проекта без удаления данных.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'employee', 'admin'));
alter table public.orders add column if not exists employee_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists employee_name text not null default '';
alter table public.orders add column if not exists commission_percent numeric(5, 2) not null default 30;
alter table public.orders add column if not exists service_commission numeric(12, 2) not null default 0;
alter table public.orders add column if not exists employee_earning numeric(12, 2) not null default 0;
alter table public.orders add column if not exists assigned_at timestamptz;
alter table public.orders add column if not exists scheduled_start timestamptz;
alter table public.orders add column if not exists duration_minutes integer not null default 120;
update public.orders set scheduled_start = (scheduled_date::text || 'T' || scheduled_time)::timestamp at time zone 'Europe/Moscow'
where scheduled_start is null and scheduled_date is not null and scheduled_time is not null;
alter table public.messages add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists replies jsonb not null default '[]'::jsonb;
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check check (status in ('new', 'read', 'answered'));

create index if not exists profiles_email_idx on public.profiles(email);
create index if not exists services_active_sort_idx on public.services(active, sort_order);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_employee_id_idx on public.orders(employee_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_scheduled_start_idx on public.orders(scheduled_start);
create index if not exists messages_status_created_idx on public.messages(status, created_at desc);
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists staff_invites_status_idx on public.staff_invites(status, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    pending_invite public.staff_invites%rowtype;
begin
    select * into pending_invite
    from public.staff_invites
    where lower(email) = lower(new.email) and status = 'pending'
    limit 1;

    insert into public.profiles (id, email, name, role)
    values (
        new.id,
        new.email,
        coalesce(nullif(pending_invite.name, ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
        case when pending_invite.id is not null then 'employee' else 'user' end
    )
    on conflict (id) do update
    set email = excluded.email,
        name = excluded.name;
    if pending_invite.id is not null then
        update public.staff_invites set status = 'accepted', accepted_at = now() where id = pending_invite.id;
    end if;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
          and is_active = true
    );
$$;

create or replace function public.is_client()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'user' and is_active = true
    );
$$;

create or replace function public.protect_employee_order_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select public.is_admin()) then
        return new;
    end if;
    if old.employee_id = (select auth.uid()) then
        if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
            raise exception 'Сотрудник может изменять только статус назначенного заказа';
        end if;
        if not (
            (old.status in ('assigned', 'confirmed') and new.status = 'in_progress')
            or (old.status = 'in_progress' and new.status = 'completed')
        ) then
            raise exception 'Недопустимый переход статуса заказа';
        end if;
        return new;
    end if;
    if old.user_id = (select auth.uid()) then
        if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
            raise exception 'Клиент может изменить только статус своего заказа';
        end if;
        if old.status not in ('new', 'confirmed', 'assigned') or new.status <> 'cancelled' then
            raise exception 'Этот заказ уже нельзя отменить';
        end if;
        return new;
    end if;
    raise exception 'Недостаточно прав для изменения заказа';
end;
$$;

drop trigger if exists protect_employee_order_update_trigger on public.orders;
create trigger protect_employee_order_update_trigger
before update on public.orders
for each row execute procedure public.protect_employee_order_update();

create or replace function public.get_slot_availability(p_start timestamptz, p_duration_minutes integer)
returns table(total_employees bigint, occupied_employees bigint, available_employees bigint)
language sql
stable
security definer
set search_path = ''
as $$
    with capacity as (
        select count(*)::bigint as total
        from public.profiles where role = 'employee' and is_active = true
    ), occupied as (
        select count(*)::bigint as total
        from public.orders
        where status <> 'cancelled'
          and scheduled_start is not null
          and scheduled_start < p_start + make_interval(mins => greatest(p_duration_minutes, 60))
          and p_start < scheduled_start + make_interval(mins => duration_minutes)
    )
    select capacity.total, occupied.total, greatest(capacity.total - occupied.total, 0)
    from capacity cross join occupied;
$$;

create or replace function public.enforce_order_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    employee_count integer;
    overlap_count integer;
begin
    if new.status = 'cancelled' or new.scheduled_start is null then return new; end if;
    perform pg_advisory_xact_lock(hashtext(new.scheduled_start::date::text));
    select count(*) into employee_count from public.profiles where role = 'employee' and is_active = true;
    if employee_count = 0 then raise exception 'Нет активных сотрудников для выбранного времени'; end if;
    select count(*) into overlap_count from public.orders
    where id <> new.id and status <> 'cancelled' and scheduled_start is not null
      and scheduled_start < new.scheduled_start + make_interval(mins => new.duration_minutes)
      and new.scheduled_start < scheduled_start + make_interval(mins => duration_minutes);
    if overlap_count >= employee_count then raise exception 'На это время все сотрудники заняты'; end if;
    if new.employee_id is not null and exists (
        select 1 from public.orders where id <> new.id and employee_id = new.employee_id and status <> 'cancelled'
          and scheduled_start < new.scheduled_start + make_interval(mins => new.duration_minutes)
          and new.scheduled_start < scheduled_start + make_interval(mins => duration_minutes)
    ) then raise exception 'Этот сотрудник уже занят в выбранное время'; end if;
    return new;
end;
$$;

drop trigger if exists enforce_order_schedule_trigger on public.orders;
create trigger enforce_order_schedule_trigger
before insert or update of scheduled_start, duration_minutes, employee_id, status on public.orders
for each row execute procedure public.enforce_order_schedule();

create or replace function public.append_message_reply(p_message_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_profile public.profiles%rowtype;
    current_message public.messages%rowtype;
    reply jsonb;
begin
    if char_length(trim(p_text)) < 2 then raise exception 'Ответ слишком короткий'; end if;
    select * into current_profile from public.profiles where id = (select auth.uid()) and is_active = true;
    if current_profile.id is null then raise exception 'Требуется авторизация'; end if;
    select * into current_message from public.messages where id = p_message_id;
    if current_message.id is null then raise exception 'Обращение не найдено'; end if;
    if current_profile.role <> 'admin' and current_message.user_id <> current_profile.id
       and lower(current_message.email) <> lower(current_profile.email) then
        raise exception 'Нет доступа к обращению';
    end if;
    reply = jsonb_build_object('id', gen_random_uuid(), 'authorId', current_profile.id, 'authorName', current_profile.name,
        'authorRole', current_profile.role, 'text', trim(p_text), 'createdAt', now());
    update public.messages
    set replies = replies || jsonb_build_array(reply),
        status = case when current_profile.role = 'admin' then 'answered' else 'new' end
    where id = p_message_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;
alter table public.staff_invites enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.services from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.staff_invites from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.services to anon, authenticated;
grant insert, update, delete on table public.services to authenticated;
grant select, insert, update, delete on table public.orders to authenticated;
grant insert on table public.messages to anon, authenticated;
grant select, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.staff_invites to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_client() to authenticated;
grant execute on function public.get_slot_availability(timestamptz, integer) to authenticated;
grant execute on function public.append_message_reply(uuid, text) to authenticated;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "services_public_select" on public.services;
create policy "services_public_select"
on public.services for select
to anon, authenticated
using (active = true or (select public.is_admin()));

drop policy if exists "services_admin_insert" on public.services;
create policy "services_admin_insert"
on public.services for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "services_admin_update" on public.services;
create policy "services_admin_update"
on public.services for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "services_admin_delete" on public.services;
create policy "services_admin_delete"
on public.services for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "orders_guest_insert" on public.orders;

drop policy if exists "orders_user_insert" on public.orders;
create policy "orders_user_insert"
on public.orders for insert
to authenticated
with check (user_id = (select auth.uid()) and status = 'new' and (select public.is_client()));

drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin"
on public.orders for select
to authenticated
using (user_id = (select auth.uid()) or employee_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update"
on public.orders for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "orders_employee_update" on public.orders;
create policy "orders_employee_update"
on public.orders for update
to authenticated
using (employee_id = (select auth.uid()))
with check (employee_id = (select auth.uid()));

drop policy if exists "orders_client_cancel" on public.orders;
create policy "orders_client_cancel"
on public.orders for update
to authenticated
using (user_id = (select auth.uid()) and (select public.is_client()))
with check (user_id = (select auth.uid()) and status = 'cancelled');

drop policy if exists "orders_admin_delete" on public.orders;
create policy "orders_admin_delete"
on public.orders for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "messages_public_insert" on public.messages;
create policy "messages_public_insert"
on public.messages for insert
to anon, authenticated
with check (status = 'new' and (user_id is null or user_id = (select auth.uid())));

drop policy if exists "messages_admin_select" on public.messages;
create policy "messages_admin_select"
on public.messages for select
to authenticated
using ((select public.is_admin()) or user_id = (select auth.uid()) or lower(email) = lower((select auth.jwt() ->> 'email')));

drop policy if exists "messages_admin_update" on public.messages;
create policy "messages_admin_update"
on public.messages for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "messages_admin_delete" on public.messages;
create policy "messages_admin_delete"
on public.messages for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "staff_invites_admin_select" on public.staff_invites;
create policy "staff_invites_admin_select" on public.staff_invites for select to authenticated
using ((select public.is_admin()));

drop policy if exists "staff_invites_admin_insert" on public.staff_invites;
create policy "staff_invites_admin_insert" on public.staff_invites for insert to authenticated
with check ((select public.is_admin()) and invited_by = (select auth.uid()));

drop policy if exists "staff_invites_admin_update" on public.staff_invites;
create policy "staff_invites_admin_update" on public.staff_invites for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "staff_invites_admin_delete" on public.staff_invites;
create policy "staff_invites_admin_delete" on public.staff_invites for delete to authenticated
using ((select public.is_admin()));

insert into public.services (id, name, rate, minimum, speed, description, image, active, sort_order)
values
    ('regular', 'Поддерживающая уборка', 65, 2500, 22, 'Регулярная уборка жилых комнат, кухни и санузла.', 'img/service/house.jpg', true, 10),
    ('general', 'Генеральная уборка', 125, 5200, 15, 'Глубокая очистка поверхностей и труднодоступных мест.', 'img/service/bathroom.jpg', true, 20),
    ('afterRepair', 'Уборка после ремонта', 175, 7500, 11, 'Удаление строительной пыли, следов смесей и загрязнений.', 'img/service/window.jpg', true, 30),
    ('office', 'Уборка офиса', 75, 3500, 25, 'Разовая или регулярная уборка рабочих помещений.', 'img/service/furniture.png', true, 40)
on conflict (id) do update
set name = excluded.name,
    rate = excluded.rate,
    minimum = excluded.minimum,
    speed = excluded.speed,
    description = excluded.description,
    image = excluded.image,
    sort_order = excluded.sort_order,
    updated_at = now();

-- После регистрации администратора выполните отдельно:
-- update public.profiles set role = 'admin' where email = 'your-email@example.com';
-- После регистрации сотрудника выполните отдельно:
-- update public.profiles set role = 'employee' where email = 'employee@example.com';
