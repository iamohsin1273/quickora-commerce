import "dotenv/config";
import { OrderStatus, PaymentMethod, PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be set before seeding QUICKORA.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const categories = [
  ["Fruits and Vegetables", "fruits-vegetables", "photo-1610832958506-aa56368176cf"],
  ["Dairy, Bread and Eggs", "dairy-bread-eggs", "photo-1628088062854-d1870b4553da"],
  ["Snacks and Munchies", "snacks-munchies", "photo-1621939514649-280e2aa11882"],
  ["Cold Drinks and Juices", "cold-drinks-juices", "photo-1544145945-f90425340c7e"],
  ["Breakfast and Instant Food", "breakfast-instant-food", "photo-1517673132405-a56a62b18caf"],
  ["Atta, Rice and Dal", "atta-rice-dal", "photo-1586201375761-83865001e31c"],
  ["Oils and Spices", "oils-spices", "photo-1596040033229-a9821ebd058d"],
  ["Personal Care", "personal-care", "photo-1608248543803-ba4f8c70ae0b"],
  ["Household Essentials", "household-essentials", "photo-1585421514738-01798e348b17"],
  ["Baby Care", "baby-care", "photo-1519689680058-324335c77eba"],
  ["Pet Supplies", "pet-supplies", "photo-1583337130417-3346a1be7dee"],
  ["Ice Cream and Desserts", "ice-cream-desserts", "photo-1563805042-7684c019e1cb"]
] as const;

type ProductSeed = {
  name: string; brand: string; category: number; price: number; mrp: number;
  unit: string; image: string; featured?: boolean; stock?: number; rating?: number;
};
const productSeeds: ProductSeed[] = [
  { name: "Alphonso Mango", brand: "QUICKORA Fresh", category: 0, price: 149, mrp: 199, unit: "2 pcs", image: "photo-1553279768-865429fa0078", featured: true, rating: 4.8 },
  { name: "Robusta Banana", brand: "QUICKORA Fresh", category: 0, price: 42, mrp: 50, unit: "6 pcs", image: "photo-1571771894821-ce9b6c11b08e", rating: 4.6 },
  { name: "Shimla Apple", brand: "Orchard", category: 0, price: 129, mrp: 160, unit: "4 pcs", image: "photo-1560806887-1e4cd0b6cbd6", featured: true, rating: 4.7 },
  { name: "Farm Fresh Tomato", brand: "QUICKORA Fresh", category: 0, price: 34, mrp: 40, unit: "500 g", image: "photo-1546094096-0df4bcaaa337", rating: 4.5 },
  { name: "Crisp Cucumber", brand: "QUICKORA Fresh", category: 0, price: 29, mrp: 35, unit: "500 g", image: "photo-1604977042946-1eecc30f269e" },
  { name: "Green Capsicum", brand: "QUICKORA Fresh", category: 0, price: 39, mrp: 48, unit: "250 g", image: "photo-1563565375-f3fdfdbefa83" },
  { name: "Red Onion", brand: "QUICKORA Fresh", category: 0, price: 36, mrp: 42, unit: "1 kg", image: "photo-1508747703725-719777637510", featured: true },
  { name: "Baby Spinach", brand: "QUICKORA Fresh", category: 0, price: 25, mrp: 30, unit: "200 g", image: "photo-1576045057995-568f588f82fb" },
  { name: "A2 Cow Milk", brand: "Aavin", category: 1, price: 34, mrp: 36, unit: "500 ml", image: "photo-1563636619-e9143da7973b", featured: true, rating: 4.8 },
  { name: "Classic Curd", brand: "Milky Mist", category: 1, price: 45, mrp: 50, unit: "400 g", image: "photo-1488477181946-6428a0291777", rating: 4.6 },
  { name: "Farm White Eggs", brand: "Happy Hens", category: 1, price: 78, mrp: 90, unit: "6 pcs", image: "photo-1518569656558-1f25e69d93d7" },
  { name: "Whole Wheat Bread", brand: "Modern", category: 1, price: 48, mrp: 55, unit: "400 g", image: "photo-1509440159596-0249088772ff", featured: true },
  { name: "Salted Butter", brand: "Amul", category: 1, price: 58, mrp: 62, unit: "100 g", image: "photo-1589985270826-4b7bb135bc9d" },
  { name: "Cheddar Cheese Slices", brand: "Amul", category: 1, price: 125, mrp: 140, unit: "200 g", image: "photo-1486297678162-eb2a19b0a32d" },
  { name: "Classic Salted Chips", brand: "Lay's", category: 2, price: 20, mrp: 20, unit: "52 g", image: "photo-1566478989037-eec170784d0b", featured: true },
  { name: "Masala Makhana", brand: "Farmley", category: 2, price: 99, mrp: 125, unit: "80 g", image: "photo-1599490659213-e2b9527bd087", rating: 4.5 },
  { name: "Roasted Peanuts", brand: "Haldiram's", category: 2, price: 55, mrp: 65, unit: "150 g", image: "photo-1567892737950-30c4db37cd89" },
  { name: "Dark Chocolate Bar", brand: "Amul", category: 2, price: 95, mrp: 110, unit: "150 g", image: "photo-1548907040-4d42faa2a0d5" },
  { name: "Oat Cookies", brand: "Britannia", category: 2, price: 35, mrp: 40, unit: "120 g", image: "photo-1499636136210-6f4ee915583e" },
  { name: "Masala Puffs", brand: "Too Yumm!", category: 2, price: 30, mrp: 35, unit: "70 g", image: "photo-1621447504864-d8686e12698c" },
  { name: "Tender Coconut Water", brand: "Raw Pressery", category: 3, price: 65, mrp: 75, unit: "200 ml", image: "photo-1534353473418-4cfa6c56fd38", featured: true },
  { name: "Orange Juice", brand: "Tropicana", category: 3, price: 110, mrp: 125, unit: "1 L", image: "photo-1600271886742-f049cd451bba" },
  { name: "Sparkling Lime", brand: "Paper Boat", category: 3, price: 45, mrp: 50, unit: "250 ml", image: "photo-1513558161293-cdaf765edfd7" },
  { name: "Cola Drink", brand: "Coca-Cola", category: 3, price: 40, mrp: 45, unit: "750 ml", image: "photo-1554866585-cd94860890b7" },
  { name: "Cold Coffee", brand: "Nescafe", category: 3, price: 35, mrp: 40, unit: "180 ml", image: "photo-1461023058943-07fcbe16d735" },
  { name: "Rolled Oats", brand: "Saffola", category: 4, price: 149, mrp: 175, unit: "1 kg", image: "photo-1517673132405-a56a62b18caf" },
  { name: "Masala Oats", brand: "Saffola", category: 4, price: 20, mrp: 22, unit: "40 g", image: "photo-1574484284002-952d92456975" },
  { name: "Instant Noodles", brand: "Maggi", category: 4, price: 14, mrp: 15, unit: "70 g", image: "photo-1569718212165-3a8278d5f624", featured: true },
  { name: "Poha", brand: "24 Mantra", category: 4, price: 69, mrp: 80, unit: "500 g", image: "photo-1606491956689-2ea866880c84" },
  { name: "Idli Dosa Batter", brand: "ID", category: 4, price: 55, mrp: 60, unit: "1 kg", image: "photo-1589301760014-d929f3979dbc" },
  { name: "Basmati Rice", brand: "India Gate", category: 5, price: 189, mrp: 220, unit: "1 kg", image: "photo-1586201375761-83865001e31c", featured: true },
  { name: "Toor Dal", brand: "Tata Sampann", category: 5, price: 159, mrp: 180, unit: "1 kg", image: "photo-1515543904379-3d757afe72e4" },
  { name: "Whole Wheat Atta", brand: "Aashirvaad", category: 5, price: 255, mrp: 285, unit: "5 kg", image: "photo-1627485937980-221c88ac04f9" },
  { name: "Moong Dal", brand: "Tata Sampann", category: 5, price: 139, mrp: 155, unit: "1 kg", image: "photo-1515543904379-3d757afe72e4" },
  { name: "Sunflower Oil", brand: "Fortune", category: 6, price: 159, mrp: 180, unit: "1 L", image: "photo-1474979266404-7eaacbcd87c5" },
  { name: "Turmeric Powder", brand: "Everest", category: 6, price: 38, mrp: 42, unit: "100 g", image: "photo-1615485500704-8e990f9900f6", featured: true },
  { name: "Garam Masala", brand: "MDH", category: 6, price: 72, mrp: 80, unit: "100 g", image: "photo-1596040033229-a9821ebd058d" },
  { name: "Black Pepper", brand: "Catch", category: 6, price: 48, mrp: 55, unit: "50 g", image: "photo-1599909533730-f9d5b1c5e2b1" },
  { name: "Aloe Vera Face Wash", brand: "Himalaya", category: 7, price: 129, mrp: 150, unit: "100 ml", image: "photo-1608248543803-ba4f8c70ae0b" },
  { name: "Daily Care Shampoo", brand: "Dove", category: 7, price: 189, mrp: 220, unit: "340 ml", image: "photo-1608248543803-ba4f8c70ae0b", featured: true },
  { name: "Neem Toothpaste", brand: "Colgate", category: 7, price: 92, mrp: 105, unit: "150 g", image: "photo-1609840114035-3c981b782dfe" },
  { name: "Hand Wash Refill", brand: "Dettol", category: 7, price: 99, mrp: 115, unit: "750 ml", image: "photo-1584308666744-24d5c474f2ae" },
  { name: "Dishwash Liquid", brand: "Vim", category: 8, price: 105, mrp: 120, unit: "500 ml", image: "photo-1585421514738-01798e348b17" },
  { name: "Laundry Detergent", brand: "Surf Excel", category: 8, price: 235, mrp: 260, unit: "1 kg", image: "photo-1585421514738-01798e348b17", featured: true },
  { name: "Kitchen Towels", brand: "Origami", category: 8, price: 65, mrp: 75, unit: "2 rolls", image: "photo-1584622650111-993a426fbf0a" },
  { name: "Baby Diapers", brand: "Pampers", category: 9, price: 299, mrp: 340, unit: "22 pcs", image: "photo-1519689680058-324335c77eba" },
  { name: "Gentle Baby Wipes", brand: "Himalaya", category: 9, price: 89, mrp: 100, unit: "72 wipes", image: "photo-1519689680058-324335c77eba" },
  { name: "Chicken & Rice Dog Food", brand: "Pedigree", category: 10, price: 249, mrp: 280, unit: "1.2 kg", image: "photo-1583337130417-3346a1be7dee", featured: true },
  { name: "Tuna Cat Food", brand: "Whiskas", category: 10, price: 35, mrp: 40, unit: "80 g", image: "photo-1573865526739-10659fec78a5" },
  { name: "Vanilla Ice Cream", brand: "Amul", category: 11, price: 110, mrp: 125, unit: "500 ml", image: "photo-1563805042-7684c019e1cb", featured: true },
  { name: "Chocolate Brownie", brand: "NIC", category: 11, price: 149, mrp: 170, unit: "2 pcs", image: "photo-1606313564200-e75d5e30476c" },
  { name: "Taaza Toned Milk", brand: "Amul", category: 1, price: 29, mrp: 30, unit: "500 ml", image: "photo-1563636619-e9143da7973b", featured: true, rating: 4.8 },
  { name: "Fresh Paneer", brand: "Amul", category: 1, price: 92, mrp: 100, unit: "200 g", image: "photo-1486297678162-eb2a19b0a32d", rating: 4.7 },
  { name: "Milk Bread", brand: "Britannia", category: 1, price: 40, mrp: 45, unit: "400 g", image: "photo-1509440159596-0249088772ff" },
  { name: "Magic Masala Potato Chips", brand: "Lay's", category: 2, price: 20, mrp: 20, unit: "52 g", image: "photo-1566478989037-eec170784d0b", featured: true, rating: 4.6 },
  { name: "Masala Munch", brand: "Kurkure", category: 2, price: 20, mrp: 20, unit: "75 g", image: "photo-1621447504864-d8686e12698c", featured: true },
  { name: "Aloo Bhujia", brand: "Haldiram's", category: 2, price: 58, mrp: 65, unit: "200 g", image: "photo-1599490659213-e2b9527bd087", rating: 4.7 },
  { name: "Parle-G Biscuits", brand: "Parle", category: 2, price: 30, mrp: 35, unit: "250 g", image: "photo-1499636136210-6f4ee915583e" },
  { name: "Dairy Milk Chocolate", brand: "Cadbury", category: 2, price: 40, mrp: 45, unit: "55 g", image: "photo-1548907040-4d42faa2a0d5", rating: 4.8 },
  { name: "Oreo Original Cookies", brand: "Oreo", category: 2, price: 35, mrp: 40, unit: "120 g", image: "photo-1499636136210-6f4ee915583e" },
  { name: "Thums Up Soft Drink", brand: "Thums Up", category: 3, price: 40, mrp: 45, unit: "750 ml", image: "photo-1554866585-cd94860890b7" },
  { name: "Sprite Lime Drink", brand: "Sprite", category: 3, price: 40, mrp: 45, unit: "750 ml", image: "photo-1544145945-f90425340c7e" },
  { name: "Mango Fruit Drink", brand: "Real", category: 3, price: 110, mrp: 125, unit: "1 L", image: "photo-1600271886742-f049cd451bba", featured: true },
  { name: "Mango Drink", brand: "Frooti", category: 3, price: 35, mrp: 40, unit: "600 ml", image: "photo-1534353473418-4cfa6c56fd38" },
  { name: "Masala Noodles Family Pack", brand: "Maggi", category: 4, price: 56, mrp: 60, unit: "280 g", image: "photo-1569718212165-3a8278d5f624", featured: true },
  { name: "Gold Leaf Tea", brand: "Tata Tea", category: 4, price: 145, mrp: 160, unit: "250 g", image: "photo-1544787219-7f47ccb76574", rating: 4.7 },
  { name: "Classic Instant Coffee", brand: "Nescafe", category: 4, price: 185, mrp: 210, unit: "50 g", image: "photo-1461023058943-07fcbe16d735" },
  { name: "Chocos Breakfast Cereal", brand: "Kellogg's", category: 4, price: 205, mrp: 230, unit: "375 g", image: "photo-1517673132405-a56a62b18caf" },
  { name: "Instant Upma", brand: "MTR", category: 4, price: 70, mrp: 80, unit: "200 g", image: "photo-1606491956689-2ea866880c84" },
  { name: "Chakki Fresh Atta", brand: "Pillsbury", category: 5, price: 280, mrp: 310, unit: "5 kg", image: "photo-1627485937980-221c88ac04f9", featured: true },
  { name: "Iodised Salt", brand: "Tata Salt", category: 5, price: 28, mrp: 30, unit: "1 kg", image: "photo-1515543904379-3d757afe72e4" },
  { name: "Chana Dal", brand: "Tata Sampann", category: 5, price: 145, mrp: 165, unit: "1 kg", image: "photo-1515543904379-3d757afe72e4" },
  { name: "Super Basmati Rice", brand: "India Gate", category: 5, price: 650, mrp: 720, unit: "5 kg", image: "photo-1586201375761-83865001e31c", rating: 4.8 },
  { name: "Kachi Ghani Mustard Oil", brand: "Fortune", category: 6, price: 165, mrp: 185, unit: "1 L", image: "photo-1474979266404-7eaacbcd87c5" },
  { name: "Chicken Masala", brand: "Everest", category: 6, price: 65, mrp: 75, unit: "100 g", image: "photo-1596040033229-a9821ebd058d" },
  { name: "Haldi Powder", brand: "Tata Sampann", category: 6, price: 50, mrp: 58, unit: "100 g", image: "photo-1596040033229-a9821ebd058d" },
  { name: "Cream Beauty Bathing Bar", brand: "Dove", category: 7, price: 140, mrp: 160, unit: "3 × 100 g", image: "photo-1608248543803-ba4f8c70ae0b", featured: true },
  { name: "Strong Teeth Toothpaste", brand: "Colgate", category: 7, price: 99, mrp: 110, unit: "150 g", image: "photo-1609840114035-3c981b782dfe" },
  { name: "Soft Light Moisturiser", brand: "Nivea", category: 7, price: 149, mrp: 170, unit: "100 ml", image: "photo-1608248543803-ba4f8c70ae0b" },
  { name: "Coconut Hair Oil", brand: "Parachute", category: 7, price: 72, mrp: 80, unit: "190 ml", image: "photo-1608248543803-ba4f8c70ae0b" },
  { name: "Lemon Dishwash Gel", brand: "Vim", category: 8, price: 120, mrp: 135, unit: "500 ml", image: "photo-1585421514738-01798e348b17" },
  { name: "Power Plus Toilet Cleaner", brand: "Harpic", category: 8, price: 105, mrp: 120, unit: "500 ml", image: "photo-1585421514738-01798e348b17" },
  { name: "Easy Wash Detergent", brand: "Surf Excel", category: 8, price: 115, mrp: 130, unit: "1 kg", image: "photo-1585421514738-01798e348b17", featured: true },
  { name: "Disinfectant Floor Cleaner", brand: "Lizol", category: 8, price: 105, mrp: 120, unit: "500 ml", image: "photo-1585421514738-01798e348b17" },
  { name: "Baby Shampoo", brand: "Johnson's", category: 9, price: 120, mrp: 140, unit: "100 ml", image: "photo-1519689680058-324335c77eba" },
  { name: "Baby-Dry Pants", brand: "Pampers", category: 9, price: 149, mrp: 170, unit: "8 pcs", image: "photo-1519689680058-324335c77eba" },
  { name: "Ocean Fish Cat Food", brand: "Whiskas", category: 10, price: 310, mrp: 345, unit: "1.2 kg", image: "photo-1573865526739-10659fec78a5", featured: true },
  { name: "Chicken and Vegetables Dog Food", brand: "Pedigree", category: 10, price: 599, mrp: 660, unit: "3 kg", image: "photo-1583337130417-3346a1be7dee" },
  { name: "Kesar Pista Kulfi", brand: "Vadilal", category: 11, price: 180, mrp: 200, unit: "6 pcs", image: "photo-1563805042-7684c019e1cb" },
  { name: "Chocolate Chocobar", brand: "Amul", category: 11, price: 120, mrp: 140, unit: "4 pcs", image: "photo-1563805042-7684c019e1cb" }
];

const sourcedProductImages: Record<string, string> = {
  "A2 Cow Milk": "https://images.openfoodfacts.net/images/products/890/401/130/1601/front_en.3.400.jpg",
  "Classic Curd": "https://images.openfoodfacts.net/images/products/890/408/330/6085/front_en.5.400.jpg",
  "Farm White Eggs": "https://images.openfoodfacts.net/images/products/004/970/565/8482/front_en.12.400.jpg",
  "Salted Butter": "https://images.openfoodfacts.net/images/products/890/126/201/0016/front_en.53.400.jpg",
  "Cheddar Cheese Slices": "https://images.openfoodfacts.net/images/products/890/126/202/0015/front_en.17.400.jpg",
  "Classic Salted Chips": "https://images.openfoodfacts.net/images/products/890/149/100/1021/front_en.3.400.jpg",
  "Masala Makhana": "https://images.openfoodfacts.net/images/products/890/612/010/0663/front_en.5.400.jpg",
  "Roasted Peanuts": "https://images.openfoodfacts.net/images/products/890/406/321/0685/front_en.3.400.jpg",
  "Dark Chocolate Bar": "https://images.openfoodfacts.net/images/products/890/126/207/1703/front_en.3.400.jpg",
  "Oat Cookies": "https://images.openfoodfacts.net/images/products/890/106/316/5687/front_en.3.400.jpg",
  "Tender Coconut Water": "https://images.openfoodfacts.net/images/products/890/425/870/1707/front_en.5.400.jpg",
  "Orange Juice": "https://images.openfoodfacts.net/images/products/502/231/300/0282/front_en.26.400.jpg",
  "Sparkling Lime": "https://images.openfoodfacts.net/images/products/890/608/060/4300/front_en.5.400.jpg",
  "Cola Drink": "https://images.openfoodfacts.net/images/products/544/900/013/0389/front_en.149.400.jpg",
  "Cold Coffee": "https://images.openfoodfacts.net/images/products/893/480/404/9878/front_en.3.400.jpg",
  "Rolled Oats": "https://images.openfoodfacts.net/images/products/890/108/821/3608/front_en.3.400.jpg",
  "Masala Oats": "https://images.openfoodfacts.net/images/products/890/108/812/9817/front_en.18.400.jpg",
  "Instant Noodles": "https://images.openfoodfacts.net/images/products/000/001/901/0588/front_en.15.400.jpg",
  "Masala Noodles Family Pack": "https://images.openfoodfacts.net/images/products/890/105/800/0306/front_en.10.400.jpg",
  "Gold Leaf Tea": "https://images.openfoodfacts.net/images/products/890/105/200/0807/front_en.3.400.jpg",
  "Instant Upma": "https://images.openfoodfacts.net/images/products/890/104/296/8940/front_en.14.400.jpg",
  "Basmati Rice": "https://images.openfoodfacts.net/images/products/069/022/530/4252/front_en.3.400.jpg",
  "Toor Dal": "https://images.openfoodfacts.net/images/products/890/404/392/6216/front_en.5.400.jpg",
  "Whole Wheat Atta": "https://images.openfoodfacts.net/images/products/890/172/512/1143/front_en.11.400.jpg",
  "Moong Dal": "https://images.openfoodfacts.net/images/products/890/404/392/6322/front_en.3.400.jpg",
  "Sunflower Oil": "https://images.openfoodfacts.net/images/products/890/600/728/0280/front_en.3.400.jpg",
  "Turmeric Powder": "https://images.openfoodfacts.net/images/products/890/178/642/5006/front_en.5.400.jpg",
  "Garam Masala": "https://images.openfoodfacts.net/images/products/890/216/700/0782/front_en.4.400.jpg",
  "Black Pepper": "https://images.openfoodfacts.net/images/products/890/119/210/1112/front_en.3.400.jpg",
  "Aloe Vera Face Wash": "https://images.openfoodfacts.net/images/products/890/113/885/1248/front_en.3.400.jpg",
  "Cream Beauty Bathing Bar": "https://images.openfoodfacts.net/images/products/001/111/101/2158/front_en.8.400.jpg",
  "Neem Toothpaste": "https://images.openfoodfacts.net/images/products/000/000/053/4491/front_en.3.400.jpg",
  "Soft Light Moisturiser": "https://images.openfoodfacts.net/images/products/000/004/242/0002/front_en.3.400.jpg",
  "Hand Wash Refill": "https://images.openfoodfacts.net/images/products/629/512/005/9432/front_en.3.400.jpg",
  "Power Plus Toilet Cleaner": "https://images.openfoodfacts.net/images/products/629/512/005/2334/front_en.3.400.jpg",
  "Tuna Cat Food": "https://images.openfoodfacts.net/images/products/931/002/286/6203/front_en.9.400.jpg",
  "Chicken and Vegetables Dog Food": "https://images.openfoodfacts.net/images/products/885/330/100/0277/front_id.26.400.jpg",
  "Vanilla Ice Cream": "https://images.openfoodfacts.net/images/products/890/126/217/3490/front_en.3.400.jpg",
  "Taaza Toned Milk": "https://images.openfoodfacts.net/images/products/890/126/215/0217/front_en.35.400.jpg",
  "Fresh Paneer": "https://images.openfoodfacts.net/images/products/890/126/218/0115/front_en.6.400.jpg",
  "Milk Bread": "https://images.openfoodfacts.net/images/products/890/106/334/1852/front_en.5.400.jpg",
  "Magic Masala Potato Chips": "https://images.openfoodfacts.net/images/products/006/041/005/6264/front_en.9.400.jpg",
  "Masala Munch": "https://images.openfoodfacts.net/images/products/500/032/831/4907/front_en.3.400.jpg",
  "Aloo Bhujia": "https://images.openfoodfacts.net/images/products/890/406/323/1574/front_en.3.400.jpg",
  "Parle-G Biscuits": "https://images.openfoodfacts.net/images/products/890/171/990/2413/front_en.23.400.jpg",
  "Dairy Milk Chocolate": "https://images.openfoodfacts.net/images/products/762/220/233/4009/front_en.9.400.jpg",
  "Oreo Original Cookies": "https://images.openfoodfacts.net/images/products/762/221/065/3031/front_en.12.400.jpg",
  "Sprite Lime Drink": "https://images.openfoodfacts.net/images/products/004/900/001/9384/front_en.7.400.jpg",
  "Mango Fruit Drink": "https://images.openfoodfacts.net/images/products/890/120/700/6029/front_en.3.400.jpg",
  "Mango Drink": "https://images.openfoodfacts.net/images/products/890/257/910/5013/front_en.21.400.jpg",
  "Thums Up Soft Drink": "https://images.openfoodfacts.net/images/products/890/176/404/8319/front_en.22.400.jpg",
  "Classic Instant Coffee": "https://images.openfoodfacts.net/images/products/000/008/900/9949/front_en.4.400.jpg",
  "Chocos Breakfast Cereal": "https://images.openfoodfacts.net/images/products/890/149/900/8244/front_en.4.400.jpg",
  "Chakki Fresh Atta": "https://images.openfoodfacts.net/images/products/890/600/021/0291/front_en.3.400.jpg",
  "Iodised Salt": "https://images.openfoodfacts.net/images/products/890/404/390/1077/front_en.9.400.jpg",
  "Chana Dal": "https://images.openfoodfacts.net/images/products/890/404/392/6643/front_en.3.400.jpg",
  "Super Basmati Rice": "https://images.openfoodfacts.net/images/products/069/022/530/4252/front_en.3.400.jpg",
  "Kachi Ghani Mustard Oil": "https://images.openfoodfacts.net/images/products/890/600/728/0952/front_en.4.400.jpg",
  "Chicken Masala": "https://images.openfoodfacts.net/images/products/890/178/616/5001/front_fr.4.400.jpg",
  "Chocolate Chocobar": "https://images.openfoodfacts.net/images/products/890/126/217/8198/front_en.3.400.jpg",
  "Coconut Hair Oil": "https://images.openfoodfacts.net/images/products/003/125/714/9594/front_en.3.400.jpg",
  "Baby Shampoo": "https://images.openfoodfacts.net/images/products/357/466/147/0573/front_en.3.400.jpg",
  "Ocean Fish Cat Food": "https://images.openfoodfacts.net/images/products/931/002/286/6104/front_en.19.400.jpg",
  "Kesar Pista Kulfi": "https://images.openfoodfacts.net/images/products/890/177/796/7171/front_id.3.400.jpg"
};

function productImage(item: ProductSeed) {
  return sourcedProductImages[item.name]
    ?? `https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=720&q=80`;
}

async function upsertUser(email: string, phone: string, name: string, role: Role, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { name, phone, role, passwordHash, active: true },
    create: { email, phone, name, role, passwordHash }
  });
}

async function main() {
  const categoryRows = [];
  for (const [name, slug, photo] of categories) {
    categoryRows.push(await prisma.category.upsert({
      where: { slug },
      update: { name, image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=800&q=80` },
      create: { name, slug, image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=800&q=80` }
    }));
  }
  for (const [index, item] of productSeeds.entries()) {
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        name: item.name, description: `${item.name}, carefully selected for freshness and everyday value.`,
        brand: item.brand, categoryId: categoryRows[item.category].id,
        mrpPaise: item.mrp * 100, pricePaise: item.price * 100, unit: item.unit,
        image: productImage(item),
        featured: Boolean(item.featured), active: true, rating: item.rating, reviewCount: item.rating ? 20 + (index * 7) % 180 : 0
      },
      create: {
        slug, name: item.name, description: `${item.name}, carefully selected for freshness and everyday value.`,
        brand: item.brand, sku: `QOR-${String(index + 1).padStart(4, "0")}`,
        categoryId: categoryRows[item.category].id,
        mrpPaise: item.mrp * 100, pricePaise: item.price * 100, unit: item.unit,
        image: productImage(item),
        featured: Boolean(item.featured), active: true, rating: item.rating, reviewCount: item.rating ? 20 + (index * 7) % 180 : 0
      }
    });
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { lowStockAt: 5 },
      create: { productId: product.id, quantity: item.stock ?? 30, lowStockAt: 5 }
    });
  }

  const customer = await upsertUser("customer@quickora.local", "9000000001", "Aarav Customer", Role.CUSTOMER, process.env.SEED_CUSTOMER_PASSWORD ?? "QuickoraCustomer123!");
  const admin = await upsertUser("admin@quickora.local", "9000000002", "Quickora Admin", Role.ADMIN, process.env.SEED_ADMIN_PASSWORD ?? "QuickoraAdmin123!");
  const rider = await upsertUser("rider@quickora.local", "9000000003", "Ravi Delivery", Role.DELIVERY, process.env.SEED_RIDER_PASSWORD ?? "QuickoraRider123!");
  await prisma.deliveryPartnerProfile.upsert({
    where: { userId: rider.id }, update: { available: true }, create: { userId: rider.id, available: true }
  });
  let address = await prisma.address.findFirst({ where: { userId: customer.id, isDefault: true } });
  if (!address) {
    address = await prisma.address.create({
      data: { userId: customer.id, fullName: customer.name, phone: customer.phone, house: "12/4 Green Park", street: "Anna Salai", locality: "Teynampet", city: "Chennai", state: "Tamil Nadu", pinCode: "600018", type: "Home", isDefault: true }
    });
  }
  const coupons = [
    { code: "WELCOME10", type: "PERCENT", value: 10, minOrderPaise: 29900, maxDiscount: 10000 },
    { code: "QUICK50", type: "FIXED", value: 5000, minOrderPaise: 49900, maxDiscount: 5000 },
    { code: "FRESH15", type: "PERCENT", value: 15, minOrderPaise: 39900, maxDiscount: 12000 }
  ];
  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: { ...coupon, startsAt: new Date("2025-01-01T00:00:00Z"), expiresAt: new Date("2030-12-31T23:59:59Z"), active: true },
      create: { ...coupon, startsAt: new Date("2025-01-01T00:00:00Z"), expiresAt: new Date("2030-12-31T23:59:59Z"), active: true }
    });
  }
  await prisma.deliveryZone.upsert({
    where: { pinPrefix: "600" },
    update: { city: "Chennai", state: "Tamil Nadu", active: true },
    create: { pinPrefix: "600", city: "Chennai", state: "Tamil Nadu", active: true }
  });
  const [milkProduct, breadProduct] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { slug: "a2-cow-milk" } }),
    prisma.product.findUniqueOrThrow({ where: { slug: "whole-wheat-bread" } })
  ]);
  const demoOrder = await prisma.order.upsert({
    where: { orderNumber: "QOR-DEMO-001" },
    update: {},
    create: {
      orderNumber: "QOR-DEMO-001",
      userId: customer.id,
      addressId: address.id,
      addressSnapshot: { fullName: address.fullName, phone: address.phone, house: address.house, street: address.street, locality: address.locality, city: address.city, state: address.state, pinCode: address.pinCode },
      status: OrderStatus.READY_FOR_PICKUP,
      subtotalPaise: 11600,
      discountPaise: 0,
      deliveryFeePaise: 2500,
      platformFeePaise: 500,
      totalPaise: 14600,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: "PENDING",
      estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000),
      payment: { create: { provider: "COD", status: "PENDING", amountPaise: 14600 } },
      items: { create: [
        { productId: milkProduct.id, productName: "A2 Cow Milk", productSku: milkProduct.sku, image: milkProduct.image, unit: milkProduct.unit, quantity: 2, unitPricePaise: milkProduct.pricePaise, mrpPaise: milkProduct.mrpPaise },
        { productId: breadProduct.id, productName: "Whole Wheat Bread", productSku: breadProduct.sku, image: breadProduct.image, unit: breadProduct.unit, quantity: 1, unitPricePaise: breadProduct.pricePaise, mrpPaise: breadProduct.mrpPaise }
      ] }
    }
  });
  await prisma.deliveryAssignment.upsert({
    where: { orderId: demoOrder.id },
    update: { partnerId: (await prisma.deliveryPartnerProfile.findUniqueOrThrow({ where: { userId: rider.id } })).id },
    create: { orderId: demoOrder.id, partnerId: (await prisma.deliveryPartnerProfile.findUniqueOrThrow({ where: { userId: rider.id } })).id, status: "ASSIGNED" }
  });
  await prisma.cart.upsert({ where: { userId: customer.id }, update: {}, create: { userId: customer.id } });
  await prisma.auditLog.upsert({
    where: { id: "quickora-seed-ready" },
    update: { metadata: { productCount: productSeeds.length, categoryCount: categories.length } },
    create: { id: "quickora-seed-ready", actorId: admin.id, action: "SEED_READY", entityType: "SYSTEM", entityId: "quickora", metadata: { productCount: productSeeds.length, categoryCount: categories.length } }
  });
  console.log(`Seeded ${productSeeds.length} products, ${categories.length} categories, and demo accounts.`);
}

main().catch((error: unknown) => {
  console.error("Database seeding failed:", error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
