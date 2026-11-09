import type { Config } from "tailwindcss";

/*
  Tokens de marca
  papel   #F7F7F5  fondo: blanco hueso frío, sin tono crema
  muro    #ECEBE7  superficie de fotografía y bloques
  linea   #D8D6D1  divisiones
  piedra  #8A8782  texto terciario
  grafito #4B4A47  texto secundario
  tinta   #000000  texto principal
  sello   #2E4A3A  verde de autenticación: solo para estados verificados
*/
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        papel: "#f7f7f5",
        muro: "#ecebe7",
        linea: "#d8d6d1",
        piedra: "#8a8782",
        grafito: "#4b4a47",
        tinta: "#000000",
        sello: "#2e4a3a",
      },
      fontFamily: {
        display: ["var(--font-display)", "Didot", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        display: ["clamp(2.75rem, 6.2vw, 5.75rem)", { lineHeight: "0.98" }],
        title: ["clamp(1.75rem, 3vw, 2.5rem)", { lineHeight: "1.1" }],
      },
      aspectRatio: { "4/5": "4 / 5" },
    },
  },
  plugins: [],
};
export default config;
