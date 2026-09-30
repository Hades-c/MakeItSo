/** @type {import('postcss').Config} */
const config = {
  // Tailwind 4: CSS-first config lives in app/globals.css (no tailwind.config.ts). Vendor prefixing is built in.
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
