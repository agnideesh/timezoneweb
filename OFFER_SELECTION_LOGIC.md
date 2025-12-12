# Offer Selection Logic Documentation

This document explains how the offer selection system works in the Timezone Kiosk application, including the database schema, API endpoints, and frontend logic.

---

## 1. Database Schema

The offers are stored in a PostgreSQL table called `offers`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key, auto-increment |
| `product_name` | varchar(255) | Name/identifier of the offer |
| `cost` | numeric(10,2) | Cost/price of the offer |
| `bonus_percent` | numeric(5,2) | Bonus percentage (default: 0) |
| `tizo_credit` | numeric(10,2) | Tizo credits awarded |
| `category` | varchar(100) | Category (e.g., "Voucher") |
| `start_date` | date | Offer validity start date (nullable) |
| `end_date` | date | Offer validity end date (nullable) |
| `card_type` | varchar(100) | **Key field**: "Red" or "Blue" - determines layout |
| `venue` | text[] | Array of kiosk locations (e.g., {"Kiosk 1", "Kiosk 2"}) |
| `offer_card_image` | text | Base64-encoded image for the offer card |
| `top_left_icon` | text | Icon for top-left corner |
| `top_right_icon` | text | Icon for top-right corner |
| `bottom_left_icon` | text | Icon for bottom-left corner |
| `bottom_right_icon` | text | Icon for bottom-right corner |
| `gift` | varchar(50) | Gift type (default: "Nil") |
| `gift_details` | varchar(255) | Gift description |
| `created_at` | timestamp | Record creation time |
| `updated_at` | timestamp | Last update time (auto-updated via trigger) |

### Indexes
- `idx_offers_category` - Index on `category` column
- `idx_offers_dates` - Composite index on `start_date` and `end_date`

---

## 2. Layout Selection Logic (Backend)

The layout of offer cards on the kiosk screen is **automatically determined** based on the count of **Red card_type offers** in the database.

### API Endpoint: `GET /api/layout-config`

**Logic:**
```
Red card count ≤ 3  →  "triangle" layout (3 cards)
Red card count = 4  →  "y" layout (4 cards)
Red card count ≥ 5  →  "x" layout (5 cards)
```

**Response:**
```json
{
  "success": true,
  "layout": "triangle" | "y" | "x",
  "count": <number of Red cards>,
  "message": "Found X Red cards, using Y layout"
}
```

### Other API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/offers` | Returns all offers from the database |
| `GET /api/offers/:cardType` | Returns offers filtered by card_type (e.g., "Red" or "Blue") |
| `GET /api/health` | Health check endpoint |

---

## 3. Frontend Offer Display

### Layout Types

The frontend displays offers in three different layouts based on the API response:

#### Triangle Layout (≤3 Red cards)
```
    [Card 2]    [Card 3]
         [Card 1]
```
- Top row: 2 medium cards (positions 1 and 2)
- Bottom: 1 large card (position 0)

#### Y Layout (4 Red cards)
```
    [Card 1]    [Card 2]
         [Card 3]
         [Card 4]
```
- Top row: 2 medium cards
- Center: 1 large card
- Bottom: 1 large card

#### X Layout (≥5 Red cards)
```
    [Card 1]    [Card 2]
         [Card 3]
    [Card 4]    [Card 5]
```
- Top row: 2 medium cards
- Center: 1 large card
- Bottom row: 2 medium cards

---

## 4. Frontend Offer Data (Static Fallback)

The frontend also has static offer data in `src/data/offers.ts` used as fallback:

```typescript
export const topUpOffers: Offer[] = [
  { id: 'offer-50', amount: 50, bonus: 10, label: 'Starter', color: 'cyan' },
  { id: 'offer-100', amount: 100, bonus: 25, label: 'Popular', color: 'pink', highlight: true },
  { id: 'offer-150', amount: 150, bonus: 40, label: 'Value', color: 'purple' },
  { id: 'offer-200', amount: 200, bonus: 60, label: 'Super', color: 'gold' },
  { id: 'offer-300', amount: 300, bonus: 100, label: 'Best Deal', color: 'orange', highlight: true },
  { id: 'offer-500', amount: 500, bonus: 200, label: 'Premium', color: 'orange' },
];
```

---

## 5. Offer Selection Flow

### Step 1: User Arrives at Top-Up Screen
1. Frontend calls `GET /api/layout-config`
2. Layout is automatically set based on Red card count
3. Offers are displayed in the determined layout

### Step 2: User Selects an Offer
**Option A: Predefined Offer**
- User clicks on an offer card
- Offer is stored in `KioskContext.state.selectedOffer`
- User proceeds to Scratch Card screen

**Option B: Custom Amount**
- User enters a custom amount
- Amount is stored in `KioskContext.state.customAmount`
- User proceeds to **Upsell Opportunities** screen

### Step 3: Upsell Logic (Custom Amount Only)
When a user enters a custom amount, the system suggests better offers:

```typescript
const getUpsellOffers = (): Offer[] => {
  // 1. Find closest offer BELOW or equal to custom amount
  // 2. Find two offers ABOVE custom amount
  // 3. Fill remaining slots with highest bonus offers
  // Returns up to 3 upsell suggestions
};
```

### Step 4: Add to Cart
Selected offer or custom amount is added to the cart:
```typescript
{
  type: 'topup',
  amount: <offer amount or custom amount>,
  bonus: <bonus tizo or 0 for custom>,
  label: '<description>'
}
```

---

## 6. Key Files

| File | Purpose |
|------|---------|
| `database.sql` | PostgreSQL schema and sample data |
| `server.js` | Express API server with offer endpoints |
| `db.js` | PostgreSQL connection pool |
| `src/screens/SelectTopUpScreen.tsx` | Main offer selection UI |
| `src/screens/UpsellOpportunitiesScreen.tsx` | Upsell suggestions for custom amounts |
| `src/data/offers.ts` | Static offer data (fallback) |
| `src/types/kiosk.ts` | TypeScript interfaces for Offer, CartItem, etc. |
| `src/context/KioskContext.tsx` | Global state management for kiosk flow |

---

## 7. Summary

| Feature | How It Works |
|---------|--------------|
| **Layout Selection** | Automatic based on count of `card_type = 'Red'` offers in database |
| **Offer Filtering** | By `card_type` (Red/Blue) via API |
| **Date Filtering** | `start_date` and `end_date` columns available (not currently used in queries) |
| **Venue Filtering** | `venue` array column available for kiosk-specific offers |
| **Upsell Logic** | Suggests offers above/below custom amount with best bonuses |
| **Cart Management** | React Context stores selected offers and custom amounts |

---

## 8. Example Database Records

From the sample data:
```
id=17: cost=5000, bonus=10%, card_type=Red, venues=["Kiosk 1-5"]
id=18: cost=6000, bonus=15%, card_type=Red, venues=["Kiosk 1"]
id=19: cost=2000, bonus=10%, card_type=Red, venues=["Kiosk 1"]
id=20: cost=6000, bonus=35%, card_type=Red, venues=["Kiosk 1"]
id=21: cost=8000, bonus=45%, card_type=Red, venues=["Kiosk 1"]
id=22: cost=6000, bonus=25%, card_type=Blue, venues=["Kiosk 1"]
```

With 5 Red cards in the database, the system automatically uses the **X layout** (5 cards displayed).
