const ROOT_GROUP_BY_TAG: Record<string, string> = {
  кухня: 'МЕНЮ РЕСТОРАНА',
  суши: 'СУШИ МЕНЮ',
  бар: 'МЕНЮ БАРА',
  вино: 'КАРТА ВИН',
  напитки: 'МЕНЮ НАПИТКОВ',
  до: 'ДЕЛОВЫЕ ОБЕДЫ',
};

const REQUIRED_ROOT_GROUPS = [
  'МЕНЮ РЕСТОРАНА',
  'СУШИ МЕНЮ',
  'МЕНЮ БАРА',
  'КАРТА ВИН',
  'МЕНЮ НАПИТКОВ',
];

const ROOT_GROUP_DEFAULTS: Record<string, any> = {
  'грибное меню': { order: 0 },
  'арбузное меню': { order: 1 },
  спаржа: { order: 2 },
  'в крыму есть': { order: 3 },
  'крымские вина': { order: 4 },
  масленица: { order: 5 },
  'рождественское меню': { order: 6 },
  'деловые обеды': {
    id: 'd595ef68-6cc8-45f8-9d7c-17d3e47df37d',
    order: 7,
  },
  'симферо детям': { order: 8 },
  торты: { order: 9 },
  'меню ресторана': {
    id: 'e32baf80-bacd-4f22-af1f-d1969a535566',
    order: 10,
  },
  'суши меню': {
    id: '1d37dcb0-576c-4656-8f78-79c14f219bfd',
    order: 11,
  },
  'меню бара': {
    id: '606700d7-17e3-46b5-b753-900f279f9522',
    order: 12,
  },
  'карта вин': {
    id: '1e815609-ed6a-466d-9914-bc9ca89a3761',
    order: 13,
  },
  'меню напитков': {
    id: 'f53b9025-673c-41ef-a1b3-02fddee5fbbc',
    order: 14,
  },
};

function normalizeName(value: any): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru-RU');
}

function numberOrZero(value: any): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function makeGroup(name: string, id: string, order: number): any {
  return {
    id,
    code: '',
    name,
    tags: [],
    order,
    seoText: null,
    seoTitle: null,
    isDeleted: false,
    imageLinks: [],
    description: null,
    parentGroup: null,
    seoKeywords: null,
    additionalInfo: null,
    seoDescription: null,
    isGroupModifier: false,
    isIncludedInMenu: true,
  };
}

function makeProduct(id: string, type = 'Dish'): any {
  return {
    id,
    code: '',
    name: '',
    tags: [],
    type,
    order: 0,
    weight: 0,
    groupId: null,
    seoText: null,
    seoTitle: null,
    fatAmount: 0,
    isDeleted: false,
    modifiers: [],
    imageLinks: [],
    sizePrices: [],
    splittable: false,
    description: '',
    measureUnit: 'порц',
    parentGroup: null,
    seoKeywords: null,
    energyAmount: 0,
    isInStopList: false,
    fatFullAmount: 0,
    orderItemType: 'Product',
    additionalInfo: null,
    groupModifiers: [],
    paymentSubject: 'ТОВАР',
    proteinsAmount: 0,
    seoDescription: null,
    canSetOpenPrice: false,
    fullNameEnglish: '',
    energyFullAmount: 0,
    modifierSchemaId: null,
    productCategoryId: null,
    useBalanceForSell: false,
    doNotPrintInCheque: false,
    modifierSchemaName: null,
    proteinsFullAmount: 0,
    carbohydratesAmount: 0,
    carbohydratesFullAmount: 0,
  };
}

function modifierAmounts(restrictions: any = {}): any {
  const minAmount = numberOrZero(restrictions?.minQuantity);
  const maxAmount = numberOrZero(restrictions?.maxQuantity);
  const defaultAmount = numberOrZero(restrictions?.defaultQuantity);

  return {
    required: minAmount > 0,
    maxAmount,
    minAmount,
    splittable: false,
    defaultAmount,
    freeOfChargeAmount: 0,
    hideIfDefaultAmount: false,
  };
}

function adaptModifierGroups(modifierGroups: any[]): {
  modifiers: any[];
  groupModifiers: any[];
} {
  const modifiers: any[] = [];
  const groupModifiers: any[] = [];

  for (const modifierGroup of modifierGroups || []) {
    if (modifierGroup.id) {
      groupModifiers.push({
        id: modifierGroup.id,
        ...modifierAmounts(modifierGroup.restrictions),
        childModifiers: (modifierGroup.items || []).map((item: any) => ({
          id: item.id,
          ...modifierAmounts(item.restrictions),
        })),
        childModifiersHaveMinMaxRestrictions: Boolean(
          modifierGroup.childModifiersHaveMinMaxRestrictions,
        ),
      });
    } else {
      for (const item of modifierGroup.items || []) {
        modifiers.push({
          id: item.id,
          ...modifierAmounts({
            ...modifierGroup.restrictions,
            ...item.restrictions,
          }),
        });
      }
    }
  }

  return { modifiers, groupModifiers };
}

function uniqueSizes(sizes: any[]): any[] {
  const unique = new Map<string, any>();

  for (const size of sizes || []) {
    const key = JSON.stringify({
      sizeName: size.sizeName,
      price: size.price,
      buttonImageUrl: size.buttonImageUrl,
      weight: size.weight,
      nutritions: size.nutritions,
      sku: size.sku,
      taxCategoryId: size.taxCategoryId,
    });

    if (!unique.has(key)) {
      unique.set(key, size);
    }
  }

  return [...unique.values()];
}

function adaptSizePrices(sizes: any[]): any[] {
  return uniqueSizes(sizes).map((size) => ({
    sizeId: null,
    price: {
      currentPrice: numberOrZero(size.price),
      isIncludedInMenu: true,
      nextPrice: null,
      nextIncludedInMenu: false,
      nextDatePrice: null,
    },
  }));
}

function adaptNutrition(size: any): any {
  const weightInGrams = numberOrZero(size?.weight);
  const fatAmount = numberOrZero(size?.nutritions?.fats);
  const proteinsAmount = numberOrZero(size?.nutritions?.proteins);
  const carbohydratesAmount = numberOrZero(size?.nutritions?.carbs);
  const energyAmount = numberOrZero(size?.nutritions?.energy);

  return {
    weight: rounded(weightInGrams / 1000),
    fatAmount,
    proteinsAmount,
    carbohydratesAmount,
    energyAmount,
    fatFullAmount: rounded((fatAmount * weightInGrams) / 100),
    proteinsFullAmount: rounded((proteinsAmount * weightInGrams) / 100),
    carbohydratesFullAmount: rounded(
      (carbohydratesAmount * weightInGrams) / 100,
    ),
    energyFullAmount: rounded((energyAmount * weightInGrams) / 100),
  };
}

function imageLinks(sizes: any[]): string[] {
  return [
    ...new Set(
      (sizes || [])
        .map((size) => size.buttonImageUrl)
        .filter((url) => typeof url === 'string' && url.trim()),
    ),
  ];
}

export function adaptExternalMenuV3(externalMenu: any, previousMenu: any): any {
  if (
    !Array.isArray(externalMenu?.itemsGroups) ||
    !Array.isArray(externalMenu?.products) ||
    !externalMenu.itemsGroups.some((group: any) => group.items?.length)
  ) {
    throw new Error('iiko returned an empty or invalid external menu');
  }

  const oldGroups = Array.isArray(previousMenu?.groups)
    ? previousMenu.groups
    : [];
  const oldProducts = Array.isArray(previousMenu?.products)
    ? previousMenu.products
    : [];
  const oldGroupsByName = new Map<string, any>();
  const oldProductsById = new Map<string, any>();

  for (const group of oldGroups) {
    if (!oldGroupsByName.has(normalizeName(group.name))) {
      oldGroupsByName.set(normalizeName(group.name), group);
    }
  }

  for (const product of oldProducts) {
    if (!oldProductsById.has(product.id)) {
      oldProductsById.set(product.id, product);
    }
  }

  const groups: any[] = REQUIRED_ROOT_GROUPS.map((name) => {
    const normalizedName = normalizeName(name);
    const oldGroup = oldGroupsByName.get(normalizedName);
    const defaults = ROOT_GROUP_DEFAULTS[normalizedName];

    return {
      ...makeGroup(name, defaults.id, defaults.order),
      ...oldGroup,
      id: oldGroup?.id || defaults.id,
      name: oldGroup?.name || name,
      order: oldGroup?.order ?? defaults.order,
      tags: [],
      parentGroup: null,
      isDeleted: false,
      isGroupModifier: false,
      isIncludedInMenu: true,
    };
  });

  const groupIdByExternalId = new Map<string, string>();
  const childOrderByParent = new Map<string, number>();
  const modifierGroupIds = new Set<string>();
  const products: any[] = [];
  const externalProductsById = new Map<string, any>(
    externalMenu.products.map((product: any) => [product.id, product]),
  );

  for (const externalGroup of externalMenu.itemsGroups) {
    const tags = (externalGroup.tags || []).map((tag: any) =>
      normalizeName(tag),
    );

    if (tags.length > 1) {
      throw new Error(
        `External menu group "${externalGroup.name}" has multiple tags`,
      );
    }

    const rootName = tags.length ? ROOT_GROUP_BY_TAG[tags[0]] : null;

    if (tags.length && !rootName) {
      throw new Error(
        `External menu group "${externalGroup.name}" has an unknown tag: ${tags[0]}`,
      );
    }

    const normalizedExternalName = normalizeName(externalGroup.name);
    const oldGroup = oldGroupsByName.get(normalizedExternalName);

    if (rootName) {
      const normalizedRootName = normalizeName(rootName);
      const oldRoot = oldGroupsByName.get(normalizedRootName);
      const rootDefaults = ROOT_GROUP_DEFAULTS[normalizedRootName];
      const parentGroup = oldRoot?.id || rootDefaults.id;
      const order = childOrderByParent.get(parentGroup) || 0;
      childOrderByParent.set(parentGroup, order + 1);

      const group = {
        ...makeGroup(externalGroup.name, externalGroup.id, order),
        ...oldGroup,
        id: oldGroup?.id || externalGroup.id,
        name: externalGroup.name,
        description: externalGroup.description ?? oldGroup?.description ?? null,
        tags: externalGroup.tags || [],
        order,
        parentGroup,
        isDeleted: false,
        isGroupModifier: false,
        isIncludedInMenu: true,
      };

      groups.push(group);
      groupIdByExternalId.set(externalGroup.id, group.id);
    } else {
      const defaults = ROOT_GROUP_DEFAULTS[normalizedExternalName];
      const group = {
        ...makeGroup(
          externalGroup.name,
          oldGroup?.id || defaults?.id || externalGroup.id,
          defaults?.order ?? oldGroup?.order ?? 0,
        ),
        ...oldGroup,
        id: oldGroup?.id || defaults?.id || externalGroup.id,
        name: oldGroup?.name || externalGroup.name,
        description: externalGroup.description ?? oldGroup?.description ?? null,
        tags: [],
        order: defaults?.order ?? oldGroup?.order ?? 0,
        parentGroup: null,
        isDeleted: false,
        isGroupModifier: false,
        isIncludedInMenu: true,
      };

      if (!groups.some((existing) => existing.id === group.id)) {
        groups.push(group);
      }
      groupIdByExternalId.set(externalGroup.id, group.id);
    }

    const parentGroup = groupIdByExternalId.get(externalGroup.id);

    (externalGroup.items || []).forEach((item: any, order: number) => {
      const externalProduct = externalProductsById.get(item.productId);

      if (!externalProduct) {
        throw new Error(
          `External menu item "${item.name}" has no product ${item.productId}`,
        );
      }

      const oldProduct = oldProductsById.get(item.productId);
      const sizes = uniqueSizes(item.sizePrices);
      const adaptedModifiers = adaptModifierGroups(item.modifierGroups);

      for (const modifierGroup of item.modifierGroups || []) {
        if (modifierGroup.id) {
          modifierGroupIds.add(modifierGroup.id);
        }
      }

      products.push({
        ...makeProduct(item.productId),
        ...oldProduct,
        id: item.productId,
        code: externalProduct.sku || oldProduct?.code || '',
        name: item.name,
        description: item.description || '',
        type: oldProduct?.type || 'Dish',
        order,
        parentGroup,
        measureUnit:
          externalProduct.measureUnit || oldProduct?.measureUnit || 'порц',
        productCategoryId: externalProduct.productCategoryId || null,
        canSetOpenPrice: Boolean(externalProduct.canSetOpenPrice),
        isDeleted: false,
        isInStopList: false,
        imageLinks: imageLinks(item.sizePrices),
        sizePrices: adaptSizePrices(item.sizePrices),
        ...adaptNutrition(sizes[0]),
        modifiers: adaptedModifiers.modifiers,
        groupModifiers: adaptedModifiers.groupModifiers,
      });
    });
  }

  for (const externalModifier of externalMenu.modifiers || []) {
    const oldModifier = oldProductsById.get(externalModifier.id);
    const size = externalModifier.sizePrices?.[0];

    products.push({
      ...makeProduct(externalModifier.id, 'Modifier'),
      ...oldModifier,
      id: externalModifier.id,
      code: externalModifier.sku || oldModifier?.code || '',
      name: externalModifier.name,
      description: externalModifier.description || '',
      type: 'Modifier',
      parentGroup: null,
      tags: externalModifier.tags || [],
      isDeleted: false,
      isInStopList: false,
      imageLinks: externalModifier.buttonImageUrl
        ? [externalModifier.buttonImageUrl]
        : [],
      sizePrices: adaptSizePrices(externalModifier.sizePrices),
      ...adaptNutrition(size),
      modifiers: [],
      groupModifiers: [],
    });
  }

  for (const externalGroup of externalMenu.itemsGroups) {
    for (const item of externalGroup.items || []) {
      for (const modifierGroup of item.modifierGroups || []) {
        if (!modifierGroup.id || groups.some((g) => g.id === modifierGroup.id)) {
          continue;
        }

        const oldGroup = oldGroups.find((g) => g.id === modifierGroup.id);
        groups.push({
          ...makeGroup(modifierGroup.name, modifierGroup.id, oldGroup?.order || 0),
          ...oldGroup,
          id: modifierGroup.id,
          code: modifierGroup.sku || oldGroup?.code || '',
          name: modifierGroup.name,
          parentGroup: null,
          isDeleted: false,
          isGroupModifier: true,
          isIncludedInMenu: true,
        });
      }
    }
  }

  const oldCategoriesById = new Map<string, any>(
    (previousMenu?.productCategories || []).map((category: any) => [
      category.id,
      category,
    ]),
  );

  return {
    ...previousMenu,
    sizes: previousMenu?.sizes || [],
    groups,
    products,
    productCategories: (externalMenu.productCategories || []).map(
      (category: any) => ({
        isDeleted: false,
        ...oldCategoriesById.get(category.id),
        ...category,
      }),
    ),
    revision: Date.now(),
  };
}
