import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import axios from 'axios';
import { TableOrder, MenuList, Config } from './entities';

@Injectable()
export class AppService {
  // iiko API v2 credentials
  public appId: string;

  public clientSecret: string;

  public apiKey: string;

  public apiURL: string;

  public authToken: string;

  public defaultHeaders;

  public webHookURL;

  private syncDataPromise: Promise<any> | null = null;

  private syncDataTimeout: NodeJS.Timeout | null = null;

  private lastKnownTables: any[] | null = null;

  private readonly WEBHOOK_SYNC_DELAY = 60_000;

  constructor(
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    // iiko API v2 authorization data
    this.appId = this.configService.get('IIKO_APP_ID');
    this.clientSecret = this.configService.get('IIKO_CLIENT_SECRET');
    this.apiKey = this.configService.get('IIKO_API_KEY');

    this.apiURL = this.configService.get('API_PATH');
    this.webHookURL = this.configService.get('WEBHOOK');

    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };

    this.refreshTokenAndWebhookSettings()
      .then(() => this.syncData())
      .catch((error) => {
        console.error(
          'App initialization failed:',
          error.response?.data || error.message,
        );
      });

    // iiko token lives for 1 hour.
    // Refresh a little earlier - every 55 minutes.
    setInterval(
      () => {
        this.refreshTokenAndWebhookSettings().catch((error) => {
          console.error(
            'Scheduled iiko auth or webhook update failed:',
            error.response?.data || error.message,
          );
        });
      },
      1000 * 60 * 55,
    );

    setInterval(
      () => {
        this.scheduleSyncData(0);
      },
      1000 * 60 * 15,
    );
  }

  private async refreshTokenAndWebhookSettings() {
    await this.auth();
    await this.setWebhookSettings();
  }

  private scheduleSyncData(delay = this.WEBHOOK_SYNC_DELAY) {
    if (this.syncDataTimeout) {
      return;
    }

    this.syncDataTimeout = setTimeout(() => {
      this.syncDataTimeout = null;
      this.syncData().catch((error) => {
        console.error(
          'Scheduled data sync failed:',
          error.response?.data || error.message,
        );
      });
    }, delay);
  }

  private authPromise: Promise<void> | null = null;

  private lastAuthAttempt: number = 0;

  private readonly MIN_AUTH_INTERVAL = 5000;
  // Minimum 5 seconds between auth attempts

  async auth() {
    // If authentication is already in progress, wait for it
    if (this.authPromise) {
      console.log('Authentication already in progress, waiting...');
      return this.authPromise;
    }

    // Rate limiting: prevent too frequent auth attempts
    const timeSinceLastAuth = Date.now() - this.lastAuthAttempt;

    if (timeSinceLastAuth < this.MIN_AUTH_INTERVAL) {
      const waitTime = this.MIN_AUTH_INTERVAL - timeSinceLastAuth;

      console.log(
        `Rate limiting: waiting ${waitTime}ms before auth attempt`,
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Create shared promise for concurrent callers
    this.authPromise = this._performAuth();

    try {
      await this.authPromise;
    } finally {
      this.authPromise = null;
    }
  }

  /**
   * iiko API v2 authorization
   *
   * POST /api/v2/access_token
   *
   * {
   *   appId,
   *   clientSecret,
   *   apiKey
   * }
   */
  private async _performAuth() {
    this.lastAuthAttempt = Date.now();

    try {
      const config = {
        method: 'post',
        url: `${this.apiURL}/v2/access_token`,
        timeout: 15000,
        headers: this.defaultHeaders,
        data: {
          appId: this.appId,
          clientSecret: this.clientSecret,
          apiKey: this.apiKey,
        },
      };

      const response = await axios(config);

      this.authToken = response.data.token;

      console.log('iiko API v2 auth successful, token obtained');
    } catch (error) {
      console.error(
        'iiko API v2 auth error:',
        error.response?.status || error.message,
        error.response?.data || '',
      );

      throw error;
    }
  }

  /**
   * Wrapper for authenticated API calls with automatic 401 token refresh
   * Prevents infinite loops with hard retry limits
   */
  async makeAuthenticatedRequest(
    requestConfig: any,
    retryCount: number = 0,
  ): Promise<any> {
    // Hard limit: max 2 retries total
    // (original + 2 retries = 3 attempts max)
    if (retryCount >= 2) {
      console.error(
        `Maximum retry limit reached. Aborting request to ${requestConfig.url}`,
      );

      throw new Error('Request failed after maximum retries');
    }

    try {
      const response = await axios({
        timeout: 30000,
        ...requestConfig,
      });
      return response;
    } catch (error) {
      // Only retry on 401 Unauthorized, and only once
      if (error.response?.status === 401 && retryCount === 0) {
        console.log(
          'Received 401 Unauthorized, attempting token refresh...',
        );

        try {
          await this.auth();

          console.log('Token refreshed, retrying request...');

          // Update auth header with new token
          requestConfig.headers.Authorization =
            `Bearer ${this.authToken}`;

          // Retry once
          return await this.makeAuthenticatedRequest(
            requestConfig,
            retryCount + 1,
          );
        } catch (authError) {
          console.error(
            'Token refresh failed:',
            authError.message,
          );

          throw new Error(
            'Authentication failed: Unable to refresh token',
          );
        }
      }

      // For all other errors (including 429),
      // throw immediately - let caller handle
      throw error;
    }
  }

  async getOrganizations() {
    const config = {
      method: 'get',
      url: `${this.apiURL}/1/organizations`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data.organizations;
  }

  async getTerminals() {
    const org = (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/terminal_groups`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
      data: JSON.stringify({
        organizationIds: [org],
      }),
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data.terminalGroups[0].items[0];
  }

  private async getStaleTables(): Promise<any[] | null> {
    try {
      const staleData = await this.cacheManager.get<any[]>('tables:list:stale');

      if (staleData) {
        this.lastKnownTables = staleData;
        console.warn('Returning stale tables data from Redis');
        return staleData;
      }
    } catch (error) {
      console.error('Unable to read stale tables cache:', error.message);
    }

    if (this.lastKnownTables) {
      console.warn('Returning last known tables data from memory');
    }

    return this.lastKnownTables;
  }

  async getTables() {
    const cacheKey = 'tables:list';
    let cachedData: any[] | undefined;

    try {
      cachedData = await this.cacheManager.get<any[]>(cacheKey);
    } catch (error) {
      console.error('Unable to read tables cache:', error.message);
    }

    if (cachedData) {
      this.lastKnownTables = cachedData;
      console.log('Returning cached tables data');
      return cachedData;
    }

    console.log('Cache miss, fetching tables from API');

    try {
      const terms = (await this.getTerminals()).id;

      const config = {
        method: 'post',
        url: `${this.apiURL}/1/reserve/available_restaurant_sections`,
        headers: {
          ...this.defaultHeaders,
          Authorization: `Bearer ${this.authToken}`,
        },
        data: JSON.stringify({
          terminalGroupIds: [terms],
        }),
      };

      const response = await this.makeAuthenticatedRequest(config);
      const sections = response.data.restaurantSections;

      const terassa = sections.find(
        ({ id }) => id === '40d52478-3cb8-4fa8-8813-3db688499db4',
      );

      const rest = sections.find(
        ({ id }) => id === '4577c29c-bcdb-4c63-84ca-ab1a256e0e54',
      );

      if (!terassa || !rest) {
        throw new Error('Expected restaurant sections were not returned');
      }

      const result = [
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

      if (!result.some((section) => section.tables.length > 0)) {
        throw new Error('iiko returned an empty table list');
      }

      this.lastKnownTables = result;

      try {
        // cache-manager v7 expects TTL in milliseconds.
        await this.cacheManager.set(cacheKey, result, 30 * 24 * 60 * 60 * 1000);
        await this.cacheManager.set('tables:list:stale', result);
        console.log('Tables data cached for 30 days');
      } catch (error) {
        console.error('Unable to write tables cache:', error.message);
      }

      return result;
    } catch (error) {
      console.error(
        'Unable to fetch tables from iiko:',
        error.response?.status || error.message,
      );

      const staleData = await this.getStaleTables();

      if (staleData) {
        return staleData;
      }

      throw error;
    }
  }

  async getMenu() {
    const org = (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',

      // Пока оставляем старый метод номенклатуры.
      // На следующем этапе отдельно переведем меню на API v2.
      url: `${this.apiURL}/1/nomenclature `,

      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
        'Accept-Encoding': 'gzip, deflate',
      },

      data: JSON.stringify({
        organizationId: org,
      }),
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data;
  }

  async createOrder(data) {
    const org =
      (await this.getOrganizations())[0].id;

    const terms =
      (await this.getTerminals()).id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/order/create`,
      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },
      data: JSON.stringify({
        organizationId: org,
        terminalGroupId: terms,

        order: {
          tableIds: [data.table],
          items: data.items,
        },
      }),
    };

    console.log(config, new Date());

    const response =
      await this.makeAuthenticatedRequest(config);

    await TableOrder.update(
      {
        table: data.table,
      },
      {
        status: 'pending',
      },
    );

    return response.data;
  }

  async getTableOrders(data) {
    const org =
      (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/order/by_table`,

      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },

      data: JSON.stringify({
        organizationIds: [org],
        tableIds: [data.table],
      }),
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data;
  }

  async deleteTableOrder({ tableId }) {
    const org =
      (await this.getOrganizations())[0].id;

    const existedOrder =
      await TableOrder.findOneBy({
        table: tableId,
      });

    if (existedOrder) {
      const config = {
        method: 'post',
        url: `${this.apiURL}/1/order/close`,

        headers: {
          ...this.defaultHeaders,
          Authorization:
            `Bearer ${this.authToken}`,
        },

        data: JSON.stringify({
          organizationId: org,
          orderId: existedOrder.orderId,
        }),
      };

      try {
        if (existedOrder.orderId) {
          await this.makeAuthenticatedRequest(
            config,
          );
        }

        await TableOrder.delete({
          table: tableId,
        });

        return {
          removed: true,
        };
      } catch (error) {
        console.log('ERROR: ', error);
      }
    } else {
      return {
        status: 'no-order',
      };
    }
  }

  async updateOrder(data) {
    const org =
      (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/order/add_items`,

      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },

      data: JSON.stringify({
        organizationId: org,
        orderId: data.order,
        items: data.items,
      }),
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data;
  }

  async getWebhookSettings() {
    const org =
      (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',
      url: `${this.apiURL}/1/webhooks/settings`,

      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },

      data: JSON.stringify({
        organizationId: org,
      }),
    };

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data;
  }

  async setWebhookSettings() {
    const org =
      (await this.getOrganizations())[0].id;

    const config = {
      method: 'post',

      url:
        `${this.apiURL}/1/webhooks/update_settings`,

      headers: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${this.authToken}`,
      },

      data: JSON.stringify({
        organizationId: org,

        webHooksUri: this.webHookURL,

        webHooksFilter: {
          deliveryOrderFilter: {
            orderStatuses: [
              'Unconfirmed',
            ],

            itemStatuses: [
              'Added',
            ],

            errors: true,

            returnedExternalDataKeys: [
              'string',
            ],
          },

          tableOrderFilter: {
            orderStatuses: [
              'New',
            ],

            itemStatuses: [
              'Added',
            ],

            errors: true,
          },

          reserveFilter: {
            updates: true,
            errors: true,
          },

          stopListUpdateFilter: {
            updates: true,
          },

          personalShiftFilter: {
            updates: true,
          },

          nomenclatureUpdateFilter: {
            updates: true,
          },
        },
      }),
    };

    console.log('Updating webhook settings after token refresh');

    const response =
      await this.makeAuthenticatedRequest(config);

    console.log(
      'Config setup: ',
      response.data,
    );

    return response.data;
  }

  async getStopListInfo() {
    const org =
      (await this.getOrganizations())[0].id;

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

    const response =
      await this.makeAuthenticatedRequest(config);

    return response.data;
  }

  async webhookHandler(data) {
    for (
      let i = 0;
      i < data.length;
      i++
    ) {
      if (
        data[i].eventType ===
        'TableOrderUpdate'
      ) {
        const order =
          data[i].eventInfo.order;

        const existedOrder =
          await TableOrder.findOneBy({
            table: order.tableIds[0],
          });

        console.log(
          'Order status: ',
          order,
          order.status,
        );

        if (
          ['Closed', 'Deleted'].includes(
            order.status,
          )
        ) {
          return await TableOrder.delete({
            orderId:
              data[i].eventInfo.id,
          });
        }

        if (!existedOrder) {
          await TableOrder.create({
            status: 'created',

            table:
              order.tableIds[0],

            orderId:
              data[i].eventInfo.id,

            order: JSON.stringify({
              ...order,

              items: order.items.map(
                (item) => ({
                  ...item,
                  ...item.product,
                }),
              ),
            }),

            preOrder: null,
          }).save();
        } else {
          const groupedArray = [];

          order.items.forEach(
            (item) => {
              const itemInGroup =
                groupedArray.find(
                  ({ product }) =>
                    product.id ===
                    item.product.id,
                );

              if (!itemInGroup) {
                groupedArray.push(item);
              } else {
                itemInGroup.amount =
                  itemInGroup.amount +
                  item.amount;
              }
            },
          );

          await TableOrder.update(
            {
              table:
                order.tableIds[0],
            },
            {
              status: 'created',

              orderId:
                data[i].eventInfo.id,

              order: JSON.stringify({
                ...order,

                items:
                  groupedArray.map(
                    (item) => ({
                      ...item,
                      ...item.product,
                    }),
                  ),
              }),

              preOrder: null,
            },
          );
        }
      } else if (
        data[i].eventType ===
          'StopListUpdate' ||
        data[i].eventType ===
          'NomenclatureUpdate'
      ) {
        console.log(
          data[i].eventType + ':',
        );

        this.scheduleSyncData();
      } else {
        /* TODO check order close */

        console.log(
          'data[i].eventType: ',
          data[i].eventType,
        );

        if (
          data[i].eventType ===
          'TableOrderError'
        ) {
          console.log(
            data[i].eventInfo
              .errorInfo,
          );
        }
      }
    }
  }

  async getTotalInfo(data) {
    return {
      table:
        this.checkTableOrders(data),

      menuVersion:
        await Config.findOne({
          where: {
            name: 'version',
          },
        }),
    };
  }

  async preOrderUpdate({
    table,
    items,
  }) {
    const existedOrder =
      await TableOrder.findOneBy({
        table,
      });

    if (existedOrder) {
      await TableOrder.update(
        {
          table,
        },
        {
          preOrder: items
            ? JSON.stringify({
                items: items.map(
                  ({
                    amount,
                    id,
                    name,
                    description,
                  }) => ({
                    amount,
                    id,
                    name,
                    description,
                  }),
                ),
              })
            : null,
        },
      );
    } else {
      await TableOrder.create({
        table,

        preOrder: JSON.stringify({
          items: items.map(
            ({
              amount,
              id,
              name,
              description,
            }) => ({
              amount,
              id,
              name,
              description,
            }),
          ),
        }),
      }).save();
    }
  }

  async checkTableOrders(data) {
    if (data.tableId) {
      return await TableOrder.findOneBy({
        table: data.tableId,
      });
    }

    return null;
  }

  async syncData() {
    if (this.syncDataPromise) {
      console.log('Data sync already in progress');
      return this.syncDataPromise;
    }

    this.syncDataPromise = this.performSyncData();

    try {
      return await this.syncDataPromise;
    } finally {
      this.syncDataPromise = null;
    }
  }

  private async performSyncData() {
    const menu =
      await this.getMenu();

    const stopList =
      (
        await this.getStopListInfo()
      )?.terminalGroupStopLists[0]
        .items[0].items;

    menu.products.forEach(
      (item) => {
        const product =
          stopList.find(
            (p) =>
              p.productId ===
              item.id,
          );

        if (product) {
          item.isInStopList =
            Boolean(
              product.balance <= 0,
            );
        } else {
          item.isInStopList =
            false;
        }
      },
    );

    const menuItem =
      await MenuList.find();

    if (menuItem[0]) {
      await MenuList.update(
        {
          id: menuItem[0].id,
        },
        {
          menu,
        },
      );
    } else {
      await MenuList.create({
        menu,
      }).save();
    }

    const version =
      await Config.findOne({
        where: {
          name: 'version',
        },
      });

    if (!version) {
      await Config.create({
        name: 'version',
        value: '1',
      }).save();
    } else {
      await Config.update(
        {
          name: 'version',
        },
        {
          value: String(
            parseInt(
              version.value,
              10,
            ) + 1,
          ),
        },
      );
    }

    return menu;
  }

  async getMenuLastData() {
    const menu =
      await MenuList.find();

    return menu[0]?.menu || {};
  }
}