/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — High-Fidelity Food & Category Visuals for Foodics POS
 * Features authentic breakfast (Foul, Taameya, Potatoes, Eggs) & lunch/dinner (Pizza, Crepes, Burgers)
 */

import React from 'react';

interface FoodVisualProps {
  id: string;
  name?: string;
  className?: string;
  isCategory?: boolean;
  imageUrl?: string;
}

export const FoodVisual: React.FC<FoodVisualProps> = ({
  id,
  name = '',
  className = 'w-full h-24',
  imageUrl,
}) => {
  const [imgError, setImgError] = React.useState(false);

  // If real image is provided and hasn't failed to load, display it
  if (imageUrl && !imgError) {
    return (
      <div className={`relative overflow-hidden bg-slate-900/10 flex items-center justify-center ${className}`}>
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  const normId = (id + ' ' + name).toLowerCase();

  // 1. FOUL / FAVA BEANS (أصناف الفول)
  if (normId.includes('foul') || normId.includes('ful') || normId.includes('fava')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/20 via-orange-950/15 to-stone-900/40 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Earthen Terracotta / Ceramic Bowl */}
          <ellipse cx="58" cy="74" rx="42" ry="11" fill="#78350F" opacity="0.4" />
          <path d="M18 42C18 66 34 76 58 76C82 76 98 66 98 42Z" fill="#B45309" stroke="#92400E" strokeWidth="2.5" />
          {/* Bowl Rim */}
          <ellipse cx="58" cy="42" rx="40" ry="12" fill="#D97706" />
          <ellipse cx="58" cy="42" rx="36" ry="10.5" fill="#78350F" />
          {/* Simmered Fava Beans Base */}
          <ellipse cx="58" cy="43" rx="34" ry="9.5" fill="#451A03" />
          {/* Individual Fava Bean Shapes */}
          <ellipse cx="44" cy="42" rx="5" ry="3" fill="#92400E" transform="rotate(-15 44 42)" />
          <ellipse cx="54" cy="40" rx="4.5" ry="3" fill="#78350F" transform="rotate(20 54 40)" />
          <ellipse cx="66" cy="41" rx="5" ry="3.2" fill="#92400E" transform="rotate(-25 66 41)" />
          <ellipse cx="74" cy="44" rx="4.5" ry="2.8" fill="#78350F" transform="rotate(10 74 44)" />
          <ellipse cx="50" cy="46" rx="4.8" ry="3" fill="#92400E" transform="rotate(35 50 46)" />
          <ellipse cx="62" cy="46" rx="5.2" ry="3.2" fill="#78350F" transform="rotate(-10 62 46)" />
          {/* Olive / Flaxseed Oil Pool (Golden Glow) */}
          <ellipse cx="58" cy="43" rx="20" ry="5.5" fill="#EAB308" opacity="0.75" />
          {/* Creamy White Tahini Swirl */}
          <path d="M42 43C48 39 68 40 72 44C68 47 50 48 46 44C52 42 62 42 66 45" stroke="#FEF3C7" strokeWidth="2.2" strokeLinecap="round" />
          {/* Cumin & Paprika Spice Sprinkles */}
          <circle cx="52" cy="42" r="0.9" fill="#B91C1C" />
          <circle cx="56" cy="45" r="0.9" fill="#B91C1C" />
          <circle cx="64" cy="42" r="0.9" fill="#78350F" />
          <circle cx="60" cy="40" r="0.9" fill="#78350F" />
          <circle cx="48" cy="45" r="0.9" fill="#B91C1C" />
          {/* Lemon Wedge on Bowl Rim */}
          <path d="M90 34C96 32 102 38 98 44C92 42 90 38 90 34Z" fill="#FACC15" />
          <path d="M92 36C95 34 99 38 96 42C92 41 91 38 92 36Z" fill="#FEF08A" />
          {/* Fresh Parsley Leaf */}
          <circle cx="58" cy="38" r="2.2" fill="#15803D" />
          <circle cx="60" cy="37" r="1.8" fill="#22C55E" />
          {/* Egyptian Baladi Bread on side */}
          <ellipse cx="100" cy="62" rx="14" ry="18" fill="#D97706" transform="rotate(30 100 62)" stroke="#92400E" strokeWidth="1.5" />
          <ellipse cx="99" cy="61" rx="11" ry="14" fill="#FDE68A" transform="rotate(30 99 61)" opacity="0.6" />
          <circle cx="98" cy="58" r="1" fill="#78350F" />
          <circle cx="102" cy="64" r="1.2" fill="#78350F" />
        </svg>
      </div>
    );
  }

  // 2. TAAMEYA / FALAFEL (أصناف الطعمية والفلافل)
  if (normId.includes('taameya') || normId.includes('falafel') || normId.includes('tameya')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/20 via-yellow-950/15 to-emerald-950/25 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Surface Shadow */}
          <ellipse cx="60" cy="76" rx="46" ry="9" fill="#000000" opacity="0.25" />
          {/* Center Large Crispy Stuffed Taameya Patty */}
          <circle cx="60" cy="46" r="25" fill="#78350F" stroke="#92400E" strokeWidth="2" />
          <circle cx="60" cy="46" r="22" fill="#B45309" />
          {/* Crunchy Golden Crust Texture */}
          <circle cx="60" cy="46" r="19" fill="#D97706" opacity="0.9" />
          {/* Cut/Bite Showing Fresh Green Herbs Interior */}
          <path d="M50 36C56 34 66 38 68 44C64 48 56 46 50 36Z" fill="#15803D" />
          <path d="M52 38C56 36 62 39 64 43C61 45 56 44 52 38Z" fill="#4ADE80" opacity="0.7" />
          {/* White Sesame Seeds (Signature Egyptian Taameya!) */}
          <ellipse cx="44" cy="40" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(25 44 40)" />
          <ellipse cx="56" cy="30" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(-15 56 30)" />
          <ellipse cx="68" cy="34" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(40 68 34)" />
          <ellipse cx="74" cy="44" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(-30 74 44)" />
          <ellipse cx="48" cy="52" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(10 48 52)" />
          <ellipse cx="62" cy="56" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(60 62 56)" />
          <ellipse cx="72" cy="54" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(-20 72 54)" />
          <ellipse cx="54" cy="48" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(45 54 48)" />
          <ellipse cx="40" cy="48" rx="1.8" ry="1" fill="#FEF3C7" transform="rotate(-40 40 48)" />
          {/* Left Smaller Crispy Taameya */}
          <circle cx="28" cy="56" r="16" fill="#78350F" />
          <circle cx="28" cy="56" r="14" fill="#B45309" />
          <circle cx="28" cy="56" r="12" fill="#D97706" opacity="0.8" />
          <ellipse cx="24" cy="52" rx="1.5" ry="0.8" fill="#FEF3C7" />
          <ellipse cx="32" cy="54" rx="1.5" ry="0.8" fill="#FEF3C7" />
          <ellipse cx="26" cy="60" rx="1.5" ry="0.8" fill="#FEF3C7" />
          {/* Right Fresh Tahini Dipping Cup */}
          <ellipse cx="94" cy="58" rx="15" ry="8" fill="#E2E8F0" />
          <path d="M80 58C80 68 86 74 94 74C102 74 108 68 108 58Z" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
          <ellipse cx="94" cy="58" rx="12" ry="6" fill="#FEF3C7" />
          <path d="M88 58C92 56 96 59 100 58" stroke="#DC2626" strokeWidth="1.2" strokeLinecap="round" />
          {/* Parsley Sprig */}
          <path d="M42 22C46 16 54 20 48 26Z" fill="#16A34A" />
        </svg>
      </div>
    );
  }

  // 3. POTATOES / FRIES / CHIPS (أصناف البطاطس)
  if (normId.includes('potato') || normId.includes('fries') || normId.includes('chips') || normId.includes('batates')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-900/20 via-yellow-900/15 to-stone-900/40 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Red Fries Carton Box */}
          <path d="M38 46L44 80H76L82 46C76 49 60 50 38 46Z" fill="#DC2626" />
          <path d="M40 47L45 79H75L80 47C74 50 60 50 40 47Z" fill="#B91C1C" />
          {/* Foodics White Logo on Fries Box */}
          <circle cx="60" cy="65" r="7" fill="#FFFFFF" />
          <path d="M57 62H63V68H57Z" fill="#DC2626" />
          {/* Golden French Fries Sticks Spilling Out */}
          {/* Stick 1 */}
          <rect x="42" y="16" width="6" height="38" rx="1.5" fill="#F59E0B" transform="rotate(-14 42 16)" />
          <rect x="43" y="17" width="2" height="36" rx="1" fill="#FEF08A" opacity="0.6" transform="rotate(-14 43 17)" />
          {/* Stick 2 */}
          <rect x="52" y="12" width="6.5" height="42" rx="1.5" fill="#EAB308" transform="rotate(-5 52 12)" />
          {/* Stick 3 */}
          <rect x="62" y="10" width="6.5" height="44" rx="1.5" fill="#F59E0B" transform="rotate(4 62 10)" />
          <rect x="63" y="11" width="2" height="42" rx="1" fill="#FEF08A" opacity="0.7" transform="rotate(4 63 11)" />
          {/* Stick 4 */}
          <rect x="71" y="15" width="6" height="39" rx="1.5" fill="#D97706" transform="rotate(16 71 15)" />
          {/* Front row fries */}
          <rect x="47" y="24" width="6" height="32" rx="1.5" fill="#FBBF24" transform="rotate(-8 47 24)" />
          <rect x="58" y="22" width="6" height="34" rx="1.5" fill="#FBBF24" transform="rotate(8 58 22)" />
          <rect x="67" y="26" width="5.5" height="30" rx="1.5" fill="#EAB308" transform="rotate(12 67 26)" />
          {/* Melted Cheddar Cheese Drizzle across fries */}
          <path d="M42 36C48 38 56 34 64 37C72 35 78 38 82 36C80 40 74 41 68 40C60 42 50 39 42 41" fill="#F59E0B" />
          {/* Ketchup Swirl */}
          <path d="M45 42C52 45 66 43 75 45" stroke="#991B1B" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // 4. EGGS / OMELET / PASTRAMI (أصناف البيض والأومليت)
  if (normId.includes('egg') || normId.includes('omelet') || normId.includes('pastrami') || normId.includes('bayd') || normId.includes('shakshuka')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/20 via-orange-900/15 to-yellow-950/25 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cast Iron Skillet or Ceramic Plate */}
          <ellipse cx="60" cy="52" rx="46" ry="24" fill="#1C1917" stroke="#44403C" strokeWidth="3" />
          <ellipse cx="60" cy="50" rx="42" ry="21" fill="#292524" />
          {/* Golden Folded Omelet / Fried Egg Whites */}
          <path d="M28 50C28 38 42 32 62 32C82 32 94 40 92 52C90 64 76 68 56 68C36 68 28 62 28 50Z" fill="#F8FAFC" />
          <path d="M30 52C32 40 44 34 62 34C80 34 90 42 88 52C86 62 74 66 56 66C38 66 30 62 30 52Z" fill="#FEF3C7" opacity="0.6" />
          {/* Two Sunny-side-up Golden Egg Yolks */}
          <circle cx="48" cy="48" r="10" fill="#F59E0B" stroke="#D97706" strokeWidth="1" />
          <circle cx="46" cy="46" r="8" fill="#FBBF24" />
          <circle cx="45" cy="44" r="2.5" fill="#FEF9C3" opacity="0.9" />
          <circle cx="72" cy="46" r="9.5" fill="#F59E0B" stroke="#D97706" strokeWidth="1" />
          <circle cx="70" cy="44" r="7.5" fill="#FBBF24" />
          <circle cx="69" cy="42" r="2.2" fill="#FEF9C3" opacity="0.9" />
          {/* Baladi Pastrami Slices (Dark savory red cuts) */}
          <path d="M34 58C38 52 48 54 52 60C46 62 38 62 34 58Z" fill="#991B1B" />
          <path d="M78 54C84 50 90 56 86 62C80 62 76 58 78 54Z" fill="#881337" />
          <path d="M58 36C64 34 68 38 66 42C62 42 58 38 58 36Z" fill="#991B1B" />
          {/* Fresh Herbs & Black Pepper Sprinkles */}
          <circle cx="50" cy="58" r="1" fill="#1C1917" />
          <circle cx="64" cy="52" r="1.1" fill="#1C1917" />
          <circle cx="76" cy="38" r="0.9" fill="#1C1917" />
          <circle cx="40" cy="44" r="1" fill="#1C1917" />
          <circle cx="58" cy="56" r="1.5" fill="#16A34A" />
          <circle cx="66" cy="48" r="1.5" fill="#15803D" />
          {/* Skillet Handle */}
          <rect x="98" y="47" width="16" height="6" rx="3" fill="#1C1917" stroke="#44403C" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  // 5. CREPE (أصناف الكريب الحادق والحلو)
  if (normId.includes('crepe') || normId.includes('krep') || normId.includes('crape')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/20 via-orange-950/15 to-yellow-950/30 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Surface Shadow */}
          <ellipse cx="60" cy="78" rx="42" ry="8" fill="#000000" opacity="0.25" />
          {/* Iconic Triangular Folded Golden Crepe Base */}
          <path d="M60 82L20 22C42 16 78 16 100 22L60 82Z" fill="#D97706" stroke="#B45309" strokeWidth="2" />
          <path d="M60 78L24 24C44 19 76 19 96 24L60 78Z" fill="#FDE68A" />
          {/* Golden Toasted Grill Fold Lines */}
          <line x1="38" y1="36" x2="82" y2="36" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
          <line x1="46" y1="52" x2="74" y2="52" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
          <line x1="52" y1="66" x2="68" y2="66" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
          {/* Filling Bursting at the Top Fold (Crispy Chicken Strips & Melted Cheese) */}
          <ellipse cx="60" cy="22" rx="38" ry="10" fill="#78350F" opacity="0.3" />
          {/* Crispy Chicken Nuggets/Strips */}
          <rect x="36" y="16" width="14" height="9" rx="3" fill="#D97706" stroke="#92400E" strokeWidth="1" transform="rotate(-10 36 16)" />
          <rect x="52" y="14" width="16" height="10" rx="3" fill="#EA580C" stroke="#92400E" strokeWidth="1" transform="rotate(5 52 14)" />
          <rect x="70" y="17" width="14" height="9" rx="3" fill="#D97706" stroke="#92400E" strokeWidth="1" transform="rotate(15 70 17)" />
          {/* Melted Cheddar & Mozzarella Drizzle */}
          <path d="M32 24C44 28 54 22 66 26C78 22 88 28 92 24" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <path d="M38 28C48 32 60 26 72 30C82 26 86 32 88 28" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          {/* Nutella / Chocolate Drizzle or Ketchup zigzag across body */}
          <path d="M42 40L54 44L46 48L64 52L56 58L66 64L60 70" stroke="#78350F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 41L52 44L47 48L62 52L57 58L64 64" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  // 6. PIZZA (أصناف البيتزا الإيطالية والشرقية)
  if (normId.includes('pizza') || normId.includes('pepperoni') || normId.includes('margherita')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/20 via-orange-900/10 to-red-950/30 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Wooden Pizza Peel */}
          <circle cx="60" cy="46" r="38" fill="#B45309" opacity="0.5" />
          {/* Golden Baked Crust */}
          <circle cx="60" cy="46" r="35" fill="#D97706" />
          <circle cx="60" cy="46" r="31" fill="#F59E0B" />
          {/* Tomato Sauce & Melted Cheese */}
          <circle cx="60" cy="46" r="28" fill="#FBBF24" />
          {/* Pepperoni Slices */}
          <circle cx="50" cy="34" r="6" fill="#B91C1C" />
          <circle cx="70" cy="36" r="6" fill="#991B1B" />
          <circle cx="44" cy="50" r="6" fill="#991B1B" />
          <circle cx="64" cy="52" r="6.5" fill="#B91C1C" />
          <circle cx="76" cy="50" r="5.5" fill="#991B1B" />
          <circle cx="54" cy="62" r="6" fill="#B91C1C" />
          {/* Basil Leaves */}
          <ellipse cx="60" cy="40" rx="3" ry="1.5" fill="#15803D" />
          <ellipse cx="48" cy="44" rx="2.5" ry="1.2" fill="#16A34A" />
        </svg>
      </div>
    );
  }

  // 7. BURGERS / SANDWICHES
  if (normId.includes('burger') || normId.includes('shawarma')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-900/20 via-amber-800/10 to-amber-950/30 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Plate / surface */}
          <ellipse cx="60" cy="80" rx="50" ry="8" fill="#CBD5E1" opacity="0.6" />
          {/* Bottom Bun */}
          <path d="M28 66C28 63 32 60 60 60C88 60 92 63 92 66C92 72 86 76 60 76C34 76 28 72 28 66Z" fill="#D97706" />
          <ellipse cx="60" cy="65" rx="31" ry="5" fill="#F59E0B" />
          {/* Beef Patty */}
          <rect x="25" y="52" width="70" height="9" rx="4.5" fill="#451A03" />
          {/* Melted Cheddar Cheese */}
          <path d="M26 53L35 55L45 52L52 57L62 52L72 58L82 52L94 54L91 58L78 61L68 56L55 61L42 56L30 60Z" fill="#FBBF24" />
          {/* Fresh Lettuce Frills */}
          <path d="M22 50C26 47 30 52 35 48C40 52 46 47 52 51C58 47 64 52 70 48C76 52 82 48 88 51C94 47 98 52 100 49" stroke="#16A34A" strokeWidth="4" strokeLinecap="round" />
          {/* Sliced Red Tomatoes */}
          <ellipse cx="44" cy="45" rx="14" ry="4" fill="#EF4444" />
          <ellipse cx="74" cy="45" rx="14" ry="4" fill="#DC2626" />
          {/* Top Golden Brioche Bun */}
          <path d="M26 44C26 24 40 16 60 16C80 16 94 24 94 44C94 46 88 47 60 47C32 47 26 46 26 44Z" fill="#D97706" />
          {/* Sesame Seeds */}
          <circle cx="48" cy="24" r="1" fill="#FEF3C7" />
          <circle cx="58" cy="22" r="1.1" fill="#FEF3C7" />
          <circle cx="70" cy="25" r="1" fill="#FEF3C7" />
          <circle cx="53" cy="29" r="1.1" fill="#FEF3C7" />
          <circle cx="65" cy="31" r="1" fill="#FEF3C7" />
        </svg>
      </div>
    );
  }

  // 8. APPETIZERS / PICKLES / SIDES
  if (normId.includes('appetizer') || normId.includes('pickle') || normId.includes('wings') || normId.includes('eggplant')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-orange-950/20 via-amber-900/10 to-orange-950/30 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Appetizer platter */}
          <ellipse cx="60" cy="56" rx="46" ry="18" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
          {/* Pickled Eggplant / Meatballs */}
          <ellipse cx="40" cy="54" rx="12" ry="7" fill="#4C1D95" stroke="#2E1065" strokeWidth="1.5" />
          <path d="M32 54C38 52 44 56 48 54" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
          <ellipse cx="62" cy="52" rx="13" ry="7.5" fill="#4C1D95" stroke="#2E1065" strokeWidth="1.5" />
          <path d="M54 52C60 50 66 54 70 52" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
          <ellipse cx="80" cy="56" rx="11" ry="6.5" fill="#4C1D95" stroke="#2E1065" strokeWidth="1.5" />
          {/* Fresh garlic / lemon dressing */}
          <circle cx="42" cy="53" r="1" fill="#FEF08A" />
          <circle cx="64" cy="51" r="1" fill="#FEF08A" />
          <circle cx="82" cy="55" r="1" fill="#FEF08A" />
          <circle cx="50" cy="62" r="1.5" fill="#16A34A" />
          <circle cx="72" cy="60" r="1.5" fill="#16A34A" />
        </svg>
      </div>
    );
  }

  // 9. TEA & HOT DRINKS (شاي كرك، شاي بالنعناع، قهوة)
  if (normId.includes('tea') || normId.includes('karak') || normId.includes('hot') || normId.includes('coffee') || normId.includes('cappuccino') || normId.includes('espresso')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-stone-900/30 via-amber-950/20 to-stone-950/40 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Glass Mug Handle */}
          <path d="M72 38C82 38 82 58 72 58" stroke="#CBD5E1" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Tea Glass */}
          <rect x="42" y="24" width="32" height="44" rx="4" fill="#F8FAFC" opacity="0.3" stroke="#CBD5E1" strokeWidth="1.5" />
          {/* Rich Egyptian Red Tea / Karak Color */}
          <rect x="44" y="32" width="28" height="34" rx="2" fill="#78350F" />
          {/* Mint Leaves in Glass */}
          <path d="M48 30C46 22 56 22 54 30Z" fill="#15803D" />
          <path d="M60 28C62 20 70 24 64 32Z" fill="#16A34A" />
          {/* Steam Wisp */}
          <path d="M48 20C46 14 52 12 50 6" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <path d="M64 18C62 12 68 10 66 4" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
      </div>
    );
  }

  // 10. SODA & COLD DRINKS (بيبسي، عصائر فريش)
  if (normId.includes('drink') || normId.includes('soda') || normId.includes('pepsi') || normId.includes('juice') || normId.includes('cola') || normId.includes('orange') || normId.includes('cold')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-amber-950/30 via-stone-900/20 to-blue-950/40 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Tall Highball Glass */}
          <path d="M42 16L48 76C48 78 52 80 60 80C68 80 72 78 72 76L78 16Z" fill="#1E293B" opacity="0.3" />
          {/* Dark Cola Liquid */}
          <path d="M44 24L48 74C48 76 52 78 60 78C68 78 72 76 72 74L76 24Z" fill="#29140B" />
          {/* Ice Cubes */}
          <rect x="52" y="30" width="14" height="13" rx="2" fill="#E2E8F0" opacity="0.6" stroke="#FFFFFF" strokeWidth="1" />
          <rect x="49" y="46" width="13" height="12" rx="2" fill="#E2E8F0" opacity="0.5" stroke="#FFFFFF" strokeWidth="1" />
          {/* Bubbles */}
          <circle cx="50" cy="38" r="1.5" fill="#FED7AA" opacity="0.8" />
          <circle cx="68" cy="45" r="1.5" fill="#FED7AA" opacity="0.8" />
          {/* Lemon Slice on Rim */}
          <path d="M38 12C44 8 50 14 44 20Z" fill="#FACC15" />
        </svg>
      </div>
    );
  }

  // 11. SWEETS & DESSERTS (كريب حلو، كب كيك)
  if (normId.includes('sweet') || normId.includes('nutella') || normId.includes('dessert') || normId.includes('cupcake') || normId.includes('cake')) {
    return (
      <div className={`relative overflow-hidden bg-gradient-to-b from-stone-900/20 via-amber-950/20 to-stone-950/30 flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="60" cy="62" rx="46" ry="16" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
          <path d="M38 58C36 42 42 32 60 32C78 32 84 42 82 58C82 65 72 68 60 68C48 68 38 65 38 58Z" fill="#29140B" />
          <ellipse cx="60" cy="38" rx="16" ry="6" fill="#451A03" />
          <path d="M52 40C52 48 50 62 48 64C46 66 54 67 60 67C64 67 68 64 66 58C64 52 64 42 62 40" fill="#1C0A00" />
          <circle cx="78" cy="56" r="9" fill="#FEF3C7" />
          <path d="M60 30C63 25 68 28 64 33Z" fill="#16A34A" />
        </svg>
      </div>
    );
  }

  // DEFAULT FALLBACK: Food Service Cloche
  return (
    <div className={`relative overflow-hidden bg-gradient-to-b from-slate-800/20 via-slate-750/10 to-purple-950/20 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 120 90" className="w-full h-full object-cover p-2" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="60" cy="74" rx="38" ry="12" fill="#E2E8F0" />
        <path d="M32 58C32 38 44 26 60 26C76 26 88 38 88 58Z" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="2" />
        <circle cx="60" cy="22" r="4" fill="#64748B" />
        <rect x="26" y="58" width="68" height="4" rx="2" fill="#64748B" />
        <path d="M42 46C44 38 52 32 60 32" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
      </svg>
    </div>
  );
};
