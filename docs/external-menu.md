# Внешнее меню iiko: обновление и откат

## Как работает синхронизация

Сервер получает список меню через `POST /api/2/menu`, выбирает внешнее меню **«Симферо Ресторан»** и загружает его через `POST /api/menu/v3/by_id`. ID меню в коде не зафиксирован.

Ценовая категория выбирается в порядке приоритета: **«Ресторан»**, **«Базовая категория»**, первая доступная.

Для планшетов сохраняется прежний формат `/menu`. Плоские группы iiko распределяются по тегам:

| Тег | Корневой раздел |
| --- | --- |
| `кухня` | МЕНЮ РЕСТОРАНА |
| `суши` | СУШИ МЕНЮ |
| `бар` | МЕНЮ БАРА |
| `вино` | КАРТА ВИН |
| `напитки` | МЕНЮ НАПИТКОВ |
| `ДО` | ДЕЛОВЫЕ ОБЕДЫ |

Группы без тегов остаются корневыми. Неизвестный тег вызывает ошибку синхронизации, чтобы не потерять структуру меню.

Синхронизация запускается при старте, каждые 5 минут и через 60 секунд после webhook об изменении меню или стоп-листов. При ошибке загрузки используется последнее сохранённое меню; пустой ответ iiko его не затирает.

## Обновить состав меню

1. Изменить внешнее меню **«Симферо Ресторан»** в iiko.
2. Проверить теги групп и порядок блюд.
3. Дождаться автоматической синхронизации либо запустить её вручную:

```bash
cd /home/user/simfero-menu
set -a; . ./.env; set +a
curl -fsS -H "publickey: ${PIBLIC_KEY}" \
  http://127.0.0.1:3000/sync-data -o /dev/null
```

4. Проверить ответ `/menu`, PM2 и отображение на планшете:

```bash
curl -fsS -H "publickey: ${PIBLIC_KEY}" \
  http://127.0.0.1:3000/menu -o /tmp/simfero-menu-check.json
node -e 'const m=require("/tmp/simfero-menu-check.json"); console.log({groups:m.groups.length, products:m.products.length, stopped:m.products.filter(p=>p.isInStopList).length})'
pm2 status
```

## Сделать резервную копию текущего меню

```bash
cd /home/user/simfero-menu
set -a; . ./.env; set +a
mkdir -p /home/user/backups/simfero-menu
BACKUP="/home/user/backups/simfero-menu/menu-$(date +%Y-%m-%dT%H-%M-%S).json"
curl -fsS -H "publickey: ${PIBLIC_KEY}" \
  http://127.0.0.1:3000/menu -o "$BACKUP"
node -e 'const m=require(process.argv[1]); if(!m.products?.length) process.exit(1); console.log(`Сохранено: ${m.products.length} продуктов`)' "$BACKUP"
echo "$BACKUP"
```

Контрольная копия меню до перехода на внешнее меню:

```text
/home/user/backups/simfero-menu/menu-2026-11-09T12-45-09-713Z.json
```

## Установить новую версию сервера

```bash
cd /home/user/simfero-menu
export PATH=/home/user/.nvm/versions/node/v21.7.3/bin:$PATH
git pull origin main
npm run build
npx jest --runInBand
pm2 restart API
pm2 save
```

## Откатить только код

Это возвращает серверный код к состоянию до перехода, но не меняет уже сохранённое меню:

```bash
cd /home/user/simfero-menu
export PATH=/home/user/.nvm/versions/node/v21.7.3/bin:$PATH
git checkout a0805cf -- src/app.service.ts
npm run build
pm2 restart API
pm2 save
```

Вернуть актуальную версию кода:

```bash
git restore --source=main src/app.service.ts
npm run build
pm2 restart API
pm2 save
```

## Полностью откатиться к резервной копии меню

Полный откат выполняется вместе с откатом кода: иначе автоматическая синхронизация снова заменит восстановленную копию актуальным внешним меню.

```bash
cd /home/user/simfero-menu
export PATH=/home/user/.nvm/versions/node/v21.7.3/bin:$PATH
BACKUP="/home/user/backups/simfero-menu/menu-2026-11-09T12-45-09-713Z.json"

pm2 stop API
git checkout a0805cf -- src/app.service.ts
npm run build

node - "$BACKUP" <<'NODE'
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });

(async () => {
  const file = process.argv[2];
  const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(menu.products) || !menu.products.length) {
    throw new Error('В резервной копии нет продуктов');
  }

  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  });
  await client.connect();
  const result = await client.query(
    'UPDATE menu_list SET menu = $1::jsonb',
    [JSON.stringify(menu)],
  );
  await client.end();
  if (!result.rowCount) throw new Error('Таблица menu_list пуста');
  console.log(`Восстановлено продуктов: ${menu.products.length}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE

pm2 start API
pm2 save
pm2 logs API --lines 50
```

После отката проверить `/menu`, стоп-листы, выбор стола, «Деловые обеды» и создание тестового заказа на планшете.
