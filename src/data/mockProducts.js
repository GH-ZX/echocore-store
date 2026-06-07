import valorantImg from '../assets/valorant.png';
import lolImg from '../assets/lol.png';
import xboxpassImg from '../assets/xboxpass.png';

export const mockProductsDB = [
  { id: 1, name_en: "Valorant", name_ar: "Valorant", price: 9.99, category: "games", icon: "Gamepad2", color: "from-red-500 to-rose-600", image: valorantImg, logoFile: "valorant-logo.png" },
  { id: 2, name_en: "League of Legends", name_ar: "League of Legends", price: 10.99, category: "games", icon: "Gamepad2", color: "from-cyan-500 to-blue-600", image: lolImg, logoFile: "lol-logo.png" },
  { id: 3, name_en: "Steam Wallet $20", name_ar: "محفظة ستيم 20$", price: 19.99, category: "cards", icon: "Gamepad2", color: "from-slate-700 to-slate-900" },
  { id: 4, name_en: "Steam Wallet $50", name_ar: "محفظة ستيم 50$", price: 49.99, category: "cards", icon: "Gamepad2", color: "from-slate-800 to-black" },
  { id: 5, name_en: "Battle.net $20 Gift Card", name_ar: "بطاقة هدايا باتل نت 20$", price: 19.99, category: "cards", icon: "Gift", color: "from-blue-600 to-blue-800" },
  { id: 6, name_en: "Xbox PC Game Pass 1 Month", name_ar: "Xbox PC Game Pass 1 Month", price: 9.99, category: "games", icon: "Gamepad2", color: "from-green-500 to-green-700", image: xboxpassImg, logoFile: "xbox-logo.png" },
  { id: 7, name_en: "Discord Nitro 1 Month", name_ar: "ديسكورد نايترو (شهر)", price: 9.99, category: "cards", icon: "Gift", color: "from-indigo-500 to-purple-600" },
  { id: 8, name_en: "Epic Games $25", name_ar: "رصيد إيبك جيمز 25$", price: 24.99, category: "cards", icon: "Gamepad2", color: "from-gray-700 to-gray-900" },
  // Additional game entries (names kept in English for all locales)
  { id: 9, name_en: "Fortnite", name_ar: "Fortnite", price: 0.0, category: "games", icon: "Gamepad2", color: "from-purple-500 to-pink-600", logoFile: "fortnite-logo.png" },
  { id: 10, name_en: "Minecraft", name_ar: "Minecraft", price: 0.0, category: "games", icon: "Gamepad2", color: "from-amber-500 to-amber-700", logoFile: "minecraft-logo.png" },
  { id: 11, name_en: "Apex Legends", name_ar: "Apex Legends", price: 0.0, category: "games", icon: "Gamepad2", color: "from-sky-500 to-indigo-600", logoFile: "apex-legends-logo.png" },
  { id: 12, name_en: "Call of Duty", name_ar: "Call of Duty", price: 0.0, category: "games", icon: "Gamepad2", color: "from-gray-600 to-gray-800", logoFile: "call-of-duty-logo.png" },
];
