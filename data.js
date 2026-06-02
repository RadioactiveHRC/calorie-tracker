// ============================================================
// data.js — Static food database & app constants
// ============================================================

const GOALS = {
  calories: 3300,
  protein: 140,
};

// South Indian & common food presets
// Each entry: { name, calories, protein (g), category }
const FOOD_PRESETS = [
  // Breakfast
  { name: "Dosa (plain)", calories: 168, protein: 3.9, category: "Breakfast" },
  { name: "Masala Dosa", calories: 295, protein: 6.5, category: "Breakfast" },
  { name: "Idli (2 pcs)", calories: 140, protein: 4.8, category: "Breakfast" },
  { name: "Upma (1 bowl)", calories: 250, protein: 6.0, category: "Breakfast" },
  { name: "Pongal (1 bowl)", calories: 280, protein: 7.5, category: "Breakfast" },

  // Lunch / Dinner mains
  { name: "Rice (1 cup cooked)", calories: 206, protein: 4.3, category: "Lunch" },
  { name: "Roti (1 piece)", calories: 104, protein: 3.1, category: "Lunch" },
  { name: "Chicken Curry (1 serving)", calories: 320, protein: 28.0, category: "Lunch" },
  { name: "Mutton Curry (1 serving)", calories: 370, protein: 25.0, category: "Dinner" },
  { name: "Fish Curry (1 serving)", calories: 230, protein: 24.0, category: "Lunch" },
  { name: "Shrimp Curry (1 serving)", calories: 210, protein: 22.0, category: "Dinner" },
  { name: "Chicken Biryani (1 plate)", calories: 490, protein: 32.0, category: "Lunch" },
  { name: "Egg Biryani (1 plate)", calories: 430, protein: 22.0, category: "Lunch" },
  { name: "Paneer Curry (1 serving)", calories: 310, protein: 18.0, category: "Lunch" },
  { name: "Chana Masala (1 bowl)", calories: 270, protein: 14.0, category: "Lunch" },
  { name: "Dal (1 bowl)", calories: 180, protein: 12.0, category: "Lunch" },
  { name: "Sambar (1 cup)", calories: 90, protein: 5.0, category: "Lunch" },
  { name: "Curd Rice (1 bowl)", calories: 240, protein: 7.0, category: "Lunch" },

  // Chutneys / Sides
  { name: "Coconut Chutney (2 tbsp)", calories: 60, protein: 0.8, category: "Snack" },
  { name: "Peanut Chutney (2 tbsp)", calories: 75, protein: 3.2, category: "Snack" },

  // Drinks
  { name: "Lassi (1 glass)", calories: 180, protein: 6.0, category: "Drink" },
  { name: "Haldi Doodh (1 cup)", calories: 140, protein: 6.5, category: "Drink" },
];

// Meal category badge colours (CSS custom-property values)
const CATEGORY_COLORS = {
  Breakfast: "#f59e0b",
  Lunch:     "#10b981",
  Dinner:    "#6366f1",
  Snack:     "#f43f5e",
  Drink:     "#06b6d4",
};

// Days of the week labels for the weekly chart
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
