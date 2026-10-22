import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  ArrowRight, BadgePercent, Check, Clock3, Heart, Home, MapPin, Minus,
  PackageCheck, Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Star,
  Truck, UserRound, X
} from "lucide-react";
import { api } from "./lib/api";
import { useCart, type CartProduct } from "./stores/cart";
import { formatINR, type UserRole } from "@quickora/shared";

const DashboardCharts = lazy(() => import("./DashboardCharts"));

type Category = { id: string; name: string; slug: string; image: string; _count?: { products: number } };
type Product = CartProduct & {
  description: string; sku: string; featured: boolean; active: boolean; rating: number | null; reviewCount: number;
  category: Category; inventory: { quantity: number; lowStockAt: number } | null;
};
type SessionUser = { id: string; name: string; email: string; phone: string; role: UserRole };
type Address = { id: string; fullName: string; phone: string; house: string; street: string; landmark?: string; locality: string; city: string; state: string; pinCode: string; type: string; isDefault: boolean };
type Order = { id: string; orderNumber: string; status: string; totalPaise: number; createdAt: string; paymentMethod: string; paymentStatus: string; estimatedDelivery: string; items: Array<{ id: string; productName: string; image: string; unit: string; quantity: number; unitPricePaise: number }>; addressSnapshot: Record<string, string>; assignment?: { id: string; status: string; partner: { id: string; user: { name: string } } } | null };
type ApiProductPage = { products: Product[]; pagination: { page: number; pages: number; total: number } };
const currency = (value: number) => formatINR(value);
const pctOff = (mrp: number, price: number) => mrp > price ? Math.round((mrp - price) * 100 / mrp) : 0;
function openFoodFactsProductUrl(image: string) {
  const barcode = /images\.openfoodfacts\.net\/images\/products\/((?:\d{3}\/){3}\d{4})\//.exec(image)?.[1].replace(/\//g, "");
  return barcode ? `https://world.openfoodfacts.org/product/${barcode}` : undefined;
}
const defaultCategories: Category[] = ([
  ["Fruits & vegetables", "fruits-vegetables", "photo-1610832958506-aa56368176cf"],
  ["Dairy, bread & eggs", "dairy-bread-eggs", "photo-1628088062854-d1870b4553da"],
  ["Snacks & munchies", "snacks-munchies", "photo-1621939514649-280e2aa11882"],
  ["Cold drinks & juices", "cold-drinks-juices", "photo-1544145945-f90425340c7e"],
  ["Breakfast & instant food", "breakfast-instant-food", "photo-1517673132405-a56a62b18caf"],
  ["Atta, rice & dal", "atta-rice-dal", "photo-1586201375761-83865001e31c"],
  ["Oils & spices", "oils-spices", "photo-1596040033229-a9821ebd058d"],
  ["Beauty & personal care", "personal-care", "photo-1608248543803-ba4f8c70ae0b"],
  ["Home & kitchen", "household-essentials", "photo-1585421514738-01798e348b17"],
  ["Baby care", "baby-care", "photo-1519689680058-324335c77eba"],
  ["Pet supplies", "pet-supplies", "photo-1583337130417-3346a1be7dee"],
  ["Ice cream & desserts", "ice-cream-desserts", "photo-1563805042-7684c019e1cb"]
] as const).map(([name, slug, photo], index) => ({
  id: `browse-${index}`,
  name,
  slug,
  image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=500&q=80`
}));
const popularBrands = [
  "Amul", "Britannia", "Aashirvaad", "Tata Sampann", "Lay's", "Haldiram's",
  "Maggi", "Coca-Cola", "Dove", "Colgate", "Surf Excel", "Pampers"
];

function useCategories() {
  const { data } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories")
  });
  return data?.length ? data : defaultCategories;
}

function Brand() {
  return <Link className="brand" to="/" aria-label="QUICKORA home">
    <img className="brand-mark" src="/quickora-mark.svg" alt="" />
    <span className="brand-word">QUICKORA</span>
  </Link>;
}

function App() {
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionUser }>("/auth/me").then(v => v.user),
    retry: false
  });
  return (
    <div className="app-shell">
      <Header session={session} />
      <main className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<CatalogPage />} />
          <Route path="/product/:slug" element={<ProductDetail />} />
          <Route path="/cart" element={<CartPage session={session} />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/checkout" element={<CheckoutPage session={session} />} />
          <Route path="/orders" element={<OrdersPage session={session} />} />
          <Route path="/orders/:id" element={<OrderDetail session={session} />} />
          <Route path="/account" element={<AccountPage session={session} />} />
          <Route path="/admin/*" element={<AdminPage session={session} />} />
          <Route path="/delivery" element={<DeliveryPage session={session} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <MobileNav session={session} />
    </div>
  );
}
export default App;

function Header({ session }: { session?: SessionUser }) {
  const [searchText, setSearchText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const { lines } = useCart();
  const navigate = useNavigate();
  const totalItems = Object.values(lines).reduce((n, item) => n + item.quantity, 0);
  const categories = useCategories();
  const location = useLocation();
  const selectedCategory = new URLSearchParams(location.search).get("category");
  const onShopPage = location.pathname === "/shop";
  const { data: searchData } = useQuery({
    queryKey: ["search-suggestions", debounced],
    queryFn: () => api<{ suggestions: Product[]; popular: string[] }>(`/products/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(searchText.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  function submitSearch(value = searchText) {
    setOpen(false);
    navigate(`/shop?q=${encodeURIComponent(value.trim())}`);
  }
  return (
    <header className="site-header">
      <div className="container">
        <div className="topline">
          <Brand />
          <div className="delivery-location">
            <small>DELIVERING TO</small><strong><MapPin size={14} /> Chennai, Tamil Nadu</strong>
            <span>Choose an address at checkout</span>
          </div>
          <div className="search-wrap">
            <div className="searchbox">
              <Search size={18} /><input value={searchText} onChange={e => { setSearchText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={e => { if (e.key === "Enter") submitSearch(); if (e.key === "Escape") setOpen(false); }} placeholder="Search for milk, fruits, snacks..." aria-label="Search products" />
              {searchText && <button className="icon-button" aria-label="Clear search" onClick={() => { setSearchText(""); setDebounced(""); }}><X size={16} /></button>}
            </div>
            {open && searchText.length > 0 && <div className="search-results" role="listbox">
              {searchData?.suggestions.length ? searchData.suggestions.map(product => (
                <Link className="search-result" to={`/product/${product.slug}`} key={product.id} onClick={() => setOpen(false)}>
                  <img src={product.image} onError={e => { e.currentTarget.src = "/product-fallback.svg"; }} alt="" /><span><strong>{product.name}</strong><br /><small className="muted">{product.brand} · {currency(product.pricePaise)}</small></span>
                </Link>
              )) : <button className="search-result" onClick={() => submitSearch()}><Search size={16} /> Search all products for “{searchText}”</button>}
              {!!searchData?.popular.length && <div className="search-result muted"><Sparkles size={15} /> Popular: {searchData.popular.slice(0, 3).join(", ")}</div>}
            </div>}
          </div>
          <div className="header-actions">
            <Link to={session ? "/account" : "/signin"} className="account-button"><UserRound size={18} /><span>{session?.name?.split(" ")[0] ?? "Sign in"}</span></Link>
            {session?.role === "ADMIN" && <Link className="icon-button" to="/admin">Admin</Link>}
            {session?.role === "DELIVERY" && <Link className="icon-button" to="/delivery">Delivery</Link>}
            <Link to="/cart" className="cart-button"><ShoppingCart size={18} /><span className="cart-count">{totalItems}</span><span>Cart</span></Link>
          </div>
        </div>
        <nav className="category-strip" aria-label="Product categories">
          <Link className={!selectedCategory && onShopPage ? "category-nav-active" : ""} to="/shop">Shop all</Link>
          {categories.map(category => <Link className={selectedCategory === category.slug ? "category-nav-active" : ""} key={category.slug} to={`/shop?category=${category.slug}`}>{category.name}</Link>)}
        </nav>
      </div>
    </header>
  );
}

function HomePage() {
  const categories = useCategories();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["products", "home"],
    queryFn: () => api<ApiProductPage>("/products?sort=popular&limit=20")
  });
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">A better kind of grocery run</div>
        <h1>Everyday fresh.<br />At your door, fast.</h1>
        <p>Farm-fresh picks and daily essentials, delivered across Chennai when you need them.</p>
        <Link to="/shop" className="button-primary">Shop essentials <ArrowRight size={17} /></Link>
        <div className="hero-pill"><Clock3 size={15} /> Delivery estimate: 25–40 min</div>
      </div>
      <div className="hero-art" role="img" aria-label="Fresh produce in a market" />
    </section>
    <div className="section-head"><div><h2>Shop by category</h2><p>Good things for every corner of home</p></div><Link className="text-link" to="/shop">View all <ArrowRight size={14} /></Link></div>
    <div className="category-grid">{categories.map(category => <Link className="category-card" to={`/shop?category=${category.slug}`} key={category.slug}><img loading="lazy" src={category.image} onError={e => { e.currentTarget.src = "/product-fallback.svg"; }} alt="" /><span>{category.name}</span></Link>)}</div>
    <section className="brand-section" aria-labelledby="popular-brands-heading">
      <div className="section-head"><div><h2 id="popular-brands-heading">Shop popular brands</h2><p>Everyday favourites from brands you know</p></div><Link className="text-link" to="/shop">Browse all products <ArrowRight size={14} /></Link></div>
      <div className="brand-grid">{popularBrands.map(brand => <Link className="brand-chip" to={`/shop?brand=${encodeURIComponent(brand)}`} key={brand}><span>{brand}</span><ArrowRight size={14} /></Link>)}</div>
    </section>
    <div className="offer-banner"><div><h3>A little welcome treat for your first basket</h3><p>Save 10% on orders over ₹299. A fresh start, on us.</p></div><div className="offer-code">WELCOME10</div></div>
    <section>
      <div className="section-head"><div><h2>Popular right now</h2><p>Customer favourites, picked for you</p></div><Link className="text-link" to="/shop">See all products <ArrowRight size={14} /></Link></div>
      {isLoading ? <LoadingGrid count={5} /> : isError ? <ErrorState onRetry={() => void refetch()} /> : <ProductGrid products={data?.products.slice(0, 10) ?? []} />}
    </section>
    <section>
      <div className="section-head"><div><h2>Good food, good mood</h2><p>Fresh picks to make the everyday a little brighter</p></div></div>
      <div className="category-grid">
        {categories.filter(c => ["fruits-vegetables", "dairy-bread-eggs", "snacks-munchies"].includes(c.slug)).map(c => <Link key={c.id} className="category-card" to={`/shop?category=${c.slug}`}><img loading="lazy" src={c.image} alt="" /><span>Explore {c.name}</span></Link>)}
      </div>
    </section>
  </>;
}

function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) return <div className="empty-state"><ShoppingBag color="#176b45" /><h2>No products found</h2><p>Try a different search or browse all of our fresh picks.</p><Link className="button-secondary" to="/shop">Browse all products</Link></div>;
  return <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>;
}

function ProductCard({ product }: { product: Product }) {
  const line = useCart(s => s.lines[product.id]);
  const add = useCart(s => s.add);
  const decrement = useCart(s => s.decrement);
  const available = product.inventory?.quantity ?? product.available ?? 0;
  const cartProduct = { ...product, available };
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = openFoodFactsProductUrl(product.image);
  return <article className="product-card">
    <div className="product-image">
      <Link to={`/product/${product.slug}`} className="product-image-link">
        <img loading="lazy" src={imageFailed ? "/product-fallback.svg" : product.image} onError={() => setImageFailed(true)} alt={product.name} />
        {pctOff(product.mrpPaise, product.pricePaise) > 0 && <span className="discount-tag">{pctOff(product.mrpPaise, product.pricePaise)}% OFF</span>}
      </Link>
      {imageSource && <a className="image-credit" href={imageSource} target="_blank" rel="noreferrer">Open Food Facts</a>}
    </div>
    <div className="product-info">
      <div className="product-brand">{product.brand}</div>
      <Link to={`/product/${product.slug}`} className="product-name">{product.name}</Link>
      <div className="product-unit">{product.unit}</div>
      {product.rating && <div className="product-rating"><Star size={12} fill="currentColor" /> {product.rating.toFixed(1)} <span className="muted">({product.reviewCount})</span></div>}
      <div className="product-price-row">
        <div className="product-price">{currency(product.pricePaise)}{product.mrpPaise > product.pricePaise && <del>{currency(product.mrpPaise)}</del>}</div>
        {available < 1 ? <span className="muted" style={{ fontSize: 11 }}>Sold out</span> : line ? <div className="stepper" aria-label={`${line.quantity} in cart`}><button aria-label="Remove one" onClick={() => decrement(product.id)}><Minus size={14} /></button>{line.quantity}<button aria-label="Add one" onClick={() => add(cartProduct)}><Plus size={14} /></button></div> : <button className="add-button" onClick={() => add(cartProduct)}>ADD</button>}
      </div>
    </div>
  </article>;
}

function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const query = params.get("q") ?? "";
  const brand = params.get("brand") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1"));
  const [maxPrice, setMaxPrice] = useState(1000);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState("popular");
  const categories = useCategories();
  const filterUrl = new URLSearchParams({ sort, limit: "48", page: String(page) });
  if (category) filterUrl.set("category", category);
  if (query) filterUrl.set("q", query);
  if (brand) filterUrl.set("brand", brand);
  filterUrl.set("maxPrice", String(maxPrice));
  if (inStock) filterUrl.set("inStock", "true");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["products", filterUrl.toString()],
    queryFn: () => api<ApiProductPage>(`/products?${filterUrl.toString()}`)
  });
  const products = data?.products ?? [];
  const brands = useMemo(() => Array.from(new Set(products.map(product => product.brand))).sort(), [products]);
  const categoryName = categories.find(c => c.slug === category)?.name;
  return <>
    <h1 className="page-title">{query ? `Results for “${query}”` : categoryName ?? "Shop all essentials"}</h1>
    <p className="page-subtitle">{data?.pagination.total ?? "Fresh picks"} thoughtfully selected for your everyday.</p>
    <div className="catalog-layout">
      <aside className="filter-panel">
        <h3>Refine your basket</h3>
        <div className="filter-group"><strong style={{ fontSize: 12 }}>Category</strong>{categories.map(item => <label key={item.slug}><input type="radio" name="category" checked={category === item.slug} onChange={() => setParams(prev => { const next = new URLSearchParams(prev); next.set("category", item.slug); next.delete("page"); return next; })} />{item.name}</label>)}
          {category && <button className="text-link" onClick={() => setParams(prev => { const next = new URLSearchParams(prev); next.delete("category"); next.delete("page"); return next; })}>Clear category</button>}
        </div>
        <div className="filter-group"><strong style={{ fontSize: 12 }}>Maximum price · ₹{maxPrice}</strong><input aria-label="Maximum price" type="range" min="25" max="1000" step="25" value={maxPrice} onChange={e => { setMaxPrice(Number(e.target.value)); setParams(prev => { const next = new URLSearchParams(prev); next.delete("page"); return next; }); }} /></div>
        <div className="filter-group"><label htmlFor="brand-select"><strong>Brand</strong></label><select id="brand-select" value={brand} onChange={e => setParams(prev => { const next = new URLSearchParams(prev); if (e.target.value) next.set("brand", e.target.value); else next.delete("brand"); next.delete("page"); return next; })}><option value="">All brands</option>{Array.from(new Set([...popularBrands, ...brands])).sort().map(b => <option key={b}>{b}</option>)}</select></div>
        <div className="filter-group"><label><input type="checkbox" checked={inStock} onChange={e => { setInStock(e.target.checked); setParams(prev => { const next = new URLSearchParams(prev); next.delete("page"); return next; }); }} /> In stock only</label></div>
      </aside>
      <section>
        <div className="listing-tools"><span>{isLoading ? "Finding fresh picks..." : `${data?.pagination.total ?? 0} products`}</span><label>Sort by <select aria-label="Sort products" value={sort} onChange={e => { setSort(e.target.value); setParams(prev => { const next = new URLSearchParams(prev); next.delete("page"); return next; }); }}><option value="popular">Popular</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="rating">Top rated</option><option value="discount">Best discount</option></select></label></div>
        {isLoading ? <LoadingGrid count={8} /> : isError ? <ErrorState onRetry={() => void refetch()} /> : <>
          <ProductGrid products={products} />
          {(data?.pagination.pages ?? 0) > 1 && <nav className="catalog-pagination" aria-label="Product pages">
            <button className="button-secondary button-small" disabled={page <= 1} onClick={() => setParams(prev => { const next = new URLSearchParams(prev); next.set("page", String(page - 1)); return next; })}>Previous</button>
            <span>Page {page} of {data?.pagination.pages}</span>
            <button className="button-secondary button-small" disabled={page >= (data?.pagination.pages ?? 1)} onClick={() => setParams(prev => { const next = new URLSearchParams(prev); next.set("page", String(page + 1)); return next; })}>Next</button>
          </nav>}
        </>}
      </section>
    </div>
  </>;
}

function ProductDetail() {
  const { slug = "" } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["product", slug], queryFn: () => api<{ product: Product; related: Product[] }>(`/products/${encodeURIComponent(slug)}`) });
  const add = useCart(s => s.add);
  const navigate = useNavigate();
  if (isLoading) return <LoadingGrid count={1} />;
  if (isError || !data) return <ErrorState />;
  const { product, related } = data;
  const available = product.inventory?.quantity ?? 0;
  const imageSource = openFoodFactsProductUrl(product.image);
  return <>
    <p className="page-subtitle"><Link to="/">Home</Link> / <Link to={`/shop?category=${product.category.slug}`}>{product.category.name}</Link> / {product.name}</p>
    <div className="cart-layout" style={{ marginTop: 25 }}>
      <div className="content-card" style={{ margin: 0 }}>
        <img src={product.image} onError={e => { e.currentTarget.src = "/product-fallback.svg"; }} alt={product.name} style={{ width: "100%", maxHeight: 470, objectFit: "contain", padding: 12, background: "#f5f6f2", borderRadius: 12 }} />
        {imageSource && <p className="image-attribution">Image by Open Food Facts contributors. <a href={imageSource} target="_blank" rel="noreferrer">View source product</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>.</p>}
      </div>
      <div className="content-card" style={{ margin: 0 }}>
        <div className="product-brand">{product.brand}</div><h1 className="page-title" style={{ marginTop: 8 }}>{product.name}</h1>
        <p className="muted">{product.unit} {product.rating && <> · <Star size={13} fill="#b78b20" color="#b78b20" /> {product.rating.toFixed(1)} ({product.reviewCount} ratings)</>}</p>
        <p>{product.description}</p><hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "20px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><strong style={{ fontSize: 23 }}>{currency(product.pricePaise)}</strong><del className="muted">{currency(product.mrpPaise)}</del>{pctOff(product.mrpPaise, product.pricePaise) > 0 && <span className="status-chip">{pctOff(product.mrpPaise, product.pricePaise)}% off</span>}</div>
        <p className="muted" style={{ fontSize: 12 }}>Inclusive of applicable taxes</p>
        {available ? <button className="button-primary" onClick={() => { add({ ...product, available }); navigate("/cart"); }}>Add to basket <ShoppingBag size={16} /></button> : <span className="muted">Currently unavailable</span>}
      </div>
    </div>
    <div className="section-head"><div><h2>More from {product.category.name}</h2></div></div><ProductGrid products={related} />
  </>;
}

function CartPage({ session }: { session?: SessionUser }) {
  const { lines, decrement, add, clear } = useCart();
  const items = Object.values(lines);
  const subtotal = items.reduce((sum, item) => sum + item.product.pricePaise * item.quantity, 0);
  const savings = items.reduce((sum, item) => sum + (item.product.mrpPaise - item.product.pricePaise) * item.quantity, 0);
  const delivery = subtotal === 0 || subtotal >= 49900 ? 0 : 2500;
  const navigate = useNavigate();
  const syncMutation = useMutation({
    mutationFn: () => api("/cart/merge", { method: "PUT", body: JSON.stringify({ items: items.map(item => ({ productId: item.product.id, quantity: item.quantity })) }) }),
    onSuccess: () => navigate("/checkout")
  });
  return <>
    <h1 className="page-title">Your basket</h1><p className="page-subtitle">A little goodness, on its way.</p>
    {!items.length ? <div className="empty-state"><ShoppingCart size={35} color="#176b45" /><h2>Your basket is waiting for something good</h2><p>Find your everyday favourites and add them here.</p><Link className="button-primary" to="/shop">Explore essentials</Link></div> : <div className="cart-layout">
      <div className="content-card" style={{ marginTop: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>{items.length} {items.length === 1 ? "item" : "items"}</strong><button className="text-link" onClick={clear}>Clear basket</button></div>
        {items.map(({ product, quantity }) => <div className="cart-line" key={product.id}>
          <img src={product.image} alt="" /><div><Link to={`/product/${product.slug}`}><h3>{product.name}</h3></Link><small className="muted">{product.unit}</small><div style={{ fontWeight: 700, marginTop: 5 }}>{currency(product.pricePaise)}</div></div>
          <div className="stepper"><button aria-label="Decrease quantity" onClick={() => decrement(product.id)}><Minus size={14} /></button>{quantity}<button aria-label="Increase quantity" onClick={() => add(product)}><Plus size={14} /></button></div>
        </div>)}
        <Link className="text-link" to="/shop" style={{ display: "inline-block", marginTop: 18 }}>← Keep exploring</Link>
      </div>
      <aside className="content-card cart-summary" style={{ marginTop: 0 }}>
        <h2 style={{ font: "700 18px Manrope", marginTop: 0 }}>Bill details</h2>
        <BillRow label="Item total" amount={subtotal} /><BillRow label="Savings" amount={-savings} green />
        <BillRow label="Delivery fee" amount={delivery} detail={delivery === 0 ? "Free over ₹499" : undefined} /><BillRow label="Platform fee" amount={500} />
        <BillRow label="Total payable" amount={subtotal + delivery + 500} total />
        {!session && <p className="muted" style={{ fontSize: 12 }}>Sign in at checkout to confirm your delivery address and place your order.</p>}
        {syncMutation.isError && <p className="error-text">{syncMutation.error.message}</p>}
        <button className="button-primary" style={{ width: "100%", marginTop: 12 }} disabled={syncMutation.isPending} onClick={() => {
          if (!session) navigate("/signin", { state: { returnTo: "/cart" } });
          else syncMutation.mutate();
        }}>{syncMutation.isPending ? "Preparing checkout..." : "Continue to checkout"} <ArrowRight size={16} /></button>
      </aside>
    </div>}
  </>;
}

function BillRow({ label, amount, detail, green, total }: { label: string; amount: number; detail?: string; green?: boolean; total?: boolean }) {
  return <div className={`bill-row${total ? " bill-total" : ""}`}><span>{label}{detail && <small className="muted"> · {detail}</small>}</span><span style={green ? { color: "#27743f" } : undefined}>{amount < 0 ? `−${currency(Math.abs(amount))}` : currency(amount)}</span></div>;
}

const authSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").optional(),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number").optional(),
  password: z.string().min(10, "Use at least 10 characters")
});
type AuthValues = z.infer<typeof authSchema>;
function SignInPage() {
  const [register, setRegister] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const formSchema = register ? authSchema.extend({ name: z.string().trim().min(2, "Enter your name"), phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian phone number") }) : authSchema;
  const form = useForm<AuthValues>({ resolver: zodResolver(formSchema), defaultValues: { email: "", password: "" }, shouldUnregister: true });
  const mutation = useMutation({
    mutationFn: (values: AuthValues) => api<{ user: SessionUser }>(register ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      if (user.role === "CUSTOMER") {
        const guest = Object.values(useCart.getState().lines);
        await api("/cart/merge", { method: "PUT", body: JSON.stringify({ items: guest.map(item => ({ productId: item.product.id, quantity: item.quantity })) }) });
      }
      const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
      navigate(returnTo ?? (user.role === "ADMIN" ? "/admin" : user.role === "DELIVERY" ? "/delivery" : "/account"));
    }
  });
  return <div style={{ maxWidth: 520, margin: "45px auto" }}>
    <div className="content-card">
      <div className="eyebrow">Welcome to QUICKORA</div><h1 className="page-title" style={{ marginTop: 7 }}>{register ? "Create your account" : "Good to see you again"}</h1>
      <p className="muted">{register ? "A few details and your fresh picks are a step away." : "Sign in to check out, track orders and save your address."}</p>
      <form onSubmit={form.handleSubmit(values => mutation.mutate(values))} noValidate>
        {register && <FormField label="Your name" error={form.formState.errors.name?.message}><input autoComplete="name" {...form.register("name")} /></FormField>}
        <FormField label="Email address" error={form.formState.errors.email?.message}><input type="email" autoComplete="email" {...form.register("email")} /></FormField>
        {register && <FormField label="Mobile number" error={form.formState.errors.phone?.message}><input type="tel" inputMode="numeric" autoComplete="tel" {...form.register("phone")} /></FormField>}
        <FormField label="Password" error={form.formState.errors.password?.message}><input type="password" autoComplete={register ? "new-password" : "current-password"} {...form.register("password")} /></FormField>
        {mutation.isError && <p className="error-text" role="alert">{mutation.error.message}</p>}
        <button className="button-primary" style={{ width: "100%", marginTop: 8 }} disabled={mutation.isPending}>{mutation.isPending ? "Please wait..." : register ? "Create account" : "Sign in"}</button>
      </form>
      <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>{register ? "Already have an account?" : "New to QUICKORA?"} <button className="text-link" onClick={() => { setRegister(!register); mutation.reset(); form.clearErrors(); }}>{register ? "Sign in" : "Create an account"}</button></p>
      <div className="success-note" style={{ marginTop: 18, fontSize: 12 }}><ShieldCheck size={15} /> Demo accounts are listed in the project README. This development build uses secure HTTP-only session cookies.</div>
    </div>
  </div>;
}

function CheckoutPage({ session }: { session?: SessionUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { lines, clear } = useCart();
  const [selectedAddress, setSelectedAddress] = useState("");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [payment, setPayment] = useState<"COD" | "DEMO">("COD");
  const [addressForm, setAddressForm] = useState(false);
  const addressSchema = z.object({
    fullName: z.string().trim().min(2), phone: z.string().regex(/^[6-9]\d{9}$/),
    house: z.string().trim().min(1), street: z.string().trim().min(2), landmark: z.string().optional(),
    locality: z.string().trim().min(2), city: z.string().trim().min(2), state: z.string().trim().min(2),
    pinCode: z.string().regex(/^[1-9]\d{5}$/), type: z.enum(["Home", "Work", "Other"]), isDefault: z.boolean()
  });
  const addressFormHook = useForm<z.infer<typeof addressSchema>>({ resolver: zodResolver(addressSchema), defaultValues: { fullName: session?.name ?? "", phone: session?.phone ?? "", house: "", street: "", landmark: "", locality: "", city: "Chennai", state: "Tamil Nadu", pinCode: "", type: "Home", isDefault: true } });
  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api<Address[]>("/users/me/addresses"),
    enabled: !!session
  });
  useEffect(() => {
    if (!selectedAddress && addresses.length) setSelectedAddress(addresses.find(a => a.isDefault)?.id ?? addresses[0].id);
  }, [addresses, selectedAddress]);
  const { data: quote, refetch: refreshQuote } = useQuery({
    queryKey: ["quote", appliedCoupon],
    queryFn: () => api<{ subtotalPaise: number; discountPaise: number; deliveryFeePaise: number; platformFeePaise: number; totalPaise: number }>("/checkout/quote", { method: "POST", body: JSON.stringify({ couponCode: appliedCoupon || undefined }) }),
    enabled: !!session && Object.keys(lines).length > 0,
    retry: false
  });
  const saveAddress = useMutation({
    mutationFn: (value: z.infer<typeof addressSchema>) => api<Address>("/users/me/addresses", { method: "POST", body: JSON.stringify(value) }),
    onSuccess: address => { setSelectedAddress(address.id); setAddressForm(false); void queryClient.invalidateQueries({ queryKey: ["addresses"] }); }
  });
  const orderMutation = useMutation({
    mutationFn: async () => {
      await api("/cart/merge", { method: "PUT", body: JSON.stringify({ items: Object.values(lines).map(item => ({ productId: item.product.id, quantity: item.quantity })) }) });
      return api<Order>("/orders", { method: "POST", body: JSON.stringify({ addressId: selectedAddress, couponCode: appliedCoupon || undefined, paymentMethod: payment }) });
    },
    onSuccess: async order => {
      clear();
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
      navigate(`/orders/${order.id}`);
    }
  });
  const applyCoupon = async () => {
    try {
      await api("/coupons/validate", { method: "POST", body: JSON.stringify({ code: coupon }) });
      setAppliedCoupon(coupon.trim().toUpperCase());
      setCoupon("");
      window.setTimeout(() => void refreshQuote(), 0);
    } catch (e) { window.alert(e instanceof Error ? e.message : "Coupon couldn’t be applied."); }
  };
  if (!session) return <RequireSignIn />;
  if (Object.keys(lines).length === 0) return <div className="page-center"><div><ShoppingBag size={38} color="#176b45" /><h2>Your basket is empty</h2><Link className="button-primary" to="/shop">Shop now</Link></div></div>;
  return <>
    <h1 className="page-title">Checkout</h1><p className="page-subtitle">A few final details before your QUICKORA arrives.</p>
    <div className="cart-layout">
      <div>
        <div className="content-card">
          <h2 style={{ font: "700 17px Manrope", marginTop: 0 }}>1. Delivery address</h2>
          {addressesLoading ? <p className="muted">Loading saved addresses…</p> : addresses.length === 0 && !addressForm ? <div className="empty-state"><MapPin color="#176b45" /><h2>No saved delivery address</h2><p>Add a Chennai delivery address to check serviceability.</p><button className="button-primary" onClick={() => setAddressForm(true)}>Add address</button></div> : addresses.map(address => <label className={`address-option${selectedAddress === address.id ? " selected" : ""}`} key={address.id}>
            <input type="radio" name="address" checked={selectedAddress === address.id} onChange={() => setSelectedAddress(address.id)} />
            <span><strong>{address.type} · {address.fullName}</strong><br /><small className="muted">{address.house}, {address.street}, {address.locality}, {address.city} {address.pinCode}</small><br /><small className="muted">+91 {address.phone}</small></span>
          </label>)}
          {addresses.length > 0 && !addressForm && <button className="button-secondary button-small" onClick={() => setAddressForm(true)}>+ Add another address</button>}
          {addressForm && <form onSubmit={addressFormHook.handleSubmit(v => saveAddress.mutate(v))}>
            <div className="form-grid">
              <FormField label="Full name"><input {...addressFormHook.register("fullName")} /></FormField>
              <FormField label="Mobile number"><input inputMode="numeric" {...addressFormHook.register("phone")} /></FormField>
              <FormField label="House / building"><input {...addressFormHook.register("house")} /></FormField>
              <FormField label="Street"><input {...addressFormHook.register("street")} /></FormField>
              <FormField label="Landmark (optional)"><input {...addressFormHook.register("landmark")} /></FormField>
              <FormField label="Locality"><input {...addressFormHook.register("locality")} /></FormField>
              <FormField label="City"><input {...addressFormHook.register("city")} /></FormField>
              <FormField label="State"><input {...addressFormHook.register("state")} /></FormField>
              <FormField label="PIN code"><input inputMode="numeric" maxLength={6} {...addressFormHook.register("pinCode")} /></FormField>
              <FormField label="Address type"><select {...addressFormHook.register("type")}><option>Home</option><option>Work</option><option>Other</option></select></FormField>
            </div>
            <label className="muted" style={{ fontSize: 12 }}><input type="checkbox" {...addressFormHook.register("isDefault")} /> Save as default address</label>
            {saveAddress.isError && <p className="error-text">{saveAddress.error.message}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="button-primary" disabled={saveAddress.isPending}>Save address</button><button type="button" className="button-secondary" onClick={() => setAddressForm(false)}>Cancel</button></div>
          </form>}
        </div>
        <div className="content-card">
          <h2 style={{ font: "700 17px Manrope", marginTop: 0 }}>2. Review & offers</h2>
          {Object.values(lines).map(({ product, quantity }) => <div className="cart-line" key={product.id}><img src={product.image} alt="" /><div><h3>{product.name}</h3><small className="muted">{product.unit} · Qty {quantity}</small></div><strong>{currency(product.pricePaise * quantity)}</strong></div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}><input aria-label="Coupon code" value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} placeholder="Enter coupon code" style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 9, padding: 11 }} /><button className="button-secondary" onClick={() => void applyCoupon()} disabled={!coupon}>Apply</button></div>
          {appliedCoupon && <p className="success-note"><Check size={15} /> {appliedCoupon} applied · <button className="text-link" onClick={() => { setAppliedCoupon(""); }}>Remove</button></p>}
          {quote?.discountPaise ? <p className="muted" style={{ fontSize: 12 }}>You’re saving {currency(quote.discountPaise)} with this coupon.</p> : null}
        </div>
        <div className="content-card">
          <h2 style={{ font: "700 17px Manrope", marginTop: 0 }}>3. Payment method</h2>
          <label className={`address-option${payment === "COD" ? " selected" : ""}`}><input type="radio" checked={payment === "COD"} onChange={() => setPayment("COD")} /><span><strong>Cash on delivery</strong><br /><small className="muted">Pay when your order reaches you</small></span></label>
          <label className={`address-option${payment === "DEMO" ? " selected" : ""}`}><input type="radio" checked={payment === "DEMO"} onChange={() => setPayment("DEMO")} /><span><strong>Demo payment</strong><br /><small className="muted">Sandbox checkout only; no real payment is processed</small></span></label>
        </div>
      </div>
      <aside className="content-card cart-summary">
        <h2 style={{ font: "700 18px Manrope", marginTop: 0 }}>Order total</h2>
        {quote ? <><BillRow label="Item total" amount={quote.subtotalPaise} /><BillRow label="Discount" amount={-quote.discountPaise} green /><BillRow label="Delivery fee" amount={quote.deliveryFeePaise} /><BillRow label="Platform fee" amount={quote.platformFeePaise} /><BillRow label="To pay" amount={quote.totalPaise} total /></> : <p className="muted">Confirming live prices and availability…</p>}
        <p className="muted" style={{ fontSize: 12 }}><Clock3 size={14} /> Estimated delivery: 25–40 minutes</p>
        {orderMutation.isError && <p className="error-text" role="alert">{orderMutation.error.message}</p>}
        <button className="button-primary" style={{ width: "100%" }} disabled={!selectedAddress || orderMutation.isPending || !quote} onClick={() => orderMutation.mutate()}>{orderMutation.isPending ? "Placing order..." : "Place order"} <ArrowRight size={16} /></button>
        <p className="muted" style={{ fontSize: 11, textAlign: "center" }}><ShieldCheck size={13} /> Final prices and stock are checked securely at checkout.</p>
      </aside>
    </div>
  </>;
}

function RequireSignIn() {
  const location = useLocation();
  return <div className="page-center"><div><UserRound size={38} color="#176b45" /><h2>Sign in to continue</h2><p className="muted">Your basket will be here when you return.</p><Link to="/signin" state={{ returnTo: location.pathname }} className="button-primary">Sign in</Link></div></div>;
}

function OrdersPage({ session }: { session?: SessionUser }) {
  const { data: orders, isLoading, isError, refetch } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/orders"), enabled: !!session });
  if (!session) return <RequireSignIn />;
  return <>
    <h1 className="page-title">Your orders</h1><p className="page-subtitle">Every good delivery, all in one place.</p>
    {isLoading ? <LoadingGrid count={2} /> : isError ? <ErrorState onRetry={() => void refetch()} /> : !orders?.length ? <div className="empty-state"><PackageCheck color="#176b45" /><h2>Your first order is just around the corner</h2><p>Explore fresh picks and everyday favourites.</p><Link to="/shop" className="button-primary">Start shopping</Link></div> :
      <div className="content-card">{orders.map(order => <Link key={order.id} to={`/orders/${order.id}`} className="cart-line" style={{ color: "inherit" }}>
        <PackageCheck color="#176b45" /><div><h3>{order.orderNumber}</h3><small className="muted">{new Date(order.createdAt).toLocaleString("en-IN")} · {order.items.length} items</small></div><div style={{ textAlign: "right" }}><strong>{currency(order.totalPaise)}</strong><br /><span className="status-chip">{order.status.replaceAll("_", " ")}</span></div>
      </Link>)}</div>}
  </>;
}

function OrderDetail({ session }: { session?: SessionUser }) {
  const { id = "" } = useParams();
  const { data: order, isLoading, isError } = useQuery({ queryKey: ["order", id], queryFn: () => api<Order>(`/orders/${id}`), enabled: !!session, refetchInterval: 15_000 });
  if (!session) return <RequireSignIn />;
  if (isLoading) return <LoadingGrid count={2} />;
  if (isError || !order) return <ErrorState />;
  const steps = ["CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED"];
  const stepIndex = steps.indexOf(order.status);
  return <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 25 }}><div><div className="eyebrow">Order confirmed</div><h1 className="page-title" style={{ marginTop: 7 }}>{order.orderNumber}</h1></div><span className="status-chip">{order.status.replaceAll("_", " ")}</span></div>
    <div className="cart-layout">
      <div className="content-card">
        <h2 style={{ font: "700 17px Manrope", marginTop: 0 }}>Your delivery journey</h2><p className="muted"><Clock3 size={15} /> Estimated arrival {new Date(order.estimatedDelivery).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · estimate only</p>
        {order.status === "CANCELLED" ? <p className="error-text">This order was cancelled.</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, margin: "30px 0" }}>{steps.map((step, i) => <div key={step} style={{ borderTop: `3px solid ${i <= stepIndex ? "#176b45" : "#e4e9e2"}`, paddingTop: 9, fontSize: 10, color: i <= stepIndex ? "#176b45" : "#69746d" }}>{step.replaceAll("_", " ")}</div>)}</div>}
        {order.items.map(item => <div key={item.id} className="cart-line"><img src={item.image} alt="" /><div><h3>{item.productName}</h3><small className="muted">{item.unit} · Qty {item.quantity}</small></div><strong>{currency(item.unitPricePaise * item.quantity)}</strong></div>)}
      </div>
      <aside className="content-card"><h2 style={{ font: "700 17px Manrope", marginTop: 0 }}>Delivery & payment</h2><p>{order.addressSnapshot.fullName}<br />{order.addressSnapshot.house}, {order.addressSnapshot.street}<br />{order.addressSnapshot.locality}, {order.addressSnapshot.city} {order.addressSnapshot.pinCode}</p><p className="muted">{order.paymentMethod === "DEMO" ? "Demo payment — no payment processed" : "Cash on delivery"} · {order.paymentStatus}</p><div className="bill-row bill-total"><span>Total</span><span>{currency(order.totalPaise)}</span></div></aside>
    </div>
  </>;
}

function AccountPage({ session }: { session?: SessionUser }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => api<Order[]>("/orders"), enabled: !!session });
  const { data: addresses = [] } = useQuery({ queryKey: ["addresses"], queryFn: () => api<Address[]>("/users/me/addresses"), enabled: !!session });
  const logout = useMutation({ mutationFn: () => api("/auth/logout", { method: "POST" }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["session"] }); navigate("/"); } });
  if (!session) return <RequireSignIn />;
  return <>
    <h1 className="page-title">Hello, {session.name.split(" ")[0]}</h1><p className="page-subtitle">Your QUICKORA account, all in one place.</p>
    <div className="metric-grid"><div className="metric"><span>Orders placed</span><strong>{orders.length}</strong></div><div className="metric"><span>Saved addresses</span><strong>{addresses.length}</strong></div><div className="metric"><span>Account role</span><strong style={{ fontSize: 17 }}>{session.role}</strong></div><div className="metric"><span>Member since</span><strong style={{ fontSize: 17 }}>QUICKORA</strong></div></div>
    <div className="content-card"><h2 style={{ font: "700 18px Manrope" }}>Account details</h2><p><strong>{session.name}</strong><br /><span className="muted">{session.email} · +91 {session.phone}</span></p><button className="button-secondary" onClick={() => logout.mutate()}>Sign out</button></div>
    <div className="content-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Saved addresses</h2></div><Link to="/checkout" className="text-link">Manage at checkout</Link></div>{addresses.length ? addresses.map(a => <div className="address-option" key={a.id}><MapPin size={16} /><span><strong>{a.type} · {a.fullName}</strong><br /><small className="muted">{a.house}, {a.street}, {a.locality}, {a.city} {a.pinCode}</small></span></div>) : <p className="muted">Save a delivery address during checkout.</p>}</div>
    <div className="content-card"><div className="section-head" style={{ marginTop: 0 }}><div><h2>Recent orders</h2></div><Link to="/orders" className="text-link">See all orders</Link></div>{orders.slice(0, 3).map(order => <Link key={order.id} to={`/orders/${order.id}`} className="cart-line"><PackageCheck color="#176b45" /><div><h3>{order.orderNumber}</h3><small className="muted">{new Date(order.createdAt).toLocaleDateString("en-IN")}</small></div><strong>{currency(order.totalPaise)}</strong></Link>)}</div>
  </>;
}

function AdminPage({ session }: { session?: SessionUser }) {
  const location = useLocation();
  const page = location.pathname.split("/")[2] || "overview";
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-analytics"], queryFn: () => api<{
    totalOrders: number; revenuePaise: number; averageOrderValuePaise: number; customers: number;
    activeProducts: number; lowStock: number; pendingOrders: number; cancellationRate: number;
    salesTrend: Array<{ date: string; day: string; revenuePaise: number; orders: number }>;
    orderStatuses: Array<{ status: string; count: number }>;
    categoryPerformance: Array<{ category: string; revenuePaise: number }>;
  }>("/admin/analytics"), enabled: session?.role === "ADMIN" });
  if (!session) return <RequireSignIn />;
  if (session.role !== "ADMIN") return <div className="empty-state"><ShieldCheck color="#176b45" /><h2>Administrator access required</h2><p>Your account does not have access to operational tools.</p><Link to="/" className="button-primary">Back to QUICKORA</Link></div>;
  const links = [["overview", "Overview"], ["products", "Products"], ["inventory", "Inventory"], ["orders", "Orders"], ["customers", "Customers"], ["coupons", "Coupons"]];
  return <div className="admin-layout" style={{ marginTop: 28 }}>
    <nav className="admin-nav"><div style={{ font: "700 18px Manrope", padding: "8px 10px 14px" }}>QUICKORA <small style={{ display: "block", color: "#b9d1c1", fontSize: 10 }}>OPERATIONS</small></div>{links.map(([path, label]) => <NavLink key={path} to={`/admin/${path}`} className={({ isActive }) => (isActive || page === path ? "active" : "")}>{label}</NavLink>)}<Link to="/" style={{ marginTop: 10 }}>← Storefront</Link></nav>
    <div style={{ minWidth: 0 }}>
      <div className="section-head" style={{ marginTop: 0 }}><div><div className="eyebrow">QUICKORA operations</div><h1 className="page-title" style={{ margin: "5px 0" }}>{page.charAt(0).toUpperCase() + page.slice(1)}</h1><p className="muted">Live information from your application database.</p></div><span className="status-chip">Admin access</span></div>
      {page === "overview" && <>{isError ? <ErrorState /> : isLoading ? <LoadingGrid count={4} /> : <><div className="metric-grid">
        <Metric label="Orders" value={String(data?.totalOrders ?? 0)} icon={<ShoppingBag />} /><Metric label="Revenue" value={currency(data?.revenuePaise ?? 0)} icon={<BadgePercent />} /><Metric label="Customers" value={String(data?.customers ?? 0)} icon={<UserRound />} /><Metric label="Active products" value={String(data?.activeProducts ?? 0)} icon={<PackageCheck />} /><Metric label="Average order" value={currency(data?.averageOrderValuePaise ?? 0)} icon={<Heart />} /><Metric label="Low stock" value={String(data?.lowStock ?? 0)} icon={<Sparkles />} /><Metric label="Pending orders" value={String(data?.pendingOrders ?? 0)} icon={<Clock3 />} /><Metric label="Cancellation rate" value={`${data?.cancellationRate ?? 0}%`} icon={<X />} />
      </div>
      {data?.totalOrders ? <Suspense fallback={<p className="muted" role="status">Loading charts...</p>}><DashboardCharts salesTrend={data.salesTrend} categoryPerformance={data.categoryPerformance} orderStatuses={data.orderStatuses} /></Suspense> : <div className="empty-state"><PackageCheck color="#176b45" /><h2>No order history to chart yet</h2><p>Sales and order visualizations will populate from persisted orders.</p></div>}</>}</>}
      {page === "products" && <AdminProducts />}
      {page === "inventory" && <AdminInventory />}
      {page === "orders" && <AdminOrders />}
      {page === "customers" && <AdminCustomers />}
      {page === "coupons" && <AdminCoupons />}
    </div>
  </div>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="metric"><span style={{ display: "flex", justifyContent: "space-between" }}>{label}<span style={{ color: "#176b45" }}>{icon}</span></span><strong>{value}</strong></div>;
}

function AdminProducts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-products", search], queryFn: () => api<{ products: Product[]; total: number }>(`/admin/products?q=${encodeURIComponent(search)}`) });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", brand: "", categoryId: "", price: "", mrp: "", unit: "", sku: "", image: "", quantity: "20" });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/categories")
  });
  const create = useMutation({
    mutationFn: () => api("/admin/products", { method: "POST", body: JSON.stringify({ ...form, pricePaise: Number(form.price) * 100, mrpPaise: Number(form.mrp) * 100, quantity: Number(form.quantity), active: true }) }),
    onSuccess: async () => { setFormOpen(false); setForm({ name: "", description: "", brand: "", categoryId: "", price: "", mrp: "", unit: "", sku: "", image: "", quantity: "20" }); await queryClient.invalidateQueries({ queryKey: ["admin-products"] }); }
  });
  const toggle = useMutation({ mutationFn: (p: Product) => api(`/admin/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-products"] }) });
  return <div className="content-card">
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}><input placeholder="Search product or SKU" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 9, padding: 10 }} /><button className="button-primary button-small" onClick={() => setFormOpen(!formOpen)}>{formOpen ? "Close" : "+ New product"}</button></div>
    {formOpen && <form className="form-grid" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      {([["name", "Product name"], ["description", "Description"], ["brand", "Brand"], ["price", "Selling price (₹)"], ["mrp", "MRP (₹)"], ["unit", "Package size"], ["sku", "SKU"], ["image", "Image URL"], ["quantity", "Opening stock"]] as const).map(([key, label]) => <FormField label={label} key={key}><input required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></FormField>)}
      <FormField label="Category"><select required value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">Choose category</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></FormField>
      <div><button className="button-primary" disabled={create.isPending}>Create product</button>{create.isError && <p className="error-text">{create.error.message}</p>}</div>
    </form>}
    {isError ? <ErrorState /> : isLoading ? <p>Loading products…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>State</th><th>Action</th></tr></thead><tbody>{data?.products.map(p => <tr key={p.id}><td>{p.name}<br /><small className="muted">{p.brand}</small></td><td>{p.sku}</td><td>{currency(p.pricePaise)}</td><td>{p.inventory?.quantity ?? 0}</td><td>{p.active ? "Active" : "Hidden"}</td><td><button className="button-secondary button-small" onClick={() => toggle.mutate(p)}>{p.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
  </div>;
}

function AdminInventory() {
  const client = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-inventory"], queryFn: () => api<Array<{ id: string; productId: string; quantity: number; lowStockAt: number; product: { name: string; sku: string } }>>("/admin/inventory") });
  const [adjust, setAdjust] = useState<{ id: string; name: string } | null>(null);
  const [delta, setDelta] = useState("10");
  const [reason, setReason] = useState("Scheduled restock");
  const mutation = useMutation({ mutationFn: () => api("/admin/inventory/adjustments", { method: "POST", body: JSON.stringify({ productId: adjust?.id, delta: Number(delta), reason }) }), onSuccess: () => { setAdjust(null); void client.invalidateQueries({ queryKey: ["admin-inventory"] }); void client.invalidateQueries({ queryKey: ["admin-products"] }); } });
  return <div className="content-card">{adjust && <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="form-grid"><FormField label={`Stock adjustment · ${adjust.name}`}><input type="number" required value={delta} onChange={e => setDelta(e.target.value)} /></FormField><FormField label="Reason"><input required value={reason} onChange={e => setReason(e.target.value)} /></FormField><button className="button-primary">Save adjustment</button><button type="button" className="button-secondary" onClick={() => setAdjust(null)}>Cancel</button>{mutation.isError && <p className="error-text">{mutation.error.message}</p>}</form>}
    {isError ? <ErrorState /> : isLoading ? <p>Loading stock…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Available</th><th>Alert at</th><th>Action</th></tr></thead><tbody>{data?.map(row => <tr key={row.id}><td>{row.product.name}</td><td>{row.product.sku}</td><td><span className={row.quantity <= row.lowStockAt ? "error-text" : ""}>{row.quantity}</span></td><td>{row.lowStockAt}</td><td><button className="button-secondary button-small" onClick={() => setAdjust({ id: row.productId, name: row.product.name })}>Adjust stock</button></td></tr>)}</tbody></table></div>}</div>;
}

function AdminOrders() {
  const client = useQueryClient();
  const { data: orders, isLoading, isError } = useQuery({ queryKey: ["admin-orders"], queryFn: () => api<Order[]>("/admin/orders") });
  const { data: partners = [] } = useQuery({ queryKey: ["admin-delivery-partners"], queryFn: () => api<Array<{ id: string; available: boolean; user: { name: string } }>>("/admin/delivery/partners") });
  const [partnerByOrder, setPartnerByOrder] = useState<Record<string, string>>({});
  const mutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-orders"] }) });
  const assign = useMutation({ mutationFn: ({ orderId, partnerId }: { orderId: string; partnerId: string }) => api("/admin/delivery/assignments", { method: "POST", body: JSON.stringify({ orderId, partnerId }) }), onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-orders"] }) });
  return <div className="content-card">{isError ? <ErrorState /> : isLoading ? <p>Loading orders…</p> : !orders?.length ? <div className="empty-state"><h2>No orders yet</h2><p>Customer orders will appear here as soon as checkout is completed.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Status</th><th>Update</th><th>Delivery</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td>{order.orderNumber}<br /><small className="muted">{new Date(order.createdAt).toLocaleDateString("en-IN")}</small></td><td>{(order as Order & { user?: { name: string } }).user?.name ?? "Customer"}</td><td>{currency(order.totalPaise)}</td><td>{order.paymentMethod}<br /><small>{order.paymentStatus}</small></td><td>{order.status.replaceAll("_", " ")}</td><td><select aria-label={`Update ${order.orderNumber}`} value={order.status} disabled={["DELIVERED", "CANCELLED", "FAILED"].includes(order.status)} onChange={e => mutation.mutate({ id: order.id, status: e.target.value })}><option value={order.status}>{order.status}</option>{nextOrderStates[order.status]?.map(s => <option key={s} value={s}>{s}</option>)}</select></td><td>{order.assignment ? order.assignment.partner.user.name : order.status === "READY_FOR_PICKUP" ? <div style={{ display: "flex", gap: 4 }}><select aria-label={`Partner for ${order.orderNumber}`} value={partnerByOrder[order.id] ?? ""} onChange={e => setPartnerByOrder({ ...partnerByOrder, [order.id]: e.target.value })}><option value="">Choose rider</option>{partners.map(p => <option key={p.id} value={p.id}>{p.user.name}{p.available ? "" : " · offline"}</option>)}</select><button className="button-secondary button-small" disabled={!partnerByOrder[order.id]} onClick={() => assign.mutate({ orderId: order.id, partnerId: partnerByOrder[order.id] })}>Assign</button></div> : "—"}</td></tr>)}</tbody></table>{assign.isError && <p className="error-text">{assign.error.message}</p>}</div>}</div>;
}
const nextOrderStates: Record<string, string[]> = { PENDING: ["CONFIRMED", "CANCELLED", "FAILED"], CONFIRMED: ["PREPARING", "CANCELLED", "FAILED"], PREPARING: ["READY_FOR_PICKUP", "CANCELLED"], READY_FOR_PICKUP: ["OUT_FOR_DELIVERY"], OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"] };

function AdminCustomers() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-customers"], queryFn: () => api<Array<{ id: string; name: string; email: string; phone: string; createdAt: string; _count: { orders: number } }>>("/admin/customers") });
  return <div className="content-card">{isError ? <ErrorState /> : isLoading ? <p>Loading customers…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Joined</th></tr></thead><tbody>{data?.map(c => <tr key={c.id}><td>{c.name}<br /><small className="muted">{c.email}</small></td><td>{c.phone}</td><td>{c._count.orders}</td><td>{new Date(c.createdAt).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div>}</div>;
}

function AdminCoupons() {
  const client = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-coupons"], queryFn: () => api<Array<{ id: string; code: string; type: string; value: number; active: boolean; expiresAt: string; usedCount: number }>>("/admin/coupons") });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ code: "", type: "PERCENT", value: "10", minimum: "299", cap: "100", startsAt: new Date().toISOString().slice(0, 16), expiresAt: "2028-12-31T23:59", usageLimit: "100" });
  const create = useMutation({
    mutationFn: () => api("/admin/coupons", { method: "POST", body: JSON.stringify({
      code: form.code, type: form.type, value: form.type === "PERCENT" ? Number(form.value) : Math.round(Number(form.value) * 100),
      minOrderPaise: Math.round(Number(form.minimum) * 100),
      maxDiscount: form.cap ? Math.round(Number(form.cap) * 100) : null,
      startsAt: new Date(form.startsAt).toISOString(), expiresAt: new Date(form.expiresAt).toISOString(),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null, perUserLimit: 1, active: true
    }) }),
    onSuccess: async () => { setFormOpen(false); await client.invalidateQueries({ queryKey: ["admin-coupons"] }); }
  });
  const toggle = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => api(`/admin/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }), onSuccess: () => void client.invalidateQueries({ queryKey: ["admin-coupons"] }) });
  return <div className="content-card">
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 14 }}><h2 style={{ font: "700 18px Manrope", margin: 0 }}>Offers and coupons</h2><button className="button-primary button-small" onClick={() => setFormOpen(!formOpen)}>{formOpen ? "Close" : "+ New coupon"}</button></div>
    {formOpen && <form className="form-grid" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
      <FormField label="Coupon code"><input required minLength={3} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></FormField>
      <FormField label="Discount type"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option></select></FormField>
      <FormField label={form.type === "PERCENT" ? "Discount (%)" : "Discount amount (₹)"}><input type="number" required min="1" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></FormField>
      <FormField label="Minimum order (₹)"><input type="number" required min="0" value={form.minimum} onChange={e => setForm({ ...form, minimum: e.target.value })} /></FormField>
      <FormField label="Maximum discount cap (₹)"><input type="number" min="1" value={form.cap} onChange={e => setForm({ ...form, cap: e.target.value })} /></FormField>
      <FormField label="Usage limit"><input type="number" min="1" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} /></FormField>
      <FormField label="Starts at"><input type="datetime-local" required value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></FormField>
      <FormField label="Expires at"><input type="datetime-local" required value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} /></FormField>
      <div><button className="button-primary" disabled={create.isPending}>Create coupon</button>{create.isError && <p className="error-text">{create.error.message}</p>}</div>
    </form>}
    {isError ? <ErrorState /> : isLoading ? <p>Loading offers…</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Code</th><th>Offer</th><th>Redemptions</th><th>Expires</th><th>State</th><th>Action</th></tr></thead><tbody>{data?.map(c => <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.type === "PERCENT" ? `${c.value}% off` : currency(c.value)}</td><td>{c.usedCount}</td><td>{new Date(c.expiresAt).toLocaleDateString("en-IN")}</td><td>{c.active ? "Active" : "Off"}</td><td><button className="button-secondary button-small" onClick={() => toggle.mutate({ id: c.id, active: !c.active })}>{c.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
  </div>;
}

function DeliveryPage({ session }: { session?: SessionUser }) {
  const client = useQueryClient();
  const { data: tasks, isLoading, isError } = useQuery({
    queryKey: ["delivery-tasks"],
    queryFn: () => api<Array<{ id: string; status: string; order: Order & { user: { name: string; phone: string } } }>>("/delivery/tasks"),
    enabled: session?.role === "DELIVERY",
    refetchInterval: 15_000
  });
  const { data: profile } = useQuery({ queryKey: ["delivery-profile"], queryFn: () => api<{ available: boolean }>("/delivery/profile"), enabled: session?.role === "DELIVERY" });
  const availability = useMutation({ mutationFn: (available: boolean) => api("/delivery/availability", { method: "PATCH", body: JSON.stringify({ available }) }), onSuccess: () => void client.invalidateQueries({ queryKey: ["delivery-profile"] }) });
  const action = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => status === "ACCEPTED"
      ? api(`/delivery/tasks/${id}/accept`, { method: "POST" })
      : status === "REJECTED"
        ? api(`/delivery/tasks/${id}/reject`, { method: "POST" })
        : api(`/delivery/tasks/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["delivery-tasks"] })
  });
  if (!session) return <RequireSignIn />;
  if (session.role !== "DELIVERY") return <div className="empty-state"><Truck color="#176b45" /><h2>Delivery partner access</h2><p>Sign in with a delivery partner account to manage assigned deliveries.</p><Link className="button-primary" to="/signin">Sign in</Link></div>;
  return <>
    <div className="section-head" style={{ marginTop: 28 }}><div><div className="eyebrow">QUICKORA delivery</div><h1 className="page-title" style={{ marginTop: 5 }}>Your delivery desk</h1><p>Good service starts with a clear next step.</p></div><button className={profile?.available ? "button-secondary" : "button-primary"} onClick={() => availability.mutate(!profile?.available)}>{profile?.available ? "Available · Go offline" : "Offline · Go available"}</button></div>
    <div className="metric-grid"><div className="metric"><span>Assigned tasks</span><strong>{tasks?.filter(t => !["DELIVERED", "REJECTED"].includes(t.status)).length ?? 0}</strong></div><div className="metric"><span>Completed deliveries</span><strong>{tasks?.filter(t => t.status === "DELIVERED").length ?? 0}</strong></div><div className="metric"><span>Demo earnings estimate</span><strong>{currency((tasks?.filter(t => t.status === "DELIVERED").length ?? 0) * 3000)}</strong></div><div className="metric"><span>Earnings rule</span><strong style={{ fontSize: 15 }}>₹30 / delivery</strong></div></div>
    <div className="content-card"><h2 style={{ font: "700 18px Manrope" }}>Assigned deliveries & history</h2><p className="muted" style={{ fontSize: 12 }}>Earnings are a demo estimate at ₹30 per completed delivery, not a payout record.</p>{isLoading ? <p>Checking for tasks…</p> : isError ? <ErrorState /> : !tasks?.length ? <div className="empty-state"><PackageCheck color="#176b45" /><h2>No deliveries assigned</h2><p>When an order is assigned to your account, it will show up here.</p></div> : tasks.map(task => <div className="content-card" key={task.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><span className="status-chip">{task.status}</span><h3>{task.order.orderNumber}</h3><p className="muted">Customer: {task.order.user.name} · <a href={`tel:${task.order.user.phone}`}>{task.order.user.phone}</a></p></div><strong>{currency(task.order.totalPaise)}</strong></div><p>{task.order.items.map(item => `${item.productName} × ${item.quantity}`).join(" · ")}</p><p className="muted">{task.order.addressSnapshot.house}, {task.order.addressSnapshot.street}, {task.order.addressSnapshot.locality}, {task.order.addressSnapshot.city} {task.order.addressSnapshot.pinCode}</p>{task.status === "ASSIGNED" && <div style={{ display: "flex", gap: 8 }}><button className="button-primary" onClick={() => action.mutate({ id: task.id, status: "ACCEPTED" })}>Accept delivery</button><button className="button-secondary" onClick={() => action.mutate({ id: task.id, status: "REJECTED" })}>Reject</button></div>}{task.status === "ACCEPTED" && <button className="button-primary" onClick={() => action.mutate({ id: task.id, status: "PICKED_UP" })}>Mark picked up</button>}{task.status === "PICKED_UP" && <button className="button-primary" onClick={() => action.mutate({ id: task.id, status: "OUT_FOR_DELIVERY" })}>Start delivery</button>}{task.status === "OUT_FOR_DELIVERY" && <button className="button-primary" onClick={() => action.mutate({ id: task.id, status: "DELIVERED" })}>Mark delivered</button>}</div>)}</div>
  </>;
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{error && <span className="error-text">{error}</span>}</div>;
}
function LoadingGrid({ count }: { count: number }) {
  return <div className="product-grid">{Array.from({ length: count }, (_, i) => <div key={i} className="product-card" aria-label="Loading product"><div className="product-image" style={{ background: "linear-gradient(100deg,#f1f3ef 20%,#e7ebe5 40%,#f1f3ef 60%)" }} /><div className="product-info"><div style={{ height: 11, width: "50%", background: "#edf0eb", borderRadius: 5 }} /><div style={{ height: 14, width: "80%", background: "#edf0eb", borderRadius: 5, marginTop: 10 }} /><div style={{ height: 12, width: "35%", background: "#edf0eb", borderRadius: 5, marginTop: 12 }} /></div></div>)}</div>;
}
function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return <div className="empty-state"><Sparkles color="#176b45" /><h2>We couldn’t load that just now</h2><p>Check your connection and try again. Your basket is safely stored on this device.</p>{onRetry && <button className="button-secondary" onClick={onRetry}>Try again</button>}</div>;
}
function NotFound() {
  return <div className="page-center"><div><h1 className="page-title">This page took a wrong turn</h1><p className="muted">Let’s get you back to the good stuff.</p><Link className="button-primary" to="/">Back to home</Link></div></div>;
}
function Footer() {
  return <footer className="footer"><div className="container footer-grid">
    <div><Brand /><p>Thoughtful everyday shopping, delivered around Chennai. Fresh picks and everyday essentials at your pace.</p><small className="muted">Delivery windows are estimates and may vary with availability and demand.</small></div>
    <div><h4>Discover</h4><Link to="/shop">Shop all</Link><Link to="/shop?category=fruits-vegetables">Fresh produce</Link><Link to="/shop?category=dairy-bread-eggs">Dairy & eggs</Link></div>
    <div><h4>Your QUICKORA</h4><Link to="/account">My account</Link><Link to="/orders">Order history</Link><Link to="/cart">Your basket</Link></div>
    <div><h4>Help & information</h4><a href="mailto:hello@quickora.local">hello@quickora.local</a><p>Chennai, Tamil Nadu, India</p><small className="muted">© 2026 QUICKORA. Demo platform.</small></div>
  </div></footer>;
}
function MobileNav({ session }: { session?: SessionUser }) {
  const count = Object.values(useCart(s => s.lines)).reduce((n, i) => n + i.quantity, 0);
  return <nav className="mobile-nav" aria-label="Mobile navigation">
    <NavLink to="/"><Home size={18} />Home</NavLink><NavLink to="/shop"><Search size={18} />Shop</NavLink><NavLink to="/cart"><ShoppingCart size={18} />Basket {count > 0 ? `(${count})` : ""}</NavLink><NavLink to={session ? "/account" : "/signin"}><UserRound size={18} />Account</NavLink>
  </nav>;
}
