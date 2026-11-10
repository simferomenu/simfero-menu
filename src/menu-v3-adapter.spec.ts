import { adaptExternalMenuV3 } from './menu-v3-adapter';

const rootGroups = [
  ['МЕНЮ РЕСТОРАНА', 'root-kitchen', 10],
  ['СУШИ МЕНЮ', 'root-sushi', 11],
  ['МЕНЮ БАРА ', 'root-bar', 12],
  ['КАРТА ВИН', 'root-wine', 13],
  ['МЕНЮ НАПИТКОВ', 'root-drinks', 14],
  ['ДЕЛОВЫЕ ОБЕДЫ', 'root-lunch', 7],
].map(([name, id, order]) => ({
  id,
  name,
  order,
  parentGroup: null,
  isGroupModifier: false,
}));

function previousMenu(groups: any[] = [], products: any[] = []) {
  return {
    sizes: [],
    groups: [...rootGroups, ...groups],
    products,
    productCategories: [],
  };
}

function product(id: string, sku = id) {
  return {
    id,
    sku,
    measureUnit: 'порц',
    productCategoryId: 'category',
    paymentSubjectCode: '1',
    taxCategoryId: 'tax',
  };
}

function size(price = 100) {
  return {
    sizeName: '',
    isDefault: true,
    price,
    buttonImageUrl: 'image-1',
    weight: 250,
    nutritions: { fats: 10.426, proteins: 2, carbs: 3, energy: 100 },
    sku: 'sku',
    menuItemSizeId: 'size-1',
    taxCategoryId: 'tax',
  };
}

describe('adaptExternalMenuV3', () => {
  it('restores roots, lunch drinks, stable IDs and item order', () => {
    const result = adaptExternalMenuV3(
      {
        products: [product('dish'), product('drink')],
        modifiers: [],
        productCategories: [],
        itemsGroups: [
          {
            id: 'new-salads',
            name: 'САЛАТЫ',
            tags: ['кухня'],
            items: [
              {
                productId: 'dish',
                name: 'Новый салат',
                description: 'Описание',
                sizePrices: [size()],
              },
            ],
          },
          {
            id: 'new-rolls',
            name: 'РОЛЛЫ',
            tags: ['суши'],
            items: [
              {
                productId: 'dish',
                name: 'Салат и в суши',
                sizePrices: [size()],
              },
            ],
          },
          {
            id: 'new-lunch',
            name: 'ДЕЛОВЫЕ ОБЕДЫ',
            tags: null,
            items: [],
          },
          {
            id: 'new-extra',
            name: 'ДОПОЛНИТЕЛЬНЫЕ НАПИТКИ',
            tags: ['ДО'],
            items: [
              {
                productId: 'drink',
                name: 'Напиток',
                sizePrices: [size(50)],
              },
            ],
          },
        ],
      },
      previousMenu([
        { id: 'old-salads', name: 'САЛАТЫ', order: 99 },
        { id: 'old-rolls', name: 'РОЛЛЫ', order: 99 },
        {
          id: 'old-extra',
          name: 'ДОПОЛНИТЕЛЬНЫЕ НАПИТКИ',
          order: 99,
        },
      ]),
    );

    expect(result.groups.find((g) => g.id === 'old-salads')).toMatchObject({
      parentGroup: 'root-kitchen',
      order: 0,
    });
    expect(result.groups.find((g) => g.id === 'old-rolls')).toMatchObject({
      parentGroup: 'root-sushi',
      order: 0,
    });
    expect(result.groups.find((g) => g.id === 'old-extra')).toMatchObject({
      parentGroup: 'root-lunch',
      order: 0,
    });
    expect(result.groups.find((g) => g.id === 'root-lunch').order).toBe(7);
    expect(result.products.map((p) => p.parentGroup)).toEqual([
      'old-salads',
      'old-rolls',
      'old-extra',
    ]);
    expect(result.products.map((p) => p.order)).toEqual([0, 0, 0]);
  });

  it('deduplicates equal sizes and converts nutrition and images', () => {
    const duplicate = {
      ...size(),
      menuItemSizeId: 'size-2',
      buttonImageUrl: 'image-2',
    };
    const result = adaptExternalMenuV3(
      {
        products: [product('dish')],
        modifiers: [],
        productCategories: [],
        itemsGroups: [
          {
            id: 'group',
            name: 'САЛАТЫ',
            tags: ['кухня'],
            items: [
              {
                productId: 'dish',
                name: 'Салат',
                sizePrices: [size(), { ...duplicate, buttonImageUrl: 'image-1' }],
              },
            ],
          },
        ],
      },
      previousMenu(),
    );

    expect(result.products[0]).toMatchObject({
      weight: 0.25,
      fatAmount: 10.426,
      fatFullAmount: 26.065,
      proteinsFullAmount: 5,
      carbohydratesFullAmount: 7.5,
      energyFullAmount: 250,
      imageLinks: ['image-1'],
    });
    expect(result.products[0].sizePrices).toHaveLength(1);
    expect(result.products[0].sizePrices[0].price.currentPrice).toBe(100);
  });

  it('maps simple and group modifiers and includes modifier products', () => {
    const result = adaptExternalMenuV3(
      {
        products: [product('dish')],
        modifiers: [
          {
            id: 'modifier-1',
            sku: 'm1',
            name: 'Модификатор 1',
            restrictions: {},
            sizePrices: [{ price: 10, weight: 10, nutritions: {} }],
          },
          {
            id: 'modifier-2',
            sku: 'm2',
            name: 'Модификатор 2',
            restrictions: {},
            sizePrices: [{ price: 20, weight: 20, nutritions: {} }],
          },
        ],
        productCategories: [],
        itemsGroups: [
          {
            id: 'group',
            name: 'САЛАТЫ',
            tags: ['кухня'],
            items: [
              {
                productId: 'dish',
                name: 'Салат',
                sizePrices: [size()],
                modifierGroups: [
                  {
                    id: 'modifier-group',
                    name: 'Обязательный выбор',
                    sku: 'mg',
                    restrictions: { minQuantity: 1, maxQuantity: 1 },
                    items: [{ id: 'modifier-1' }],
                  },
                  {
                    name: 'Дополнительно',
                    restrictions: { minQuantity: 1, defaultQuantity: 1 },
                    items: [{ id: 'modifier-2' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      previousMenu([
        {
          id: 'modifier-group',
          name: 'Старое название',
          isGroupModifier: true,
        },
      ]),
    );

    expect(result.products[0].groupModifiers[0]).toMatchObject({
      id: 'modifier-group',
      required: true,
      minAmount: 1,
      maxAmount: 1,
      childModifiers: [{ id: 'modifier-1', minAmount: 0 }],
    });
    expect(result.products[0].modifiers[0]).toMatchObject({
      id: 'modifier-2',
      required: true,
      minAmount: 1,
      defaultAmount: 1,
    });
    expect(result.groups.find((g) => g.id === 'modifier-group')).toMatchObject({
      name: 'Обязательный выбор',
      isGroupModifier: true,
      parentGroup: null,
    });
    expect(result.products.filter((p) => p.type === 'Modifier')).toHaveLength(2);
    expect(result.products.find((p) => p.id === 'modifier-2').weight).toBe(0.02);
  });

  it('restores the original root order after a temporary tag is removed', () => {
    const result = adaptExternalMenuV3(
      {
        products: [product('dish')],
        modifiers: [],
        productCategories: [],
        itemsGroups: [
          {
            id: 'new-kids',
            name: 'СИМФЕРО ДЕТЯМ',
            tags: [],
            items: [
              {
                productId: 'dish',
                name: 'Детское блюдо',
                sizePrices: [size()],
              },
            ],
          },
        ],
      },
      previousMenu([
        {
          id: 'old-kids',
          name: 'СИМФЕРО ДЕТЯМ',
          parentGroup: 'root-kitchen',
          order: 0,
        },
      ]),
    );

    expect(result.groups.find((g) => g.id === 'old-kids')).toMatchObject({
      parentGroup: null,
      order: 8,
    });
  });

  it('rejects an empty menu and unknown group tags', () => {
    expect(() => adaptExternalMenuV3({ itemsGroups: [] }, previousMenu())).toThrow(
      'empty or invalid',
    );

    expect(() =>
      adaptExternalMenuV3(
        {
          products: [product('dish')],
          itemsGroups: [
            {
              id: 'group',
              name: 'Неизвестная группа',
              tags: ['неизвестный тег'],
              items: [
                { productId: 'dish', name: 'Блюдо', sizePrices: [size()] },
              ],
            },
          ],
        },
        previousMenu(),
      ),
    ).toThrow('unknown tag');
  });
});
