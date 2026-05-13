/**
 * Public GLB paths under /models — Vite serves `public/` at site root.
 */
export const MODELS = {
  male: {
    tshirt: '/models/male/tshirt.glb',
    longSleeve: '/models/male/male_long_sleeve_shirt.glb',
    collarButtonDown: '/models/male/collar_button_down_shirt.glb',
    shirtBaked: '/models/male/shirt_baked.glb',
  },
  female: {
    buttonShirt: '/models/female/female_button_shirt.glb',
    girlsShirt: '/models/female/girls_shirt.glb',
    longShirt: '/models/female/long_female_shirt.glb',
    tshirt: '/models/female/tshirt_for_female.glb',
  },
} as const
