/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { forest: "#176B45", lime: "#C8F169", ink: "#18251D", muted: "#69746D", canvas: "#F7F8F4" }, fontFamily: { sans: ["DM Sans", "sans-serif"], display: ["Manrope", "sans-serif"] } } },
  plugins: []
};
