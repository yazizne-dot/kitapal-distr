# Дизайн: архитектура БД Supabase + рефакторинг по папкам

**Дата:** 2026-06-20
**Проект:** Kitapal Distributor Portal (Angular 18)
**Автор:** Kaisar Iskak

## Цель

Превратить прототип (вся логика в одном `app.component.ts` ~1668 строк, данные в `localStorage`)
в приложение с грамотной архитектурой:

1. **Правильная архитектура БД на Postgres (Supabase)** — нормализованная схема, всё
   производное вычисляется через вьюхи, безопасность на уровне строк (RLS).
2. **Реальное подключение приложения** — заменить `localStorage` на Supabase Auth + CRUD.
3. **Разбивка монолита по папкам** — модели / сервисы / feature-компоненты / shared.

Выбранный подход: **A — чистая нормализованная схема + вьюхи** (а не плоский перенос
текущих JS-объектов 1-в-1).

## Принципы

- **Единственный источник правды — транзакции** (`orders`, `payments`). Производные
  величины (`debt`, `achieved`, остаток лимита) НЕ хранятся, а вычисляются вьюхами.
  Это исключает рассинхрон данных.
- **Снимок цены на момент заказа** хранится в `order_items` (`unit_price`, `discount`),
  потому что цена в прайсе со временем меняется, а в старом заказе должна остаться прежней.
- **Сервисы — единственное место обращения к Supabase.** Компоненты не знают про БД.
- **RLS — настоящая защита на уровне БД**, а не имитация в UI.

---

## 1. Таблицы (хранят только факты)

```
profiles                          -- 1-в-1 с auth.users (Supabase Auth)
  id             uuid  PK, FK → auth.users(id)
  full_name      text
  role           text  CHECK ('admin' | 'manager' | 'distributor')
  distributor_id bigint FK → distributors(id)   -- только для роли distributor
  created_at     timestamptz

distributors
  id            bigint PK (generated)
  company       text
  city          text
  manager_id    uuid  FK → profiles(id)         -- ответственный менеджер
  discount      numeric(4,3)                     -- базовая скидка 0..1 (напр. 0.45)
  credit_limit  numeric(14,2)
  phone         text
  created_at    timestamptz
  -- НЕТ полей debt / achieved / target — вычисляются (см. раздел 2)

products
  id                bigint PK
  name              text
  barcode           text UNIQUE
  publisher         text
  category          text
  base_price        numeric(12,2)
  discount_override  numeric(4,3)                -- NULL = берём скидку дистрибьютора
  created_at        timestamptz

targets                                          -- цели на ПОЛУГОДИЕ
  id            bigint PK
  distributor_id bigint FK → distributors(id)
  period        text                             -- '2026-H1', '2026-H2'
  amount        numeric(14,2)
  UNIQUE (distributor_id, period)

orders
  id            uuid PK (gen_random_uuid)
  order_code    text UNIQUE                      -- человекочитаемый KP-AST-2605-0001 (триггер)
  distributor_id bigint FK → distributors(id)
  status        text CHECK ('draft'|'pending'|'confirmed'|'shipped'|'delivered'|'cancelled')
  created_at    timestamptz
  -- amount НЕ хранится: сумма = SUM(order_items.amount)

order_items
  id            bigint PK
  order_id      uuid FK → orders(id) ON DELETE CASCADE
  product_id    bigint FK → products(id)
  qty           int
  unit_price    numeric(12,2)                    -- снимок цены на момент заказа
  discount      numeric(4,3)                     -- снимок скидки
  amount        numeric(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED
  -- name / barcode / publisher НЕ дублируем — берём JOIN-ом к products

order_history                                    -- журнал смены статусов
  id            bigint PK
  order_id      uuid FK → orders(id) ON DELETE CASCADE
  status        text
  note          text
  changed_by    uuid FK → profiles(id)
  changed_at    timestamptz

payments
  id            bigint PK
  distributor_id bigint FK → distributors(id)
  amount        numeric(14,2)
  paid_at       date
  note          text
  recorded_by   uuid FK → profiles(id)
  created_at    timestamptz

messages                                         -- менеджер/админ → дистрибьютор
  id              bigint PK
  distributor_id  bigint FK → distributors(id)
  from_profile_id uuid FK → profiles(id)
  body            text
  created_at      timestamptz
```

### Решения по таблицам

- `notifications` отдельной таблицей не делаем — они вычисляются (вьюха, раздел 2).
- `manager` теперь FK на профиль, а не строка с именем.
- `amount` в строке заказа — генерируемая колонка Postgres (`qty * unit_price`),
  рассинхронизировать невозможно.

---

## 2. Вьюхи (всё вычисляемое)

```sql
-- Сумма каждого заказа
VIEW order_totals AS
  SELECT o.id AS order_id, o.distributor_id, o.status, o.created_at,
         COALESCE(SUM(i.amount), 0) AS total
  FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
  GROUP BY o.id;

-- Долг / выполнено / остаток лимита по дистрибьютору
VIEW distributor_stats AS
  SELECT d.id AS distributor_id, d.company, d.city, d.credit_limit, d.discount,
         achieved,                                  -- см. правило ниже
         t.amount AS target,
         debt,                                      -- см. правило ниже
         GREATEST(0, d.credit_limit - debt) AS remaining_limit
  FROM distributors d
  LEFT JOIN targets t
    ON t.distributor_id = d.id AND t.period = current_half_year();
  -- achieved и debt считаются подзапросами/CTE по правилам ниже

-- Уведомления (как computedNotifications сейчас)
VIEW notifications AS
  -- debt > credit_limit                 → danger  «Лимит асылды»
  -- debt > 80% credit_limit             → warning «Лимит ескертуі»
  -- achieved в диапазоне 80–100% target → success «Мақсатқа жақын»
  -- orders.status = 'pending'           → info    «Тапсырыс расталуды күтуде»
  -- строки из messages                  → info    «Хабарлама»
```

### Правила вычислений (подтверждено заказчиком)

- **Долг** = SUM(`order_totals.total` где `status IN ('confirmed','shipped','delivered')`)
  − SUM(`payments.amount`). Черновики (`draft`) и неподтверждённые (`pending`) в долг
  **не** входят — обязательство возникает только после подтверждения менеджером.
- **Выполнено (achieved)** = SUM(`order_totals.total` где `status = 'delivered'`)
  за текущее полугодие.
- `current_half_year()` — SQL-функция, возвращает `'2026-H1'` / `'2026-H2'` по текущей дате.
- **Логика лимита при создании заказа** (сейчас `debt + amount > creditLimit` → статус
  `draft`) переезжает в `order.service` / SQL-функцию, опираясь на `remaining_limit`.

---

## 3. RLS (безопасность на уровне строк)

RLS включён на всех таблицах. Роль и принадлежность берутся из `profiles` по `auth.uid()`
через функции-помощники:

```sql
my_role()            → 'admin' | 'manager' | 'distributor'
my_distributor_id()  → distributor_id текущего пользователя (или NULL)
```

### Матрица доступа

| Таблица | admin | manager | distributor |
|---|---|---|---|
| `distributors` | всё (R/W) | свои (`manager_id = auth.uid()`), чтение | свой, чтение |
| `products` | R/W | чтение | чтение |
| `targets` | R/W | свои дистрибьюторы, чтение | свой, чтение |
| `orders` / `order_items` | R/W | свои: чтение + смена статуса | свой: создание + чтение + отмена своего draft/pending |
| `order_history` | R/W | свои, чтение/запись при смене статуса | свой, чтение |
| `payments` | R/W | свои: чтение + создание | свой, чтение |
| `messages` | R/W | свои: чтение + создание | свой, чтение |
| `profiles` | R/W | чтение | только свой профиль |

### Решения по RLS

- **Дистрибьютор видит только свои данные** (`distributor_id = my_distributor_id()`).
- **Менеджер видит только своих** дистрибьюторов (через `distributors.manager_id`).
  Сейчас все привязаны к одной «Маржан» — оставляем, но архитектурно уже правильно.
- **Дистрибьютор создаёт заказы**, но **не меняет статус** на confirmed/shipped (это
  менеджер). Может **отменить свой** заказ, пока он `draft`/`pending`.
- **Цены/скидки меняет только admin.**
- **Admin видит и может всё** — без фильтров на всех таблицах.

---

## 4. Структура папок Angular

```
src/app/
  core/
    supabase.client.ts          -- инициализация Supabase client
    models/
      role.ts  distributor.ts  product.ts  order.ts  payment.ts  message.ts  profile.ts
    services/
      auth.service.ts           -- login/logout/сессия (Supabase Auth), профиль+роль
      distributor.service.ts    -- CRUD + distributor_stats
      product.service.ts        -- прайс, редактирование (admin)
      order.service.ts          -- создание/статусы заказов, логика лимита
      payment.service.ts        -- платежи
      message.service.ts        -- сообщения
      notification.service.ts   -- читает вьюху notifications
  shared/
    pipes/  kzt.pipe.ts         -- переезжает сюда
    components/                 -- статус-бейдж, карточка прогресса, модалка и пр.
  features/
    auth/         login.component
    layout/       sidebar / shell (dark sidebar + light content)
    overview/     overview.component        -- «Басқы бет» / «Менің прогресім»
    goals/        goals.component
    distributors/ list + detail             -- карточки + детальная по месяцам
    price/        price.component           -- прайс-лист (grid/list)
    orders/       orders.component          -- список + создание + статусы
    debts/        debts.component           -- қарыз + лимит + платежи
    users/        users.component           -- аккаунты (admin)
    notifications/ notifications.component
    settings/     profile-panel.component   -- пароль/уведомления/язык
  app.component.ts              -- тонкий: роутинг + shell
  app.routes.ts                 -- lazy-loaded маршруты по ролям
```

### Решения по структуре

- **Сервисы — единственное место обращения к Supabase.** Компоненты вызывают сервисы,
  про БД не знают. Это даёт изоляцию: можно сменить бэкенд, не трогая UI.
- **Сигналы остаются** (проект уже на Angular signals) — переносятся в сервисы как
  `signal`/`computed`, компоненты их читают.
- **Роутинг с lazy-load** вместо одного `activeScreen`-свича; меню/экраны по ролям —
  настоящие маршруты.
- **`localStorage`-кеш данных убираем**; источник правды — Supabase (лёгкий кеш сессии
  допустим, кеш данных — нет).

---

## Миграция данных (текущие моки)

Текущие захардкоженные данные (`distributors`, `products`, `orders`, `accounts` из
`app.component.ts` и `price-products.ts`) переносятся в Supabase сид-скриптом:

- 11 дистрибьюторов, 1 менеджер (Маржан), 1 админ → `profiles` + `distributors`.
- `accounts` → пользователи Supabase Auth (email вида `<login>@kitapal.kz`) + `profiles`.
- Каталог книг → `products`.
- Существующие заказы → `orders` + `order_items` + `order_history`.
- Цели на полугодие → `targets` (из текущих `target` как `2026-H1`).
- `debt`/`achieved` НЕ переносим как числа — они станут вычисляемыми. Чтобы текущие
  показатели долга сошлись, исторический долг вносим как стартовые `payments`/заказы
  либо одной «начальной» корректирующей записью (уточнить на этапе плана).

## Тестирование

- RLS-политики: тесты доступа за каждой ролью (дистрибьютор не видит чужое; менеджер —
  только своих; admin — всё).
- Вьюхи: проверка расчёта `debt`/`achieved` на известных данных.
- Сервисы Angular: модульные тесты CRUD-методов (мок Supabase client).
- Логика лимита заказа (draft при превышении) — модульный тест.

## Вне рамок (YAGNI)

- Многоязычность БД (тексты остаются как есть).
- Materialized views / кеширование (масштаб 11 дистрибьюторов не требует).
- Реалтайм-подписки Supabase (можно добавить позже, не в этом этапе).
