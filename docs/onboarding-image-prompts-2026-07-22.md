# Scout onboarding artwork prompts

Date: 22 July 2026  
Generator: OpenAI built-in image generation  
Output: transparent 640 by 640 PNG assets for Flutter mobile onboarding.

Existing Scout artwork was supplied only as an identity and illustration-style reference. Each request created a new pose and scene. A flat magenta background was requested so it could be removed cleanly before export.

## 1. Stretch your budget

**Final asset:** `mobile/assets/onboarding/scout-budget.png`

**Prompt:**

> Use case: illustration-story. Asset: mobile onboarding hero for the promise “Stretch your budget”. Use the supplied Scout mascot references only for exact character identity and visual style. Create a brand-new illustration of the same friendly trolley mascot comparing two grocery price tags while holding a small calculator. Preserve the clock face, expressive face, white gloves, green shopping basket, red neckerchief, and trolley wheels. Polished 2D retro South African grocery-ad illustration with warm textured print character. Full character centered, readable at small mobile size, with generous safe margins and no crop. Background must be one perfectly uniform flat chroma-key magenta color, #ff00ff, edge to edge. New pose and composition. No copy. Preserve the mascot identity exactly. No shadows, gradients, textures, reflections, floor, lighting effects, or colour variation in the background. Do not use magenta anywhere in the character or props. Crisp silhouette and clean edges. No text, numbers, brand logos, watermark, or extra characters.

## 2. Window shop the deals

**Final asset:** `mobile/assets/onboarding/scout-window.png`

**Prompt:**

> Use case: illustration-story. Asset: mobile onboarding hero for the promise “Window shop the deals”. Use the supplied Scout mascot references only for exact character identity and visual style. Create a brand-new illustration of the same friendly trolley mascot joyfully browsing grocery deals on a smartphone, one gloved hand holding the phone and the other swiping, with compact green headphones. Preserve the clock face, expressive face, white gloves, green shopping basket, red neckerchief, and trolley wheels. The phone may show simple unlabeled grocery-card shapes only. Polished 2D retro South African grocery-ad illustration with warm textured print character. Full character centered, readable at small mobile size, with generous safe margins and no crop. Background must be one perfectly uniform flat chroma-key magenta color, #ff00ff, edge to edge. New pose and composition. No copy. Preserve the mascot identity exactly. No shadows, gradients, textures, reflections, floor, lighting effects, or colour variation in the background. Do not use magenta anywhere in the character or props. Crisp silhouette and clean edges. No text, prices, numbers, brand logos, watermark, or extra characters.

## 3. Bring the savings home

**Final asset:** `mobile/assets/onboarding/scout-home.png`

**Prompt:**

> Use case: illustration-story. Asset: mobile onboarding hero for the promise “Bring the savings home”. Use the supplied Scout mascot references only for exact character identity and visual style. Create a brand-new illustration of the same friendly trolley mascot proudly presenting a small cream-and-green model house in both white-gloved hands. Preserve the clock face, expressive face, white gloves, green shopping basket, red neckerchief, and trolley wheels. The house is a simple secondary prop. Polished 2D retro South African grocery-ad illustration with warm textured print character. Full character centered, readable at small mobile size, with generous safe margins and no crop. Background must be one perfectly uniform flat chroma-key magenta color, #ff00ff, edge to edge. New pose and composition. No copy. Preserve the mascot identity exactly. No shadows, gradients, textures, reflections, floor, lighting effects, or colour variation in the background. Do not use magenta anywhere in the character or props. Crisp silhouette and clean edges. No text, numbers, brand logos, watermark, or extra characters.

## Production treatment

The generated magenta field was removed with the image-generation skill’s chroma-key helper, then each result was resized to 640 by 640 RGBA PNG. The transparent corners were checked before the assets were wired into the signed-out Flutter flow.
