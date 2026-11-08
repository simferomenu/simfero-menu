export function applyStopListToMenu(menu: any, stopListInfo: any) {
  if (!Array.isArray(menu?.products) || menu.products.length === 0) {
    throw new Error('Cannot apply stop list to an empty menu');
  }

  if (!Array.isArray(stopListInfo?.terminalGroupStopLists)) {
    throw new Error('iiko returned an invalid stop list response');
  }

  const stoppedProducts = new Map<string, boolean>();

  for (const stopList of stopListInfo.terminalGroupStopLists) {
    for (const terminalGroup of stopList.items || []) {
      for (const item of terminalGroup.items || []) {
        if (!item.productId) {
          continue;
        }

        stoppedProducts.set(
          item.productId,
          Boolean(stoppedProducts.get(item.productId)) || item.balance <= 0,
        );
      }
    }
  }

  return {
    ...menu,
    products: menu.products.map((product) => ({
      ...product,
      isInStopList: stoppedProducts.get(product.id) || false,
    })),
  };
}
