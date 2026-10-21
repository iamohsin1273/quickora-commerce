import { beforeEach, describe, expect, it } from "vitest";
import { useCart, type CartProduct } from "../src/stores/cart";

const product: CartProduct = {
  id: "product-1", slug: "fresh-mango", name: "Fresh Mango", brand: "QUICKORA Fresh",
  image: "https://example.test/mango.jpg", unit: "2 pcs", pricePaise: 14900,
  mrpPaise: 19900, available: 3
};

describe("guest basket", () => {
  beforeEach(() => useCart.getState().clear());

  it("increments a product and removes the line at zero", () => {
    useCart.getState().add(product);
    useCart.getState().add(product);
    expect(useCart.getState().lines[product.id].quantity).toBe(2);
    useCart.getState().decrement(product.id);
    useCart.getState().decrement(product.id);
    expect(useCart.getState().lines[product.id]).toBeUndefined();
  });

  it("caps quantities at available stock", () => {
    for (let count = 0; count < 5; count++) useCart.getState().add(product);
    expect(useCart.getState().lines[product.id].quantity).toBe(3);
  });
});
