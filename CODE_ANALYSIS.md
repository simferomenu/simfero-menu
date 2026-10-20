# 📋 Подробный анализ кода Simfero Menu API

## 🎯 Что делает приложение

Это **REST API сервер** на базе **NestJS** (фреймворк для Node.js), который работает как **промежуточный слой** между внешним POS-системой (вероятно, iiko или подобная система) и клиентским приложением для управления меню ресторана.

### Основной функционал:

1. **Управление заказами** - создание, обновление, удаление заказов для столов
2. **Синхронизация меню** - получение актуального меню из внешней системы
3. **Управление столами** - получение списка доступных столов
4. **Обработка webhooks** - получение уведомлений об изменениях заказов
5. **Стоп-лист** - отслеживание недоступных позиций меню

---

## 🏗️ Архитектура приложения

### Технологический стек:

- **NestJS** - основной фреймворк (TypeScript)
- **TypeORM** - ORM для работы с базой данных
- **PostgreSQL** - база данных
- **Axios** - HTTP клиент для внешних API
- **Express** - веб-сервер (под капотом NestJS)

### Структура проекта:

```
src/
├── main.ts                    # Точка входа приложения
├── app.module.ts             # Главный модуль приложения
├── app.controller.ts         # HTTP контроллер (роуты)
├── app.service.ts            # Бизнес-логика
├── config/
│   └── typeorm.ts            # Конфигурация базы данных
├── entities/                 # Модели базы данных
│   ├── tableOrder.entity.ts  # Заказы столов
│   ├── menuList.entity.ts    # Кэш меню
│   └── config.entity.ts      # Конфигурация
├── middleware/
│   └── authByKey.middleware.ts  # Аутентификация по ключу
├── migrations/               # Миграции базы данных
└── database.module.ts        # Модуль базы данных
```

---

## 📊 Модели данных (Entities)

### 1. **TableOrder** - Заказы столов
```typescript
- id: string              // Уникальный ID
- status: string          // Статус заказа (pending, created, closed)
- table: string           // ID стола
- orderId: string         // ID заказа во внешней системе
- preOrder: string        // Предзаказ (JSON)
- order: string           // Данные заказа (JSON)
- createdAt: Date         // Дата создания
```

### 2. **MenuList** - Кэш меню
```typescript
- id: string              // Уникальный ID
- menu: object            // JSON объект с меню
```

### 3. **Config** - Конфигурация
```typescript
- id: string              // Уникальный ID
- name: string            // Имя параметра (например, "version")
- value: string           // Значение параметра
```

---

## 🔌 API Endpoints

### Публичные endpoints (требуют API ключ в заголовке `publickey`):

#### 1. `GET /tables` - Получить список столов
Возвращает список доступных столов, разделенных по секциям (терраса, ресторан).

**📖 Подробная логика работы:**

**Шаг 1: Аутентификация запроса (Middleware)**
```8:11:src/app.controller.ts
  @Get('tables')
  getTales() {
    return this.appService.getTables();
  }
```

Когда клиент отправляет запрос `GET /tables`, сначала срабатывает middleware `authByKey`:

```6:15:src/middleware/authByKey.middleware.ts
  use(req: Request, res: Response, next: NextFunction) {
    if (['/webhook/call'].includes(req.url)) {
      return next();
    }

    if (req.headers.publickey === process.env.PIBLIC_KEY) {
      next();
    } else {
      return res.status(403).json({ message: 'Auth error' });
    }
  }
```

**Что происходит:**
- Проверяется заголовок `publickey` в запросе
- Если ключ совпадает с `PIBLIC_KEY` из `.env` → запрос проходит дальше
- Если не совпадает → возвращается ошибка 403 Forbidden

**Шаг 2: Вызов метода getTables() в сервисе**

После успешной аутентификации вызывается метод `getTables()` из `AppService`:

**🔄 Redis кэширование:**

Метод `getTables()` использует Redis кэш для оптимизации производительности:

```169:224:src/app.service.ts
  async getTables() {
    // Cache key for tables data
    const cacheKey = 'tables:list';
    
    // Try to get cached data from Redis
    const cachedData = await this.cacheManager.get(cacheKey);
    
    if (cachedData) {
      // If cached data exists, return it immediately
      console.log('Returning cached tables data');
      return cachedData;
    }

    // If no cached data, process the request with regular flow
    console.log('Cache miss, fetching tables from API');
    
    const terms = (await this.getTerminals()).id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/reserve/available_restaurant_sections`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
      data: JSON.stringify({ terminalGroupIds: [terms] })
    };
    const response = await this.makeAuthenticatedRequest(config);

    const sections = response.data.restaurantSections;
    const terassa = sections.find(({id}) => id === '40d52478-3cb8-4fa8-8813-3db688499db4');
    const rest = sections.find(({id}) => id === '4577c29c-bcdb-4c63-84ca-ab1a256e0e54');

    return [
      {
        name: terassa.name,
        tables: terassa.tables
          .filter(({ isDeleted }) => !isDeleted)
          .map(({ id, number }) => {
            return { id, number };
          }),
      },
      {
        name: rest.name,
        tables: rest.tables
          .filter(({ isDeleted }) => !isDeleted)
          .map(({ id, number }) => {
            return { id, number };
          }),
      },
    ];
  }
```

**Детальный разбор по шагам:**

**2.1. Получение ID терминала**
```typescript
const terms = (await this.getTerminals()).id;
```

Вызывается метод `getTerminals()`, который:

```149:162:src/app.service.ts
  async getTerminals() {
    const org = (await this.getOrganizations())[0].id;
    const config = {
      method: 'post',
      url: `${this.apiURL}/1/terminal_groups`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
      data: JSON.stringify({ organizationIds: [org] }),
    };
    const response = await this.makeAuthenticatedRequest(config);
    return response.data.terminalGroups[0].items[0];
  }
```

**Цепочка вызовов:**
1. `getTerminals()` → вызывает `getOrganizations()`
2. `getOrganizations()` делает запрос к `/1/organizations` и берет первую организацию
3. Затем делает запрос к `/1/terminal_groups` с ID организации
4. Возвращает первый терминал из первой группы терминалов

**2.2. Запрос секций ресторана**

После получения ID терминала формируется запрос:

```typescript
const config = {
  method: 'post',
  url: `${this.apiURL}/1/reserve/available_restaurant_sections`,
  headers: {
    ...this.defaultHeaders,
    Authorization: `Bearer ${this.authToken}`,
  },
  data: JSON.stringify({ terminalGroupIds: [terms] })
};
```

**Что отправляется:**
- **URL:** `/1/reserve/available_restaurant_sections` (endpoint внешнего API)
- **Метод:** POST
- **Заголовки:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer {токен}` (получен при инициализации приложения)
- **Тело запроса:** JSON с массивом ID терминалов

**2.3. Выполнение запроса с обработкой ошибок**

```typescript
const response = await this.makeAuthenticatedRequest(config);
```

Метод `makeAuthenticatedRequest` - это обертка с автоматическим обновлением токена:

```101:134:src/app.service.ts
  async makeAuthenticatedRequest(requestConfig: any, retryCount: number = 0): Promise<any> {
    // Hard limit: max 2 retries total (original + 2 retries = 3 attempts max)
    if (retryCount >= 2) {
      console.error(`Maximum retry limit reached. Aborting request to ${requestConfig.url}`);
      throw new Error('Request failed after maximum retries');
    }

    try {
      const response = await axios(requestConfig);
      return response;
    } catch (error) {
      // Only retry on 401 Unauthorized, and only once
      if (error.response?.status === 401 && retryCount === 0) {
        console.log('Received 401 Unauthorized, attempting token refresh...');
        
        try {
          await this.auth();
          console.log('Token refreshed, retrying request...');
          
          // Update auth header with new token
          requestConfig.headers.Authorization = `Bearer ${this.authToken}`;
          
          // Retry once
          return await this.makeAuthenticatedRequest(requestConfig, retryCount + 1);
        } catch (authError) {
          console.error('Token refresh failed:', authError.message);
          throw new Error('Authentication failed: Unable to refresh token');
        }
      }
      
      // For all other errors (including 429), throw immediately - let caller handle
      throw error;
    }
  }
```

**Логика обработки:**
- Если запрос успешен → возвращает ответ
- Если получена ошибка 401 (Unauthorized) → автоматически обновляет токен и повторяет запрос
- Максимум 2 попытки повтора (защита от бесконечного цикла)
- Другие ошибки пробрасываются дальше

**2.4. Обработка ответа и фильтрация секций**

```typescript
const sections = response.data.restaurantSections;
const terassa = sections.find(({id}) => id === '40d52478-3cb8-4fa8-8813-3db688499db4');
const rest = sections.find(({id}) => id === '4577c29c-bcdb-4c63-84ca-ab1a256e0e54');
```

**Что происходит:**
- Из ответа извлекается массив `restaurantSections`
- Находятся две конкретные секции по их ID:
  - **Терраса:** `40d52478-3cb8-4fa8-8813-3db688499db4`
  - **Ресторан:** `4577c29c-bcdb-4c63-84ca-ab1a256e0e54`

**Важно:** ID секций захардкожены в коде. Это означает, что приложение работает только с этими двумя конкретными секциями.

**2.5. Формирование результата и сохранение в кэш**

```typescript
const result = [
  {
    name: terassa.name,
    tables: terassa.tables
      .filter(({ isDeleted }) => !isDeleted)  // Убираем удаленные столы
      .map(({ id, number }) => {              // Оставляем только id и номер
        return { id, number };
      }),
  },
  {
    name: rest.name,
    tables: rest.tables
      .filter(({ isDeleted }) => !isDeleted)
      .map(({ id, number }) => {
        return { id, number };
      }),
  },
];

// Save the response to cache with TTL of 1 day (86400 seconds)
await this.cacheManager.set(cacheKey, result, 86400);
console.log('Tables data cached for 1 day');

return result;
```

**Трансформация данных:**
1. **Фильтрация:** Удаляются столы с флагом `isDeleted: true`
2. **Маппинг:** Из каждого стола извлекаются только `id` и `number`
3. **Структура:** Результат - массив из двух объектов (терраса и ресторан)
4. **Кэширование:** Результат сохраняется в Redis с TTL 1 день (86400 секунд)

**🔄 Логика кэширования:**
- **Ключ кэша:** `tables:list`
- **TTL:** 86400 секунд (1 день)
- **Поведение:**
  - При первом запросе: данные получаются из внешнего API и сохраняются в кэш
  - При последующих запросах: данные возвращаются из Redis (быстро, без запросов к API)
  - Через 1 день: кэш истекает, следующий запрос обновит данные

**Пример ответа:**
```json
[
  {
    "name": "Терраса",
    "tables": [
      { "id": "table-uuid-1", "number": "1" },
      { "id": "table-uuid-2", "number": "2" },
      { "id": "table-uuid-3", "number": "3" }
    ]
  },
  {
    "name": "Ресторан",
    "tables": [
      { "id": "table-uuid-4", "number": "10" },
      { "id": "table-uuid-5", "number": "11" }
    ]
  }
]
```

**📊 Схема потока данных:**

```
Клиент → GET /tables
    ↓
Middleware (проверка publickey)
    ↓
AppController.getTales()
    ↓
AppService.getTables()
    ↓
Проверка Redis кэша (ключ: "tables:list")
    ↓
    ├─→ Кэш найден? → Возврат из кэша → Клиент ✅
    │
    └─→ Кэш не найден (cache miss)
        ↓
        getTerminals()
        ↓
        getOrganizations() → GET /1/organizations
        ↓
        GET /1/terminal_groups
        ↓
        GET /1/reserve/available_restaurant_sections
        ↓
        Фильтрация секций (терраса + ресторан)
        ↓
        Фильтрация столов (удаление isDeleted)
        ↓
        Маппинг (только id и number)
        ↓
        Сохранение в Redis (TTL: 1 день)
        ↓
        Возврат результата клиенту ✅
```

**⚠️ Важные моменты:**

1. **Зависимость от внешнего API:** Метод делает 3 последовательных запроса к внешнему API
2. **Хардкод ID секций:** Работает только с двумя конкретными секциями
3. **Автоматическое обновление токена:** При 401 ошибке токен обновляется автоматически
4. **Обработка удаленных столов:** Столы с `isDeleted: true` не возвращаются
5. **Минималистичный ответ:** Возвращаются только `id` и `number` стола, остальные данные отбрасываются

**🔍 Потенциальные проблемы:**

- Если секции с указанными ID не найдены → `terassa` или `rest` будут `undefined`, что приведет к ошибке при обращении к `.name` или `.tables`
- Если внешний API недоступен → весь запрос упадет с ошибкой
- Если токен истек и обновление не удалось → запрос завершится ошибкой

#### 2. `GET /menu` - Получить меню
Возвращает последнюю синхронизированную версию меню из базы данных.

**📖 Подробная логика работы:**

**Шаг 1: Аутентификация запроса (Middleware)**

Как и для всех endpoints, кроме `/webhook/call`, сначала проверяется API ключ через middleware `authByKey`:

```6:15:src/middleware/authByKey.middleware.ts
  use(req: Request, res: Response, next: Function) {
    if (['/webhook/call'].includes(req.url)) {
      return next();
    }

    if (req.headers.publickey === process.env.PIBLIC_KEY) {
      next();
    } else {
      return res.status(403).json({ message: 'Auth error' });
    }
  }
```

**Шаг 2: Вызов метода getMenuLastData() в сервисе**

После успешной аутентификации вызывается метод `getMenuLastData()`:

```13:15:src/app.controller.ts
  @Get('menu')
  getMenu() {
    return this.appService.getMenuLastData();
  }
```

**Шаг 3: Чтение меню из базы данных**

Метод `getMenuLastData()` очень простой - он просто читает данные из базы:

```588:591:src/app.service.ts
  async getMenuLastData() {
    const menu = await MenuList.find();
    return menu[0]?.menu || {};
  }
```

**Что происходит:**
1. **Запрос к БД:** `MenuList.find()` - получает все записи из таблицы `menu_list`
2. **Извлечение данных:** Берется первая запись (`menu[0]`) и извлекается поле `menu`
3. **Fallback:** Если записей нет, возвращается пустой объект `{}`

**Важно:** Этот метод НЕ обращается к внешнему API напрямую. Он работает только с кэшированными данными в базе данных.

**📊 Структура данных в базе:**

Меню хранится в таблице `menu_list`:

```1:17:src/entities/menuList.entity.ts
import {
  BaseEntity,
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'menu_list',
})
export class MenuList extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'jsonb' })
  menu: object;
}
```

**Особенности:**
- В таблице обычно только **одна запись** с актуальным меню
- Поле `menu` имеет тип `jsonb` (PostgreSQL) - хранит JSON объект
- Меню обновляется полностью при каждой синхронизации

**🔄 Как меню попадает в базу данных (синхронизация):**

Меню синхронизируется автоматически в нескольких случаях:

**1. При старте приложения:**

```28:36:src/app.service.ts
    this.auth().then(async () => {
      try {
      await this.setWebhookSettings();
      console.log(await this.getWebhookSettings());
      await this.syncData();
      } catch(error) {
       console.log('App init sync error: ', error);
      }
    });
```

После успешной аутентификации запускается первая синхронизация.

**2. Автоматически каждые 15 минут:**

```40:44:src/app.service.ts
    try {
    setInterval(() => this.syncData(), 1000 * 60 * 15);
    } catch(error) {
     console.log('App init sync error on interval: ', error);
    }
```

**3. При обновлении стоп-листа или номенклатуры (через webhooks):**

Когда приходит webhook с типом `StopListUpdate` или `NomenclatureUpdate`, автоматически запускается синхронизация.

**📋 Процесс синхронизации (метод syncData):**

Вот как происходит полная синхронизация меню:

```548:586:src/app.service.ts
  async syncData() {
    const menu = await this.getMenu();
    const stopList = (await this.getStopListInfo())?.terminalGroupStopLists[0].items[0].items;

    menu.products.forEach((item) => {
      const product = stopList.find((p) => p.productId === item.id);

      if (product) {
        item.isInStopList = Boolean(product.balance <= 0);
      } else {
        item.isInStopList = false;
      }
    });

    const menuItem = await MenuList.find();

    if (menuItem[0]) {
      await MenuList.update({ id: menuItem[0].id }, { menu });
    } else {
      await MenuList.create({ menu }).save();
    }

    const version = await Config.findOne({ where: { name: 'version' } });

    if (!version) {
      await Config.create({ name: 'version', value: '1' }).save();
    } else {
      await Config.update(
        {
          name: 'version',
        },
        {
          value: String(parseInt(version.value, 10) + 1),
        },
      );
    }

    return menu;
  }
```

**Детальный разбор синхронизации:**

**3.1. Получение меню из внешнего API**

```typescript
const menu = await this.getMenu();
```

Вызывается метод `getMenu()`, который делает запрос к внешнему API:

```202:218:src/app.service.ts
  async getMenu() {
    const org = (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/nomenclature `,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
        'Accept-Encoding': 'gzip, deflate',
      },
      data: JSON.stringify({ organizationId: org }),
    };
    const response = await this.makeAuthenticatedRequest(config);

    return response.data;
  }
```

**Что отправляется:**
- **URL:** `/1/nomenclature` (endpoint внешнего API)
- **Метод:** POST
- **Заголовки:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer {токен}`
  - `Accept-Encoding: gzip, deflate` (для сжатия ответа)
- **Тело запроса:** JSON с ID организации

**3.2. Получение стоп-листа**

```typescript
const stopList = (await this.getStopListInfo())?.terminalGroupStopLists[0].items[0].items;
```

Метод `getStopListInfo()` получает информацию о стоп-листе:

```409:426:src/app.service.ts
  async getStopListInfo() {
    const org = (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/stop_lists`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
      data: JSON.stringify({
        organizationIds: [org],
      }),
    };

    const response = await this.makeAuthenticatedRequest(config);
    return response.data;
  }
```

**Важно:** Используется optional chaining (`?.`) - если стоп-лист недоступен, не будет ошибки.

**3.3. Объединение данных меню и стоп-листа**

```typescript
menu.products.forEach((item) => {
  const product = stopList.find((p) => p.productId === item.id);

  if (product) {
    item.isInStopList = Boolean(product.balance <= 0);
  } else {
    item.isInStopList = false;
  }
});
```

**Логика:**
- Проходим по всем продуктам в меню
- Для каждого продукта ищем соответствующую запись в стоп-листе
- Если продукт найден в стоп-листе и его баланс <= 0 → `isInStopList = true`
- Если продукт не найден или баланс > 0 → `isInStopList = false`

**Результат:** Каждый продукт в меню получает флаг `isInStopList`, который показывает, доступен ли он для заказа.

**3.4. Сохранение в базу данных**

```typescript
const menuItem = await MenuList.find();

if (menuItem[0]) {
  await MenuList.update({ id: menuItem[0].id }, { menu });
} else {
  await MenuList.create({ menu }).save();
}
```

**Логика:**
- Проверяем, есть ли уже запись в таблице
- Если есть → обновляем существующую запись
- Если нет → создаем новую запись

**Важно:** В таблице всегда только одна запись с актуальным меню.

**3.5. Обновление версии меню**

```typescript
const version = await Config.findOne({ where: { name: 'version' } });

if (!version) {
  await Config.create({ name: 'version', value: '1' }).save();
} else {
  await Config.update(
    {
      name: 'version',
    },
    {
      value: String(parseInt(version.value, 10) + 1),
    },
  );
}
```

**Что происходит:**
- Ищем запись с именем `'version'` в таблице `config`
- Если записи нет → создаем с версией `'1'`
- Если запись есть → увеличиваем версию на 1

**Зачем это нужно:** Версия меню используется для отслеживания изменений. Клиент может проверять версию, чтобы понять, нужно ли обновлять меню.

**📊 Схема потока данных для GET /menu:**

```
Клиент → GET /menu
    ↓
Middleware (проверка publickey)
    ↓
AppController.getMenu()
    ↓
AppService.getMenuLastData()
    ↓
MenuList.find() → SELECT * FROM menu_list
    ↓
Извлечение menu[0].menu
    ↓
Возврат кэшированного меню клиенту
```

**📊 Схема синхронизации меню (фоновая задача):**

```
Таймер (каждые 15 минут) или Webhook
    ↓
AppService.syncData()
    ↓
getOrganizations() → GET /1/organizations
    ↓
getMenu() → POST /1/nomenclature
    ↓
getStopListInfo() → POST /1/stop_lists
    ↓
Объединение данных (добавление isInStopList)
    ↓
Сохранение в MenuList (UPDATE или INSERT)
    ↓
Обновление версии в Config
```

**📦 Формат ответа:**

Эндпоинт возвращает JSON объект с меню. Структура зависит от формата внешнего API, но обычно включает:

```json
{
  "products": [
    {
      "id": "product-uuid-1",
      "name": "Пицца Маргарита",
      "price": 450,
      "description": "...",
      "category": {...},
      "isInStopList": false,
      ...
    },
    {
      "id": "product-uuid-2",
      "name": "Салат Цезарь",
      "price": 320,
      "isInStopList": true,  // ← Добавлено при синхронизации
      ...
    }
  ],
  "categories": [...],
  "groups": [...],
  ...
}
```

**Если меню еще не синхронизировано:**
```json
{}
```

**⚠️ Важные моменты:**

1. **Кэширование:** Меню хранится в базе данных, а не запрашивается каждый раз из внешнего API
2. **Актуальность:** Данные обновляются каждые 15 минут автоматически
3. **Стоп-лист:** Информация о недоступных позициях добавляется при синхронизации
4. **Версионирование:** Каждое обновление меню увеличивает версию
5. **Производительность:** Чтение из БД намного быстрее, чем запрос к внешнему API
6. **Отказоустойчивость:** Если внешний API недоступен, клиент все равно получит последнее сохраненное меню

**🔍 Потенциальные проблемы:**

1. **Пустое меню:** Если синхронизация еще не произошла → вернется `{}`
2. **Устаревшие данные:** Максимальная задержка обновления - 15 минут
3. **Ошибка синхронизации:** Если синхронизация упала с ошибкой, меню не обновится до следующей попытки
4. **Большой размер:** Меню может быть очень большим (JSON объект), что может влиять на время ответа

**💡 Оптимизации:**

- Использование кэша в базе данных (PostgreSQL jsonb эффективен для больших JSON)
- Возможность добавить сжатие ответа (gzip) на уровне веб-сервера
- Можно добавить ETag для проверки изменений без загрузки всего меню

#### 3. `POST /order` - Создать заказ
**Тело запроса:**
```json
{
  "table": "1c34b882-4261-4364-8339-d8459ad8bf16",
  "items": [{
    "productId": "045815e9-7577-46e5-aacd-4a5793d82791",
    "price": 3250,
    "type": "Product",
    "amount": 1
  }]
}
```

#### 4. `PUT /order` - Обновить заказ (добавить позиции)
**Тело запроса:**
```json
{
  "order": "9b7c2541-1862-4bf2-9f93-450d76d970ff",
  "items": [{
    "productId": "eba4e6bb-243f-4108-bb1a-8790dd5fa3ed",
    "price": 1450,
    "amount": 4,
    "type": "Product"
  }]
}
```

#### 5. `DELETE /order` - Удалить заказ
**Query параметры:**
- `tableId` - ID стола

#### 6. `POST /table-orders` - Получить заказы стола
**Тело запроса:**
```json
{
  "table": "table-id"
}
```

#### 7. `PUT /pre-order` - Обновить предзаказ
Сохраняет предзаказ для стола перед созданием основного заказа.

#### 8. `GET /table/check/:tableId` - Проверить заказ стола
Проверяет, есть ли активный заказ для указанного стола.

#### 9. `GET /info/:tableId` - Получить информацию о столе
Возвращает информацию о заказе и версию меню.

#### 10. `GET /sync-data` - Синхронизировать данные
Принудительно синхронизирует меню и стоп-лист из внешней системы.

#### 11. `GET /webhooks` - Получить настройки webhooks
Возвращает текущие настройки webhooks во внешней системе.

#### 12. `POST /webhooks` - Установить настройки webhooks
**Примечание:** В коде закомментирован, только логирует данные.

### Публичный endpoint (без аутентификации):

#### 13. `POST /webhook/call` - Обработчик webhooks
Принимает уведомления от внешней системы о событиях:
- `TableOrderUpdate` - обновление заказа стола
- `StopListUpdate` - обновление стоп-листа
- `NomenclatureUpdate` - обновление номенклатуры
- `TableOrderError` - ошибки заказа

---

## 🔐 Аутентификация

### Два уровня аутентификации:

1. **API Key аутентификация** (middleware `authByKey`)
   - Все endpoints кроме `/webhook/call` требуют заголовок `publickey`
   - Значение должно совпадать с переменной окружения `PIBLIC_KEY` (опечатка в коде, должно быть PUBLIC_KEY)

2. **Bearer Token аутентификация** (для внешнего API)
   - Приложение автоматически получает токен через `/1/access_token`
   - Токен обновляется каждый час
   - При получении 401 ошибки токен автоматически обновляется

---

## ⚙️ Как работает приложение

### Инициализация (при старте):

1. **Аутентификация** - получение токена доступа к внешнему API
2. **Настройка webhooks** - регистрация URL для получения уведомлений
3. **Первая синхронизация** - загрузка меню и стоп-листа

### Фоновые процессы:

1. **Обновление токена** - каждые 60 минут
2. **Синхронизация данных** - каждые 15 минут

### Обработка webhooks:

Когда приходит webhook от внешней системы:
- `TableOrderUpdate` - обновляет или создает заказ в базе данных
- `StopListUpdate` или `NomenclatureUpdate` - запускает синхронизацию меню
- `TableOrderError` - логирует ошибку

---

## 🚀 Как запустить приложение

### Шаг 1: Установка зависимостей

```bash
npm install
```

### Шаг 2: Настройка переменных окружения

Создайте файл `.env` в корне проекта со следующим содержимым:

```env
# База данных PostgreSQL
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=your_username
DATABASE_PASSWORD=your_password
DATABASE_NAME=simfero_menu

# Аутентификация для внешнего API
AUTH_KEY=your_api_login_key

# URL внешнего API
API_PATH=https://api.example.com

# URL для webhooks (должен быть доступен извне)
WEBHOOK=https://your-domain.com/webhook/call

# Публичный ключ для защиты API
PIBLIC_KEY=your_public_key_here

# Redis кэш (опционально, значения по умолчанию указаны)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

**Важно:**
- `WEBHOOK` должен быть публично доступным URL (не localhost)
- Для разработки можно использовать ngrok или подобный сервис для туннелирования
- Redis настройки опциональны - если не указаны, используются значения по умолчанию (localhost:6379)

### Шаг 3: Настройка Redis (для кэширования)

1. Убедитесь, что Redis запущен:
```bash
# Проверка статуса Redis
redis-cli ping
# Должен вернуть: PONG
```

2. Если Redis не установлен:
```bash
# macOS
brew install redis
brew services start redis

# Linux (Ubuntu/Debian)
sudo apt-get install redis-server
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis
```

### Шаг 4: Настройка базы данных

1. Убедитесь, что PostgreSQL запущен
2. Создайте базу данных:
```bash
createdb simfero_menu
```

3. Запустите миграции:
```bash
npm run migration:run
```

### Шаг 5: Сборка проекта

```bash
npm run build
```

### Шаг 6: Запуск приложения

**Режим разработки** (с автоперезагрузкой):
```bash
npm run start:dev
```

**Продакшн режим:**
```bash
npm run start:prod
```

**Обычный запуск:**
```bash
npm start
```

### Шаг 7: Проверка работы

Приложение запустится на порту **3000** (по умолчанию).

Проверьте работу:
```bash
curl -H "publickey: your_public_key_here" http://localhost:3000/tables
```

---

## 📝 Скрипты npm

- `npm run build` - собрать проект в папку `dist/`
- `npm run start` - запустить приложение
- `npm run start:dev` - запустить в режиме разработки (watch mode)
- `npm run start:debug` - запустить с отладкой
- `npm run start:prod` - запустить продакшн версию
- `npm run migration:run` - применить миграции базы данных
- `npm run migration:revert` - откатить последнюю миграцию
- `npm run lint` - проверить код линтером
- `npm run format` - отформатировать код

---

## 🔍 Детальный разбор ключевых компонентов

### 1. AppService - Бизнес-логика

**Основные методы:**

- `auth()` - Аутентификация во внешнем API
  - Получает токен доступа
  - Защищена от частых вызовов (rate limiting)
  - Автоматически обновляется каждые 60 минут

- `syncData()` - Синхронизация меню
  - Получает меню из внешнего API
  - Получает стоп-лист
  - Объединяет данные (помечает позиции в стоп-листе)
  - Сохраняет в базу данных
  - Увеличивает версию меню

- `createOrder()` - Создание заказа
  - Отправляет заказ во внешнюю систему
  - Обновляет статус заказа в базе данных на "pending"

- `webhookHandler()` - Обработка webhooks
  - Обрабатывает различные типы событий
  - Обновляет заказы в базе данных
  - Запускает синхронизацию при обновлении меню

### 2. AppController - HTTP роуты

Все endpoints защищены middleware `authByKey`, кроме `/webhook/call`.

### 3. Middleware authByKey

Проверяет заголовок `publickey` в запросе. Если ключ не совпадает - возвращает 403.

**Исключение:** `/webhook/call` не требует аутентификации (webhooks приходят извне).

---

## ⚠️ Важные замечания

1. **Опечатка в коде:** `PIBLIC_KEY` должно быть `PUBLIC_KEY` (но это не критично, если вы используете существующее имя)

2. **Webhook URL:** Должен быть публично доступным. Для локальной разработки используйте:
   - ngrok: `ngrok http 3000`
   - или другой туннелинг сервис

3. **База данных:** Убедитесь, что PostgreSQL запущен и доступен

4. **Внешний API:** Приложение зависит от внешнего API. Убедитесь, что:
   - `API_PATH` указан правильно
   - `AUTH_KEY` валиден
   - API доступен из сети

5. **CORS:** Приложение включает CORS (`app.enableCors()`), что позволяет запросам с любых доменов

---

## 🐛 Отладка

### Проверка логов

Приложение выводит логи в консоль:
- `Auth successful, token obtained` - успешная аутентификация
- `Config setup:` - настройка webhooks
- `Order status:` - статусы заказов
- Ошибки также логируются в консоль

### Типичные проблемы:

1. **Ошибка подключения к БД:**
   - Проверьте переменные окружения
   - Убедитесь, что PostgreSQL запущен
   - Проверьте права доступа пользователя

2. **Ошибка аутентификации:**
   - Проверьте `AUTH_KEY` в `.env`
   - Проверьте доступность `API_PATH`

3. **Webhooks не работают:**
   - Убедитесь, что `WEBHOOK` URL публично доступен
   - Проверьте логи на наличие ошибок

---

## 📚 Дополнительная информация

### Зависимости проекта:

**Основные:**
- `@nestjs/common`, `@nestjs/core` - фреймворк NestJS
- `@nestjs/typeorm` - интеграция TypeORM
- `@nestjs/config` - управление конфигурацией
- `@nestjs/cache-manager` - модуль кэширования NestJS
- `cache-manager` - менеджер кэша
- `cache-manager-redis-store` - Redis store для cache-manager
- `redis` - клиент Redis
- `typeorm` - ORM
- `pg` - драйвер PostgreSQL
- `axios` - HTTP клиент

**Разработка:**
- TypeScript
- ESLint, Prettier
- Jest (для тестов)

---

## 🎓 Ключевые концепции

1. **Dependency Injection** - NestJS использует DI для управления зависимостями
2. **Decorators** - TypeScript декораторы для маршрутизации и валидации
3. **ORM** - TypeORM для работы с базой данных
4. **Middleware** - промежуточное ПО для аутентификации
5. **Webhooks** - механизм получения уведомлений от внешних систем

---

## ✅ Чек-лист для запуска

- [ ] Установлены зависимости (`npm install`)
- [ ] Создан файл `.env` с правильными значениями
- [ ] Redis запущен и доступен (для кэширования)
- [ ] PostgreSQL запущен и доступен
- [ ] База данных создана
- [ ] Миграции применены (`npm run migration:run`)
- [ ] Проект собран (`npm run build`)
- [ ] Приложение запущено (`npm run start:dev`)
- [ ] Проверена работа API (например, `/tables`)
- [ ] Проверена работа Redis кэша (первый запрос медленнее, последующие быстрые)

---

**Готово!** Теперь вы понимаете, как работает приложение и как его запустить. 🚀

