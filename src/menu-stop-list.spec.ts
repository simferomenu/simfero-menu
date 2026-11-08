import { applyStopListToMenu } from './menu-stop-list';

describe('applyStopListToMenu', () => {
  const menu = {
    products: [
      { id: 'available', name: 'Available' },
      { id: 'stopped', name: 'Stopped' },
      { id: 'negative', name: 'Negative balance' },
      { id: 'not-listed', name: 'Not listed' },
    ],
  };

  const stopListInfo = {
    terminalGroupStopLists: [
      {
        items: [
          {
            items: [
              { productId: 'available', balance: 3 },
              { productId: 'stopped', balance: 0 },
              { productId: 'negative', balance: -1 },
            ],
          },
        ],
      },
    ],
  };

  it('marks only products with a non-positive balance as stopped', () => {
    const result = applyStopListToMenu(menu, stopListInfo);

    expect(result.products.map((product) => product.isInStopList)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(menu.products[1]).not.toHaveProperty('isInStopList');
  });

  it('clears previous stop-list flags when the stop list is empty', () => {
    const result = applyStopListToMenu(
      {
        products: [{ id: 'available', isInStopList: true }],
      },
      { terminalGroupStopLists: [] },
    );

    expect(result.products[0].isInStopList).toBe(false);
  });

  it('rejects empty menus and malformed stop-list responses', () => {
    expect(() =>
      applyStopListToMenu({ products: [] }, stopListInfo),
    ).toThrow('Cannot apply stop list to an empty menu');
    expect(() => applyStopListToMenu(menu, {})).toThrow(
      'iiko returned an invalid stop list response',
    );
  });
});
